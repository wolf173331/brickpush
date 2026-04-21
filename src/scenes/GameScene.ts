import {
  Scene,
  EntityBuilder,
  UIEntityBuilder,
  globalEventBus,
  globalTheme,
  globalTweens,
  InputSystem,
  TransformComponent,
  SpriteComponent,
  TextComponent,
  TRANSFORM_COMPONENT,
  SPRITE_COMPONENT,
  TEXT_COMPONENT,
  Easing,
  Time,
  KEYS,
  getScreenCategory,
} from 'agent-gamedev';
import type { IWorld, EntityId, SceneTransitionData } from 'agent-gamedev';
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  GRID_COLS,
  GRID_ROWS,
  TILE_SIZE,
  CELL_EMPTY,
  CELL_WALL,
  CELL_BLOCK,
  CELL_STAR_BLOCK,
  CELL_HEART_BLOCK,
  CELL_BOMB,
  CELL_ENEMY_SPAWN,
  CELL_P1_SPAWN,
  CELL_P2_SPAWN,
  CELL_PLAYER,
  CELL_ITEM,
  CELL_SAFE,
  PLAYER_MOVE_COOLDOWN,
  PLAYER_MAX_HP,
  PLAYER_PUSH_DISTANCE,
  PLAYER_MAX_PUSH_DISTANCE,
  ENEMY_TYPE_FROG,
  ENEMY_TEXTURES,
  SCORE_HEART_MERGE,
  SCORE_WALL_BREAK,
  calcTimeBonusScore,
  READY_DURATION,
  ENEMY_SPAWN_ACTIVATE_DELAY,
  TIME_LIMIT_SECONDS,
  getLevelTimeLimit,
  Z_WALL,
  Z_BLOCK,
  Z_ENEMY,
  Z_PLAYER,
  Z_UI_POPUP,
  Z_SCORE_POPUP,
  PALETTE,
  LEVELS,
  getCurrentLevelIndex,
  setCurrentLevelIndex,
  ASSETS,
  gridToWorld,
  gridKey,
  inBounds,
  isNpcSquirrelEnabled,
  NPC_HP,
  NPC_MOVE_COOLDOWN_MIN,
  MULTIPLAYER_FRAME_INTERVAL,
} from '../config';
import { getRunHp, getRunScore, setRunHp, setRunScore } from '../gameProgress';
import { gameAudio } from '../audio';
import type { PlayerState, EnemyState, NpcState, BombState, GamePhase, VictoryType, Player2State } from '../entity/types';
import { parseLevel, createFloor } from '../game/GridSystem';
import { resolveEnemySpawnCells, getEnemyMoveCooldown } from '../game/EnemySpawner';
import { checkHeartsConnected } from '../game/WinCondition';
import {
  killEnemyScore as _killEnemyScore, spawnScorePopup as _spawnScorePopup,
  damagePlayer as _damagePlayer, damageNpc as _damageNpc,
  type ComboState,
} from '../game/CombatSystem';
import {
  createHUD as _createHUD, createReadyOverlay as _createReadyOverlay,
  updateHUD as _updateHUD,
  type HudEntities,
} from '../game/HudSystem';
import {
  isPushable, calculatePushPath,
  destroyWallAt, spawnBreakEffect, spawnItemAt, clearItemAt,
  pushBlock as _pushBlock, explodeSingleBomb as _explodeSingleBomb,
  pushBombUntilCollision as _pushBombUntilCollision,
  handleEdgePush as _handleEdgePush, collectItem as _collectItem,
  type BlockContext,
} from '../game/BlockSystem';
import { updateEnemies as _updateEnemies, type EnemyAIContext } from '../game/EnemyAI';
import { updateNpc as _updateNpc, tryPushNpc as _tryPushNpc, type NpcContext } from '../game/NpcController';
import { multiplayerState } from '../network/MultiplayerState';
import type { PlayerAction } from '../network/types';
import { seedRandom, type RandomGenerator } from '../network/DeterministicRandom';

const W = GAME_WIDTH;
const H = GAME_HEIGHT;

export class GameScene extends Scene {
  readonly name = 'GameScene';

  // ---- Grid state ----
  private grid: number[][] = [];
  private entityMap: Map<string, EntityId> = new Map();
  private itemDecorationMap: Map<string, EntityId[]> = new Map();
  private safeZones: Set<string> = new Set();
  private outerGrassZones: Set<string> = new Set();

  // ---- Entities ----
  private player: PlayerState | null = null;
  private player2: Player2State | null = null;
  private npc: NpcState | null = null;
  private enemies: EnemyState[] = [];
  private bombs: BombState[] = [];

  // ---- HUD entity references ----
  private hudEntities: HudEntities = {
    hpEntity: 0 as EntityId,
    scoreDisplayEntity: 0 as EntityId,
    timeDisplayEntity: 0 as EntityId,
    levelDisplayEntity: 0 as EntityId,
    heartStatusEntity: 0 as EntityId,
    enemyCountEntity: 0 as EntityId,
    scoreEntity: 0 as EntityId,
    collectEntity: 0 as EntityId,
    readyEntity: 0 as EntityId,
  };
  private readyEntity: EntityId = 0;

  // ---- Combo (delegated to CombatSystem) ----
  private combo: ComboState = { count: 0, timer: 0 };
  private get comboCount(): number { return this.combo.count; }
  private set comboCount(v: number) { this.combo.count = v; }
  private get comboTimer(): number { return this.combo.timer; }
  private set comboTimer(v: number) { this.combo.timer = v; }

  // ---- Non-grid entities (floor, background, effects, etc.) ----
  private nonGridEntities?: Set<EntityId>;

  // ---- Phase & Level ----
  private phase: GamePhase = 'ready';
  private readyTimer = READY_DURATION;
  private completeTimer = 0;
  private victoryType: VictoryType = 'none';
  private currentLevelIndex: number = 0;
  private timeLeft: number = TIME_LIMIT_SECONDS;
  private completionHandled = false;

  // ---- Wave system ----
  private totalWaves = 1;
  private enemiesPerWave = 3;
  private currentWave = 0;
  private waveEnemyTypeIndex = 0;
  private nextWaveTimer = 0;
  private readonly WAVE_INTERVAL = 18;

  // ---- Touch ----
  private touchDir: { dc: number; dr: number } | null = null;
  private touchHandlers: Array<{ evt: string; fn: () => void }> = [];

  // ---- Victory UI entities ----
  private victoryUIEntities: EntityId[] = [];

  // ---- Idle animation ----
  private idleTimer = 0;
  private idleFrame = 0;

  // ---- Multiplayer / lockstep ----
  private isMultiplayer = false;
  private rng: RandomGenerator = Math.random;
  private lockstepAccumulator = 0;

  // ---- Context builders per i moduli ----
  private get blockCtx(): BlockContext {
    return {
      grid: this.grid, entityMap: this.entityMap, itemDecorationMap: this.itemDecorationMap,
      safeZones: this.safeZones, outerGrassZones: this.outerGrassZones,
      bombs: this.bombs, enemies: this.enemies, player: this.player,
      isActive: this.isActive, phase: this.phase,
      trackEntity: (eid) => this.trackEntity(eid),
      findEnemyAt: (c, r) => this.findEnemyAt(c, r),
      destroyEnemy: (world, enemy) => this.destroyEnemy(world, enemy),
      damagePlayer: (world) => this.damagePlayer(world),
      combo: this.combo,
    };
  }

  private get enemyAICtx(): EnemyAIContext {
    return {
      grid: this.grid, entityMap: this.entityMap,
      player: this.player, npc: this.npc, enemies: this.enemies,
      findEnemyAt: (c, r) => this.findEnemyAt(c, r),
      damagePlayer: (world) => this.damagePlayer(world),
      damageNpc: (world, npc) => this.damageNpc(world, npc),
      rng: this.rng,
    };
  }

  private get npcCtx(): NpcContext {
    return {
      grid: this.grid, enemies: this.enemies,
      findEnemyAt: (c, r) => this.findEnemyAt(c, r),
      pushBlock: (world, fC, fR, tC, tR, ct) => this.pushBlock(world, fC, fR, tC, tR, ct),
      crushEnemy: (world, p, enemy) => this.crushEnemy(world, p, enemy),
      movePlayerTo: (world, p, tc, tr) => this.movePlayerTo(world, p, tc, tr),
      rng: this.rng,
    };
  }

  onEnter(world: IWorld, _data?: SceneTransitionData): void {
    globalTheme.setTheme('retro');
    this.currentLevelIndex = getCurrentLevelIndex();
    this.isMultiplayer = multiplayerState.isMultiplayer;

    if (this.isMultiplayer) {
      const seeded = seedRandom(multiplayerState.gameSeed);
      this.rng = seeded.random;
    } else {
      this.rng = Math.random;
    }

    this.resetState();
    this.timeLeft = getLevelTimeLimit(this.currentLevelIndex, Math.max(LEVELS.length, 1));
    this.registerNextLevelHandler(world);
    this.parseLevel();
    this.createFloor(world);
    this.createEntitiesFromGrid(world);
    this.createHUD(world);
    this.createReadyOverlay(world);
    this.createTouchControls(world);

    if (this.isMultiplayer) {
      this.lockstepAccumulator = 0;
      multiplayerState.lockstep?.start();
      multiplayerState.lockstep?.prefetchEmptyFrames(4);
    }
  }

  private registerNextLevelHandler(world: IWorld): void {
    const nextLevelHandler = () => {
      this.goToNextLevel(world);
    };
    globalEventBus.on('custom:nextlevel', nextLevelHandler);
    this.touchHandlers.push({ evt: 'custom:nextlevel', fn: nextLevelHandler });
  }

  // ------------------------------------------------------------------
  // Reset
  // ------------------------------------------------------------------
  private resetState(): void {
    this.grid = [];
    this.entityMap.clear();
    this.itemDecorationMap.clear();
    this.safeZones.clear();
    this.outerGrassZones.clear();
    if (this.nonGridEntities) {
      this.nonGridEntities.clear();
    }
    this.player = null;
    this.player2 = null;
    this.npc = null;
    this.enemies = [];
    this.bombs = [];
    this.phase = 'ready';
    this.readyTimer = READY_DURATION;
    this.completeTimer = 0;
    this.victoryType = 'none';
    this.timeLeft = TIME_LIMIT_SECONDS;
    this.touchDir = null;
    this.touchHandlers = [];
    this.victoryUIEntities = [];
    this.comboCount = 0;
    this.comboTimer = 0;
    this.combo = { count: 0, timer: 0 };
    this.totalWaves = 1;
    this.enemiesPerWave = 3;
    this.currentWave = 0;
    this.waveEnemyTypeIndex = 0;
    this.nextWaveTimer = 0;
    this.lockstepAccumulator = 0;
  }

  // ------------------------------------------------------------------
  // Parse level into grid
  // ------------------------------------------------------------------
  private parseLevel(): void {
    parseLevel({ grid: this.grid, safeZones: this.safeZones, outerGrassZones: this.outerGrassZones, trackEntity: (eid) => this.trackEntity(eid) }, this.currentLevelIndex);
  }

  private createFloor(world: IWorld): void {
    createFloor(world, { grid: this.grid, safeZones: this.safeZones, outerGrassZones: this.outerGrassZones, trackEntity: (eid) => this.trackEntity(eid) });
  }

  // ------------------------------------------------------------------
  // Create entities from grid data
  // ------------------------------------------------------------------
  private createEntitiesFromGrid(world: IWorld): void {
    const levelData = LEVELS[this.currentLevelIndex];
    this.totalWaves = levelData?.enemyWaves ?? 1;
    this.enemiesPerWave = levelData?.enemiesPerWave ?? 3;
    this.currentWave = 0;
    this.waveEnemyTypeIndex = 0;

    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const raw = this.grid[r][c];
        const pos = gridToWorld(c, r);

        if (raw === CELL_WALL) {
          const eid = EntityBuilder.create(world, W, H)
            .withTransform({ x: pos.x, y: pos.y })
            .withSprite({ textureId: ASSETS.WALL, width: TILE_SIZE, height: TILE_SIZE, zIndex: Z_WALL })
            .build();
          this.trackEntity(eid);
          this.entityMap.set(gridKey(c, r), eid);
        }

        if (raw === CELL_BLOCK || raw === CELL_STAR_BLOCK || raw === CELL_HEART_BLOCK) {
          const tex = raw === CELL_STAR_BLOCK ? ASSETS.STAR_BLOCK
            : raw === CELL_HEART_BLOCK ? ASSETS.HEART_BLOCK : ASSETS.BLOCK;
          const eid = EntityBuilder.create(world, W, H)
            .withTransform({ x: pos.x, y: pos.y })
            .withSprite({ textureId: tex, width: TILE_SIZE, height: TILE_SIZE, zIndex: Z_BLOCK })
            .build();
          this.trackEntity(eid);
          this.entityMap.set(gridKey(c, r), eid);
        }

        if (raw === CELL_BOMB) {
          const eid = EntityBuilder.create(world, W, H)
            .withTransform({ x: pos.x, y: pos.y })
            .withSprite({ textureId: ASSETS.BOMB_BLOCK, width: TILE_SIZE, height: TILE_SIZE, zIndex: Z_BLOCK })
            .build();
          this.trackEntity(eid);
          this.entityMap.set(gridKey(c, r), eid);
          this.bombs.push({ col: c, row: r, entity: eid, exploded: false });
        }

        if (raw === CELL_P1_SPAWN) {
          const eid = EntityBuilder.create(world, W, H)
            .withTransform({ x: pos.x, y: pos.y })
            .withSprite({ textureId: ASSETS.PLAYER1, width: TILE_SIZE, height: TILE_SIZE, zIndex: Z_PLAYER })
            .build();
          this.trackEntity(eid);
          this.grid[r][c] = CELL_PLAYER;
          this.player = {
            col: c, row: r, entity: eid,
            moving: false, cooldown: 0, score: getRunScore(), collectibles: 0,
            hp: Math.min(getRunHp(), PLAYER_MAX_HP),
            damageCooldown: 0, isInvincible: false,
            pushDistance: PLAYER_PUSH_DISTANCE, canBreakWalls: false,
            inputLockTimer: 0,
          };

          if (!this.isMultiplayer && isNpcSquirrelEnabled()) {
            const nc = c + 1;
            const nr = r;
            if (inBounds(nc, nr) && this.grid[nr][nc] === CELL_EMPTY) {
              const npcPos = gridToWorld(nc, nr);
              const neid = EntityBuilder.create(world, W, H)
                .withTransform({ x: npcPos.x, y: npcPos.y })
                .withSprite({ textureId: ASSETS.PLAYER2, width: TILE_SIZE, height: TILE_SIZE, zIndex: Z_PLAYER })
                .build();
              this.trackEntity(neid);
              this.grid[nr][nc] = CELL_PLAYER;
              this.npc = {
                col: nc, row: nr, entity: neid,
                hp: NPC_HP, cooldown: NPC_MOVE_COOLDOWN_MIN,
                stunTimer: 0, moving: false,
                damageCooldown: 0, isInvincible: false,
              };
            }
          }
        }

        if (raw === CELL_P2_SPAWN && this.isMultiplayer) {
          const eid = EntityBuilder.create(world, W, H)
            .withTransform({ x: pos.x, y: pos.y })
            .withSprite({ textureId: ASSETS.PLAYER2, width: TILE_SIZE, height: TILE_SIZE, zIndex: Z_PLAYER })
            .build();
          this.trackEntity(eid);
          this.grid[r][c] = CELL_PLAYER;
          this.player2 = {
            col: c, row: r, entity: eid,
            moving: false, cooldown: 0, score: 0, collectibles: 0,
            hp: PLAYER_MAX_HP,
            damageCooldown: 0, isInvincible: false,
            pushDistance: PLAYER_PUSH_DISTANCE, canBreakWalls: false,
            inputLockTimer: 0,
          };
        }

        if (raw === CELL_ENEMY_SPAWN) {
          this.grid[r][c] = CELL_EMPTY;
        }
      }
    }
  }


  /** 刷出下一波敌人 */
  private spawnNextWave(world: IWorld): void {
    if (this.currentWave >= this.totalWaves) return;
    this.currentWave++;

    const levelData = LEVELS[this.currentLevelIndex];
    const seq = levelData?.enemySequence ?? [ENEMY_TYPE_FROG];
    const count = this.enemiesPerWave;

    const types: number[] = [];
    for (let i = 0; i < count; i++) {
      types.push(seq[this.waveEnemyTypeIndex % seq.length]);
      this.waveEnemyTypeIndex++;
    }

    this.spawnEnemies(world, types, false);

    if (this.currentWave < this.totalWaves) {
      this.nextWaveTimer = this.WAVE_INTERVAL;
    }
  }

  private spawnEnemies(world: IWorld, enemyTypes: number[], activate = false): void {
    if (enemyTypes.length === 0) return;

    const spawnCells = this.resolveEnemySpawnCells(enemyTypes.length);
    for (let i = 0; i < enemyTypes.length; i++) {
      const type = enemyTypes[i];
      const spawn = spawnCells[i];
      const pos = gridToWorld(spawn.col, spawn.row);
      const textureId = activate
        ? (ENEMY_TEXTURES[type] ?? ASSETS.ENEMY_FROG)
        : ASSETS.ENEMY_INACTIVE;
      const eid = EntityBuilder.create(world, W, H)
        .withTransform({ x: pos.x, y: pos.y })
        .withSprite({ textureId, width: TILE_SIZE, height: TILE_SIZE, zIndex: Z_ENEMY })
        .build();
      this.trackEntity(eid);
      this.grid[spawn.row][spawn.col] = CELL_ENEMY_SPAWN;
      this.enemies.push({
        col: spawn.col, row: spawn.row, entity: eid,
        type, active: activate, moveCooldown: getEnemyMoveCooldown(type, this.rng),
        stunTimer: 0,
        activateTimer: activate ? 0 : ENEMY_SPAWN_ACTIVATE_DELAY,
        dying: false,
      });
    }
  }

  private resolveEnemySpawnCells(count: number): Array<{ col: number; row: number }> {
    return resolveEnemySpawnCells({
      grid: this.grid,
      playerCol: this.player?.col ?? 7,
      playerRow: this.player?.row ?? 6,
      levelIndex: this.currentLevelIndex,
    }, count);
  }

  // ------------------------------------------------------------------
  // HUD
  // ------------------------------------------------------------------
  private createHUD(world: IWorld): void {
    const initHp = this.player?.hp ?? getRunHp();
    this.hudEntities = _createHUD(world, this.currentLevelIndex, initHp, (eid) => this.trackEntity(eid));
  }

  private createReadyOverlay(world: IWorld): void {
    this.readyEntity = _createReadyOverlay(world, (eid) => this.trackEntity(eid));
  }

  // ------------------------------------------------------------------
  // Touch controls
  // ------------------------------------------------------------------
  private createTouchControls(world: IWorld): void {
    const screen = getScreenCategory(W, H);
    if (screen.category === 'desktop' || screen.category === 'large') return;

    const BTN = 80;
    const dirs = [
      { label: '▲', x: BTN + 10, y: -(BTN * 2 + 20), dc: 0, dr: -1 },
      { label: '▼', x: BTN + 10, y: -20, dc: 0, dr: 1 },
      { label: '◀', x: 10, y: -(BTN + 20), dc: -1, dr: 0 },
      { label: '▶', x: BTN * 2 + 10, y: -(BTN + 20), dc: 1, dr: 0 },
    ];

    for (const d of dirs) {
      const evtName = `touch:dir:${d.dc}:${d.dr}`;
      this.trackEntity(
        UIEntityBuilder.create(world, W, H)
          .withUITransform({ anchor: 'bottom-left', x: d.x, y: d.y, width: BTN, height: BTN, alpha: 0.5 })
          .withButton({ label: d.label, onClick: evtName, borderRadius: 8 })
          .build()
      );
      const handler = () => { this.touchDir = { dc: d.dc, dr: d.dr }; };
      globalEventBus.on(evtName, handler);
      this.touchHandlers.push({ evt: evtName, fn: handler });
    }
  }

  // ------------------------------------------------------------------
  // update
  // ------------------------------------------------------------------
  update(world: IWorld, _deltaTime: number): void {
    const dt = Time.deltaTime;

    if (this.phase === 'ready') {
      this.readyTimer -= dt;
      if (this.readyTimer <= 0) {
        this.phase = 'playing';
        this.activateEnemies(world);
        this.hideReady(world);
      }
      return;
    }

    if (this.phase === 'playing') {
      if (this.isMultiplayer) {
        this.updateMultiplayer(world, dt);
      } else {
        this.updateSinglePlayer(world, dt);
      }
      return;
    }

    if (this.phase === 'complete') {
      this.completeTimer -= dt;
      if (this.completeTimer <= 0 && !this.completionHandled) {
        this.completionHandled = true;
        const hasNextLevel = LEVELS.length > 0 && this.currentLevelIndex < LEVELS.length - 1;
        if (this.victoryType === 'none' || !hasNextLevel) {
          const score = this.getResolvedScore();
          setRunScore(score);
          globalEventBus.emit('scene:gameover', {
            score,
            victoryType: this.victoryType,
            levelName: LEVELS[this.currentLevelIndex]?.name ?? `ROUND-${this.currentLevelIndex + 1}`,
            canSubmitScore: score > 0,
          });
        }
      }
    }
  }

  private updateSinglePlayer(world: IWorld, dt: number): void {
    this.syncRunProgress();
    if (this.timeLeft > 0) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.gameOver(world, 'time');
      }
    }

    this.updateEnemies(world, dt);
    this.updateWaves(world, dt);
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.comboCount = 0;
    }
    this.handlePlayerInput(world, dt);
    this.updateNpc(world, dt);
    this.updateHUD(world);
    this.checkComplete(world);
    this.updateIdleAnimations(world, dt);
  }

  private updateMultiplayer(world: IWorld, dt: number): void {
    this.lockstepAccumulator += dt;

    // 收集本地输入并发送
    const lockstep = multiplayerState.lockstep;
    if (lockstep) {
      const localActions = this.collectLocalInput(world);
      const packet = lockstep.recordLocalInput(localActions);
      if (multiplayerState.peer?.isOpen) {
        const msg: PlayerAction[] = packet.actions;
        multiplayerState.peer.send(JSON.stringify({
          type: 'input',
          frame: packet.frame,
          playerId: multiplayerState.localPlayerId,
          actions: msg,
        }));
      }
    }

    // 尝试推进 lockstep 帧
    while (lockstep && lockstep.canAdvance() && this.lockstepAccumulator >= MULTIPLAYER_FRAME_INTERVAL) {
      this.lockstepAccumulator -= MULTIPLAYER_FRAME_INTERVAL;
      const frameInputs = lockstep.advance();
      if (frameInputs) {
        this.applyLockstepFrame(world, MULTIPLAYER_FRAME_INTERVAL, frameInputs);
      }
    }

    // 若长时间没有推进，进行平滑的 HUD 更新（不推进游戏逻辑）
    this.updateHUD(world);

    // 超时检测
    if (multiplayerState.peer && !multiplayerState.peer.isOpen && multiplayerState.connected) {
      multiplayerState.cleanup();
      this.showDisconnectText(world);
      setTimeout(() => globalEventBus.emit('scene:menu'), 2000);
    }
  }

  private collectLocalInput(world: IWorld): PlayerAction[] {
    const p = multiplayerState.localPlayerId === 0 ? this.player : this.player2;
    if (!p) return [{ type: 'none' }];

    if (p.damageCooldown > 0) { p.damageCooldown -= Time.deltaTime; if (p.damageCooldown <= 0) p.isInvincible = false; }
    if (p.inputLockTimer > 0) { p.inputLockTimer -= Time.deltaTime; return [{ type: 'none' }]; }
    if (p.cooldown > 0) { p.cooldown -= Time.deltaTime; return [{ type: 'none' }]; }
    if (p.moving) return [{ type: 'none' }];

    const input = world.getSystem<InputSystem>('InputSystem');
    if (!input) return [{ type: 'none' }];

    let dc = 0; let dr = 0;
    if (multiplayerState.localPlayerId === 0) {
      if (input.isKeyDown(KEYS.W) || input.isKeyDown(KEYS.UP)) dr = -1;
      else if (input.isKeyDown(KEYS.S) || input.isKeyDown(KEYS.DOWN)) dr = 1;
      else if (input.isKeyDown(KEYS.A) || input.isKeyDown(KEYS.LEFT)) dc = -1;
      else if (input.isKeyDown(KEYS.D) || input.isKeyDown(KEYS.RIGHT)) dc = 1;
    } else {
      if (input.isKeyDown(KEYS.UP)) dr = -1;
      else if (input.isKeyDown(KEYS.DOWN)) dr = 1;
      else if (input.isKeyDown(KEYS.LEFT)) dc = -1;
      else if (input.isKeyDown(KEYS.RIGHT)) dc = 1;
    }

    if (dc === 0 && dr === 0 && this.touchDir) {
      dc = this.touchDir.dc; dr = this.touchDir.dr; this.touchDir = null;
    }

    if (dc !== 0 || dr !== 0) {
      return [{ type: 'move', dc, dr }];
    }
    return [{ type: 'none' }];
  }

  private applyLockstepFrame(world: IWorld, dt: number, frameInputs: { frame: number; inputs: Map<0 | 1, PlayerAction[]> }): void {
    this.syncRunProgress();
    if (this.timeLeft > 0) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.gameOver(world, 'time');
        return;
      }
    }

    this.updateEnemies(world, dt);
    this.updateWaves(world, dt);
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.comboCount = 0;
    }

    // 应用玩家输入
    const pids: Array<0 | 1> = [0, 1];
    for (const pid of pids) {
      const actions = frameInputs.inputs.get(pid);
      if (!actions) continue;
      for (const action of actions) {
        if (action.type === 'move') {
          if (pid === 0 && this.player) {
            this.tryMovePlayer(world, this.player, action.dc, action.dr);
          } else if (pid === 1 && this.player2) {
            this.tryMovePlayer2(world, this.player2, action.dc, action.dr);
          }
        }
      }
    }

    this.updateNpc(world, dt);
    this.checkComplete(world);
    this.updateIdleAnimations(world, dt);
  }

  private showDisconnectText(world: IWorld): void {
    const eid = UIEntityBuilder.create(world, W, H)
      .withUITransform({ anchor: 'center', y: -20, width: 500, height: 80 })
      .withText({ text: '连接已断开', fontSize: 40, color: 0xff4444, align: 'center', zIndex: Z_UI_POPUP })
      .build();
    this.trackEntity(eid);
    this.victoryUIEntities.push(eid);
  }

  // ------------------------------------------------------------------
  // Activate enemies
  // ------------------------------------------------------------------
  private activateEnemies(world: IWorld): void {
    this.spawnNextWave(world);
  }

  private hideReady(world: IWorld): void {
    if (this.readyEntity) {
      world.destroyEntity(this.readyEntity);
    }
  }

  // ------------------------------------------------------------------
  // Player input (single player)
  // ------------------------------------------------------------------
  private handlePlayerInput(world: IWorld, dt: number): void {
    if (this.isMultiplayer) return;
    const p = this.player;
    if (!p) return;

    if (p.damageCooldown > 0) {
      p.damageCooldown -= dt;
      if (p.damageCooldown <= 0) {
        p.isInvincible = false;
      }
    }

    if (p.inputLockTimer > 0) {
      p.inputLockTimer -= dt;
      return;
    }

    if (p.cooldown > 0) { p.cooldown -= dt; return; }
    if (p.moving) return;

    const input = world.getSystem<InputSystem>('InputSystem');
    if (!input) return;

    let dc = 0;
    let dr = 0;

    if (input.isKeyDown(KEYS.W) || input.isKeyDown(KEYS.UP)) dr = -1;
    else if (input.isKeyDown(KEYS.S) || input.isKeyDown(KEYS.DOWN)) dr = 1;
    else if (input.isKeyDown(KEYS.A) || input.isKeyDown(KEYS.LEFT)) dc = -1;
    else if (input.isKeyDown(KEYS.D) || input.isKeyDown(KEYS.RIGHT)) dc = 1;

    if (dc === 0 && dr === 0 && this.touchDir) {
      dc = this.touchDir.dc;
      dr = this.touchDir.dr;
      this.touchDir = null;
    }

    if (dc !== 0 || dr !== 0) {
      this.tryMovePlayer(world, p, dc, dr);
    }
  }

  // ------------------------------------------------------------------
  // Try to move player (P1)
  // ------------------------------------------------------------------
  private tryMovePlayer(world: IWorld, p: PlayerState, dc: number, dr: number): void {
    const tc = p.col + dc;
    const tr = p.row + dr;
    if (!inBounds(tc, tr)) return;

    const targetCell = this.grid[tr][tc];

    const enemy = this.findEnemyAt(tc, tr);
    if (enemy) {
      if (!enemy.active) {
        // inactive enemy: pass through
      } else {
        this.damagePlayer(world);
        p.cooldown = PLAYER_MOVE_COOLDOWN;
        return;
      }
    }

    if (this.npc && this.npc.col === tc && this.npc.row === tr) {
      if (p.canBreakWalls && !this.npc.isInvincible) {
        this.tryPushNpc(world, p, tc, tr, dc, dr);
      } else {
        p.cooldown = PLAYER_MOVE_COOLDOWN;
      }
      return;
    }

    if (targetCell === CELL_EMPTY || targetCell === CELL_SAFE) {
      this.movePlayerTo(world, p, tc, tr);
      return;
    }

    if (targetCell === CELL_ITEM) {
      this.collectItem(world, p, tc, tr);
      this.movePlayerTo(world, p, tc, tr);
      return;
    }

    if (targetCell === CELL_WALL && p.canBreakWalls) {
      p.score += SCORE_WALL_BREAK;
      this.spawnScorePopup(world, tc, tr, SCORE_WALL_BREAK, PALETTE.BREAK_WHITE);
      this.destroyWallAt(world, tc, tr);
      this.spawnBreakEffect(world, tc, tr, 0x333333);
      this.movePlayerTo(world, p, tc, tr);
      return;
    }

    if (targetCell === CELL_BOMB) {
      this.pushBombUntilCollision(world, p, tc, tr, dc, dr);
      return;
    }

    if (this.isPushable(targetCell)) {
      const { finalC, finalR, distance } = this.calculatePushPath(tc, tr, dc, dr, p.pushDistance);

      if (distance > 0) {
        for (let i = 1; i <= distance; i++) {
          const checkC = tc + dc * i;
          const checkR = tr + dr * i;
          const enemyInPath = this.findEnemyAt(checkC, checkR);
          if (enemyInPath) {
            this.crushEnemy(world, p, enemyInPath);
          }
        }
        this.pushBlock(world, tc, tr, finalC, finalR, targetCell);
        this.movePlayerTo(world, p, tc, tr);
        return;
      } else {
        this.handleEdgePush(world, p, tc, tr, targetCell, dc, dr);
        return;
      }
    }
  }

  // ------------------------------------------------------------------
  // Try to move player 2 (multiplayer)
  // ------------------------------------------------------------------
  private tryMovePlayer2(world: IWorld, p2: Player2State, dc: number, dr: number): void {
    const tc = p2.col + dc;
    const tr = p2.row + dr;
    if (!inBounds(tc, tr)) return;

    const targetCell = this.grid[tr][tc];

    const enemy = this.findEnemyAt(tc, tr);
    if (enemy) {
      if (!enemy.active) {
        // pass through
      } else {
        this.damagePlayer(world); // shared HP
        p2.cooldown = PLAYER_MOVE_COOLDOWN;
        return;
      }
    }

    if (this.player && this.player.col === tc && this.player.row === tr) {
      p2.cooldown = PLAYER_MOVE_COOLDOWN;
      return;
    }

    if (targetCell === CELL_EMPTY || targetCell === CELL_SAFE) {
      this.movePlayer2To(world, p2, tc, tr);
      return;
    }

    if (targetCell === CELL_ITEM) {
      this.collectItemAsPlayer2(world, p2, tc, tr);
      this.movePlayer2To(world, p2, tc, tr);
      return;
    }

    if (targetCell === CELL_WALL && p2.canBreakWalls) {
      if (this.player) this.player.score += SCORE_WALL_BREAK;
      this.spawnScorePopup(world, tc, tr, SCORE_WALL_BREAK, PALETTE.BREAK_WHITE);
      this.destroyWallAt(world, tc, tr);
      this.spawnBreakEffect(world, tc, tr, 0x333333);
      this.movePlayer2To(world, p2, tc, tr);
      return;
    }

    if (targetCell === CELL_BOMB) {
      this.pushBombUntilCollisionPlayer2(world, p2, tc, tr, dc, dr);
      return;
    }

    if (this.isPushable(targetCell)) {
      const { finalC, finalR, distance } = this.calculatePushPath(tc, tr, dc, dr, p2.pushDistance);

      if (distance > 0) {
        for (let i = 1; i <= distance; i++) {
          const checkC = tc + dc * i;
          const checkR = tr + dr * i;
          const enemyInPath = this.findEnemyAt(checkC, checkR);
          if (enemyInPath && this.player) {
            this.crushEnemy(world, this.player, enemyInPath);
          }
        }
        this.pushBlock(world, tc, tr, finalC, finalR, targetCell);
        this.movePlayer2To(world, p2, tc, tr);
        return;
      } else {
        this.handleEdgePushPlayer2(world, p2, tc, tr, targetCell, dc, dr);
        return;
      }
    }
  }

  private movePlayer2To(world: IWorld, p2: Player2State, tc: number, tr: number): void {
    const dc = tc - p2.col;
    const dr = tr - p2.row;
    this.grid[p2.row][p2.col] = this.safeZones.has(gridKey(p2.col, p2.row)) ? CELL_SAFE : CELL_EMPTY;
    this.grid[tr][tc] = CELL_PLAYER;

    p2.col = tc;
    p2.row = tr;
    p2.cooldown = PLAYER_MOVE_COOLDOWN;
    p2.moving = true;
    gameAudio.playWalk();

    const target = gridToWorld(tc, tr);
    const transform = world.getComponent<TransformComponent>(p2.entity, TRANSFORM_COMPONENT);
    if (transform) {
      transform.x = target.x;
      transform.y = target.y;
      this.animateMoveTransform(transform, target.x, target.y, dc, dr, PLAYER_MOVE_COOLDOWN);
      setTimeout(() => { p2.moving = false; }, Math.round(PLAYER_MOVE_COOLDOWN * 1000));
    } else {
      p2.moving = false;
    }
  }


  // ---- BlockSystem delegates ----
  private isPushable(cell: number): boolean { return isPushable(cell); }
  private calculatePushPath(sC: number, sR: number, dc: number, dr: number, max: number) { return calculatePushPath(this.blockCtx, sC, sR, dc, dr, max); }
  private destroyWallAt(world: IWorld, c: number, r: number) { destroyWallAt(world, this.blockCtx, c, r); }
  private spawnBreakEffect(world: IWorld, c: number, r: number, color: number) { spawnBreakEffect(world, this.blockCtx, c, r, color); }
  private spawnItemAt(world: IWorld, c: number, r: number, tex: string) { spawnItemAt(world, this.blockCtx, c, r, tex); }
  private pushBlock(world: IWorld, fC: number, fR: number, tC: number, tR: number, ct: number) { return _pushBlock(world, this.blockCtx, fC, fR, tC, tR, ct); }
  private pushBombUntilCollision(world: IWorld, p: PlayerState, bC: number, bR: number, dc: number, dr: number) {
    _pushBombUntilCollision(world, this.blockCtx, p, bC, bR, dc, dr, (w, pl, tc, tr) => this.movePlayerTo(w, pl, tc, tr));
  }
  private pushBombUntilCollisionPlayer2(world: IWorld, p2: Player2State, bC: number, bR: number, dc: number, dr: number) {
    _pushBombUntilCollision(world, this.blockCtx, this.player!, bC, bR, dc, dr, (w, _pl, tc, tr) => this.movePlayer2To(w, p2, tc, tr));
  }
  private handleEdgePush(world: IWorld, p: PlayerState, bC: number, bR: number, ct: number, _dc: number, _dr: number) {
    _handleEdgePush(world, this.blockCtx, p, bC, bR, ct, (w, pl, tc, tr) => this.movePlayerTo(w, pl, tc, tr), (w, c, r, v, col) => this.spawnScorePopup(w, c, r, v, col));
  }
  private handleEdgePushPlayer2(world: IWorld, p2: Player2State, bC: number, bR: number, ct: number, _dc: number, _dr: number) {
    _handleEdgePush(world, this.blockCtx, this.player!, bC, bR, ct, (w, _pl, tc, tr) => this.movePlayer2To(w, p2, tc, tr), (w, c, r, v, col) => this.spawnScorePopup(w, c, r, v, col));
  }
  private collectItem(world: IWorld, p: PlayerState, c: number, r: number) {
    _collectItem(world, this.blockCtx, p, c, r, (w, c2, r2, v, col) => this.spawnScorePopup(w, c2, r2, v, col), (w, c2, r2, t, col) => this.spawnPowerupText(w, c2, r2, t, col));
  }
  private collectItemAsPlayer2(world: IWorld, p2: Player2State, c: number, r: number) {
    if (!this.player) return;
    const key = gridKey(c, r);
    const itemEntity = this.entityMap.get(key);
    if (itemEntity !== undefined) {
      const sprite = world.getComponent<SpriteComponent>(itemEntity, SPRITE_COMPONENT);
      if (sprite && sprite.textureId === ASSETS.PUSH_POWERUP) {
        p2.pushDistance = Math.min(p2.pushDistance + 1, PLAYER_MAX_PUSH_DISTANCE);
        p2.canBreakWalls = true;
        this.spawnPowerupText(world, c, r, '推力+1 / 可碎墙!', 0xff8800);
        gameAudio.playCoin();
        clearItemAt(world, this.blockCtx, c, r);
        return;
      }
      gameAudio.playCoin();
    }
    clearItemAt(world, this.blockCtx, c, r);
  }
  private killEnemyScore(world: IWorld, p: PlayerState, ec: number, er: number) {
    _killEnemyScore(world, p, this.combo, ec, er, (eid) => this.trackEntity(eid));
  }

  // ------------------------------------------------------------------
  // Move player entity to new grid cell
  // ------------------------------------------------------------------
  private movePlayerTo(world: IWorld, p: PlayerState, tc: number, tr: number): void {
    const dc = tc - p.col;
    const dr = tr - p.row;
    this.grid[p.row][p.col] = this.safeZones.has(gridKey(p.col, p.row)) ? CELL_SAFE : CELL_EMPTY;
    this.grid[tr][tc] = CELL_PLAYER;

    p.col = tc;
    p.row = tr;
    p.cooldown = PLAYER_MOVE_COOLDOWN;
    p.moving = true;
    gameAudio.playWalk();

    const target = gridToWorld(tc, tr);
    const transform = world.getComponent<TransformComponent>(p.entity, TRANSFORM_COMPONENT);
    if (transform) {
      transform.x = target.x;
      transform.y = target.y;
      this.animateMoveTransform(transform, target.x, target.y, dc, dr, PLAYER_MOVE_COOLDOWN);
      setTimeout(() => { p.moving = false; }, Math.round(PLAYER_MOVE_COOLDOWN * 1000));
    } else {
      p.moving = false;
    }
  }

  private animateMoveTransform(
    transform: TransformComponent,
    _targetX: number,
    targetY: number,
    dc: number,
    dr: number,
    duration: number
  ): void {
    if (dc !== 0 && dr === 0) {
      // 左右移动：弹跳 + 挤压拉伸 + 倾斜
      globalTweens.to(transform, { y: targetY - 5 }, { duration: duration * 0.35, easing: Easing.easeOutQuad });
      globalTweens.to(transform, { y: targetY }, { duration: duration * 0.65, easing: Easing.easeOutSine, delay: duration * 0.35 });

      globalTweens.to(transform, { scaleX: 0.8, scaleY: 1.15 }, { duration: duration * 0.25, easing: Easing.easeOutQuad });
      globalTweens.to(transform, { scaleX: 1.06, scaleY: 0.96 }, { duration: duration * 0.35, easing: Easing.easeInOutQuad, delay: duration * 0.25 });
      globalTweens.to(transform, { scaleX: 1.0, scaleY: 1.0 }, { duration: duration * 0.4, easing: Easing.easeOutQuad, delay: duration * 0.6 });

      const rotDir = dc < 0 ? -0.14 : 0.14;
      globalTweens.to(transform, { rotation: rotDir }, { duration: duration * 0.3, easing: Easing.easeOutQuad });
      globalTweens.to(transform, { rotation: 0 }, { duration: duration * 0.7, easing: Easing.easeOutSine, delay: duration * 0.3 });
    } else if (dr !== 0 && dc === 0) {
      // 上下移动：zoom in/out + 扭动
      globalTweens.to(transform, { scaleX: 1.14, scaleY: 1.14 }, { duration: duration * 0.25, easing: Easing.easeOutQuad });
      globalTweens.to(transform, { scaleX: 0.94, scaleY: 0.94 }, { duration: duration * 0.3, easing: Easing.easeInQuad, delay: duration * 0.25 });
      globalTweens.to(transform, { scaleX: 1.0, scaleY: 1.0 }, { duration: duration * 0.45, easing: Easing.easeOutSine, delay: duration * 0.55 });

      const wiggle = dr < 0 ? 0.1 : -0.1;
      globalTweens.to(transform, { rotation: wiggle }, { duration: duration * 0.2, easing: Easing.easeOutQuad, yoyo: true, repeat: 1 });
      globalTweens.to(transform, { rotation: 0 }, { duration: duration * 0.4, easing: Easing.easeOutQuad, delay: duration * 0.4 });
    } else {
      // 对角线：简单呼吸
      globalTweens.to(transform, { scaleX: 1.08, scaleY: 1.08 }, { duration: duration * 0.3, easing: Easing.easeOutQuad });
      globalTweens.to(transform, { scaleX: 1.0, scaleY: 1.0 }, { duration: duration * 0.7, easing: Easing.easeOutSine, delay: duration * 0.3 });
    }
  }

  // ------------------------------------------------------------------
  // Crush enemy (block push)
  // ------------------------------------------------------------------
  private crushEnemy(world: IWorld, p: PlayerState, enemy: EnemyState): void {
    this.killEnemyScore(world, p, enemy.col, enemy.row);
    enemy.dying = true;
    const idx = this.enemies.indexOf(enemy);
    if (idx >= 0) this.enemies.splice(idx, 1);
    if (this.grid[enemy.row][enemy.col] !== CELL_HEART_BLOCK &&
        this.grid[enemy.row][enemy.col] !== CELL_BLOCK &&
        this.grid[enemy.row][enemy.col] !== CELL_STAR_BLOCK &&
        this.grid[enemy.row][enemy.col] !== CELL_BOMB) {
      this.grid[enemy.row][enemy.col] = CELL_EMPTY;
    }

    const transform = world.getComponent<TransformComponent>(enemy.entity, TRANSFORM_COMPONENT);
    const sprite = world.getComponent<SpriteComponent>(enemy.entity, SPRITE_COMPONENT);

    if (transform) {
      globalTweens.to(transform, { scaleX: 2.2, scaleY: 0.15 }, {
        duration: 0.08,
        easing: Easing.easeOutQuad,
        onComplete: () => {
          globalTweens.to(transform, { scaleX: 1.8, scaleY: 0.25 }, {
            duration: 0.1,
            easing: Easing.easeOutQuad,
            onComplete: () => {
              if (sprite) {
                globalTweens.to(sprite, { alpha: 0 }, {
                  duration: 0.35,
                  easing: Easing.easeInQuad,
                  onComplete: () => {
                    world.destroyEntity(enemy.entity);
                    this.maybeDropItem(world, enemy.col, enemy.row, enemy.type);
                  },
                });
              } else {
                world.destroyEntity(enemy.entity);
                this.maybeDropItem(world, enemy.col, enemy.row, enemy.type);
              }
            },
          });
        },
      });
    } else {
      world.destroyEntity(enemy.entity);
      this.maybeDropItem(world, enemy.col, enemy.row, enemy.type);
    }
  }

  private destroyEnemy(world: IWorld, enemy: EnemyState): void {
    world.destroyEntity(enemy.entity);
    const idx = this.enemies.indexOf(enemy);
    if (idx >= 0) this.enemies.splice(idx, 1);
    if (this.grid[enemy.row][enemy.col] !== CELL_HEART_BLOCK &&
      this.grid[enemy.row][enemy.col] !== CELL_BLOCK &&
      this.grid[enemy.row][enemy.col] !== CELL_STAR_BLOCK &&
      this.grid[enemy.row][enemy.col] !== CELL_BOMB) {
      this.grid[enemy.row][enemy.col] = CELL_EMPTY;
    }
  }

  private maybeDropItem(world: IWorld, c: number, r: number, enemyType?: number): void {
    if (this.grid[r][c] !== CELL_EMPTY) return;
    if (enemyType !== undefined && enemyType !== ENEMY_TYPE_FROG) return;
    this.spawnItemAt(world, c, r, ASSETS.ITEM_YELLOW);
  }

  private spawnScorePopup(world: IWorld, c: number, r: number, value: number, color: number, label?: string): void {
    _spawnScorePopup(world, c, r, value, color, label, (eid) => this.trackEntity(eid));
  }

  // ------------------------------------------------------------------
  // Spawn powerup text
  // ------------------------------------------------------------------
  private spawnPowerupText(world: IWorld, c: number, r: number, text: string, color: number): void {
    const pos = gridToWorld(c, r);
    const eid = EntityBuilder.create(world, W, H)
      .withTransform({ x: pos.x, y: pos.y })
      .withText({
        text: text,
        fontSize: 22,
        color,
        align: 'center',
        zIndex: Z_SCORE_POPUP
      })
      .build();
    this.trackEntity(eid);

    const transform = world.getComponent<TransformComponent>(eid, TRANSFORM_COMPONENT);
    if (transform) {
      globalTweens.to(transform, { y: pos.y - 60 }, {
        duration: 1.2,
        easing: Easing.easeOutQuad,
        onComplete: () => { world.destroyEntity(eid); },
      });
    }
    const textComp = world.getComponent<TextComponent>(eid, TEXT_COMPONENT);
    if (textComp) {
      globalTweens.to(textComp, { alpha: 0 }, { duration: 1.2, easing: Easing.linear });
    }
  }

  // ------------------------------------------------------------------
  // Enemy AI
  // ------------------------------------------------------------------
  private updateEnemies(world: IWorld, dt: number) { _updateEnemies(world, this.enemyAICtx, dt); }

  // ------------------------------------------------------------------
  // NPC Squirrel AI
  // ------------------------------------------------------------------
  private updateNpc(world: IWorld, dt: number) { if (this.npc) _updateNpc(world, this.npcCtx, this.npc, dt); }
  private tryPushNpc(world: IWorld, p: PlayerState, npcC: number, npcR: number, dc: number, dr: number) { if (this.npc) _tryPushNpc(world, this.npcCtx, p, this.npc, npcC, npcR, dc, dr); }
  private damageNpc(world: IWorld, npc: NpcState) { _damageNpc(world, npc); }

  private findEnemyAt(c: number, r: number): EnemyState | null {
    for (const e of this.enemies) {
      if (e.col === c && e.row === r && e.active && !e.dying) return e;
    }
    return null;
  }

  private updateWaves(world: IWorld, dt: number): void {
    if (this.currentWave >= this.totalWaves) return;
    if (this.nextWaveTimer <= 0) return;
    this.nextWaveTimer -= dt;
    if (this.nextWaveTimer <= 0) this.spawnNextWave(world);
  }

  // ------------------------------------------------------------------
  // Idle ear-wiggle animation (2-frame cycle)
  // ------------------------------------------------------------------
  private updateIdleAnimations(world: IWorld, dt: number): void {
    const INTERVAL = 0.35; // seconds per frame
    const p = this.player;
    const p2 = this.player2;

    let anyIdle = false;
    if (p && !p.moving && p.cooldown <= 0) anyIdle = true;
    if (p2 && !p2.moving && p2.cooldown <= 0) anyIdle = true;

    if (!anyIdle) {
      // Reset to normal immediately when moving
      this.idleTimer = 0;
      if (this.idleFrame !== 0) {
        this.idleFrame = 0;
        this.setPlayerTexture(world, p, ASSETS.PLAYER1);
        this.setPlayer2Texture(world, p2, ASSETS.PLAYER2);
      }
      return;
    }

    this.idleTimer += dt;
    if (this.idleTimer >= INTERVAL) {
      this.idleTimer -= INTERVAL;
      this.idleFrame = (this.idleFrame + 1) % 4; // 0→1→2→1→0 cycle
      const frameMap = [0, 1, 0, 2]; // normal, left, normal, right
      const frame = frameMap[this.idleFrame];

      const p1Tex = frame === 1 ? ASSETS.PLAYER1_IDLE_L : frame === 2 ? ASSETS.PLAYER1_IDLE_R : ASSETS.PLAYER1;
      const p2Tex = frame === 1 ? ASSETS.PLAYER2_IDLE_L : frame === 2 ? ASSETS.PLAYER2_IDLE_R : ASSETS.PLAYER2;

      this.setPlayerTexture(world, p, p1Tex);
      this.setPlayer2Texture(world, p2, p2Tex);
    }
  }

  private setPlayerTexture(world: IWorld, p: PlayerState | null, tex: string): void {
    if (!p) return;
    const sprite = world.getComponent<SpriteComponent>(p.entity, SPRITE_COMPONENT);
    if (sprite) sprite.textureId = tex;
  }

  private setPlayer2Texture(world: IWorld, p2: Player2State | null, tex: string): void {
    if (!p2) return;
    const sprite = world.getComponent<SpriteComponent>(p2.entity, SPRITE_COMPONENT);
    if (sprite) sprite.textureId = tex;
  }

  // ------------------------------------------------------------------
  // HUD update
  // ------------------------------------------------------------------
  private updateHUD(world: IWorld): void {
    _updateHUD(world, this.hudEntities, this.player, this.enemies, this.timeLeft, this.currentLevelIndex, this.grid);
  }

  // ------------------------------------------------------------------
  // Heart victory
  // ------------------------------------------------------------------
  private checkHeartsConnected(): boolean { return checkHeartsConnected(this.grid); }

  // ------------------------------------------------------------------
  // Damage player
  // ------------------------------------------------------------------
  private damagePlayer(world: IWorld): void {
    if (!this.player) return;
    setRunHp(this.player.hp - 1);
    _damagePlayer(world, this.player, () => this.gameOver(world, 'hp'));
    setRunHp(this.player.hp);
  }

  private getResolvedScore(): number {
    return Math.max(this.player?.score ?? 0, getRunScore());
  }

  private syncRunProgress(): void {
    setRunScore(this.getResolvedScore());
    if (this.player) {
      setRunHp(this.player.hp);
    }
  }

  // ------------------------------------------------------------------
  // Game over
  // ------------------------------------------------------------------
  private gameOver(world: IWorld, reason: 'hp' | 'time'): void {
    if (this.phase !== 'playing') return;
    this.phase = 'complete';
    this.victoryType = 'none';
    this.completeTimer = 0;
    const text = reason === 'hp' ? 'GAME OVER' : '时间到!';
    this.showGameOverText(world, text);
    setTimeout(() => {
      if (!this.isActive) return;
      const score = this.getResolvedScore();
      setRunScore(score);
      globalEventBus.emit('scene:gameover', {
        score,
        victoryType: 'defeat',
        levelName: LEVELS[this.currentLevelIndex]?.name ?? `ROUND-${this.currentLevelIndex + 1}`,
        canSubmitScore: score > 0,
      });
    }, 1500);
  }

  private showGameOverText(world: IWorld, text: string): void {
    const eid = UIEntityBuilder.create(world, W, H)
      .withUITransform({ anchor: 'center', y: -20, width: 500, height: 80 })
      .withText({ text, fontSize: 52, color: 0xff4444, align: 'center', zIndex: Z_UI_POPUP })
      .build();
    this.trackEntity(eid);
    this.victoryUIEntities.push(eid);
  }

  // ------------------------------------------------------------------
  // Check completion
  // ------------------------------------------------------------------
  private checkComplete(world: IWorld): void {
    if (this.phase !== 'playing') return;
    const levelClearBonus = this.currentLevelIndex + 1;
    if (this.checkHeartsConnected()) {
      this.phase = 'complete';
      this.victoryType = 'hearts';
      const totalTime = getLevelTimeLimit(this.currentLevelIndex, Math.max(LEVELS.length, 1));
      const timeBonus = calcTimeBonusScore(this.timeLeft, totalTime);
      if (this.player) this.player.score += SCORE_HEART_MERGE + levelClearBonus + timeBonus;
      if (timeBonus > 0) this.spawnScorePopup(world, 7, 5, timeBonus, 0x00ffcc, `⏱ TIME +${timeBonus}`);
      this.syncRunProgress();
      this.completeTimer = 2.5;
      gameAudio.playVictory();
      this.showVictoryText(world, '♥ 心心集合! ♥');
    }
  }

  private showVictoryText(world: IWorld, text: string): void {
    this.victoryUIEntities = [];
    const levelName = LEVELS.length > 0 && this.currentLevelIndex < LEVELS.length
      ? LEVELS[this.currentLevelIndex].name
      : `ROUND-${this.currentLevelIndex + 1}`;
    const victoryText = `${levelName} CLEAR`;

    const textEid = UIEntityBuilder.create(world, W, H)
      .withUITransform({ anchor: 'center', y: -100, width: 600, height: 80 })
      .withText({
        text: victoryText,
        fontSize: 52,
        color: PALETTE.LEVEL_COMPLETE_GOLD,
        align: 'center',
        zIndex: Z_UI_POPUP,
      })
      .build();
    this.trackEntity(textEid);
    this.victoryUIEntities.push(textEid);

    const descEid = UIEntityBuilder.create(world, W, H)
      .withUITransform({ anchor: 'center', y: -30, width: 400, height: 40 })
      .withText({
        text,
        fontSize: 28,
        color: PALETTE.HEART_RED,
        align: 'center',
        zIndex: Z_UI_POPUP,
      })
      .build();
    this.trackEntity(descEid);
    this.victoryUIEntities.push(descEid);

    const hasNextLevel = LEVELS.length > 0 && this.currentLevelIndex < LEVELS.length - 1;

    if (hasNextLevel) {
      const nextLevelBtn = UIEntityBuilder.create(world, W, H)
        .withUITransform({ anchor: 'center', y: 60, width: 200, height: 50 })
        .withButton({
          label: '下一关',
          onClick: 'custom:nextlevel',
          borderRadius: 8
        })
        .build();
      this.trackEntity(nextLevelBtn);
      this.victoryUIEntities.push(nextLevelBtn);
    }

    const menuBtn = UIEntityBuilder.create(world, W, H)
      .withUITransform({ anchor: 'center', y: hasNextLevel ? 130 : 60, width: 200, height: 50 })
      .withButton({ label: '回到主菜单', onClick: 'scene:menu', borderRadius: 8 })
      .build();
    this.trackEntity(menuBtn);
    this.victoryUIEntities.push(menuBtn);
  }

  private goToNextLevel(world: IWorld): void {
    if (this.currentLevelIndex >= LEVELS.length - 1) return;
    if (this.phase !== 'complete') return;
    this.phase = 'ready';
    this.cleanupAllEntities(world);
    setRunScore(this.getResolvedScore());
    setRunHp(this.player?.hp ?? getRunHp());
    this.currentLevelIndex++;
    setCurrentLevelIndex(this.currentLevelIndex);
    this.resetState();
    this.timeLeft = getLevelTimeLimit(this.currentLevelIndex, Math.max(LEVELS.length, 1));
    this.registerNextLevelHandler(world);
    this.parseLevel();
    this.createFloor(world);
    this.createEntitiesFromGrid(world);
    this.createHUD(world);
    this.createReadyOverlay(world);
    this.createTouchControls(world);
    this.phase = 'ready';
    this.readyTimer = READY_DURATION;
    this.completionHandled = false;
  }

  // ------------------------------------------------------------------
  // Cleanup all entities
  // ------------------------------------------------------------------
  private cleanupAllEntities(world: IWorld): void {
    this.cleanupVictoryUI(world);
    this.destroyTrackedEntities(world);
    if (this.nonGridEntities) {
      this.nonGridEntities.clear();
    }
    this.entityMap.clear();
    this.bombs = [];
    this.enemies = [];
    this.player = null;
    this.player2 = null;
    this.safeZones.clear();
    this.grid = [];
    this.hudEntities = { hpEntity: 0 as EntityId, scoreDisplayEntity: 0 as EntityId, timeDisplayEntity: 0 as EntityId, levelDisplayEntity: 0 as EntityId, heartStatusEntity: 0 as EntityId, enemyCountEntity: 0 as EntityId, scoreEntity: 0 as EntityId, collectEntity: 0 as EntityId, readyEntity: 0 as EntityId };
    this.readyEntity = 0;
  }

  // ------------------------------------------------------------------
  // Track entity for cleanup
  // ------------------------------------------------------------------
  protected override trackEntity(eid: EntityId): void {
    super.trackEntity(eid);
    if (!this.nonGridEntities) {
      this.nonGridEntities = new Set<EntityId>();
    }
    this.nonGridEntities.add(eid);
  }

  // ------------------------------------------------------------------
  // Cleanup victory UI
  // ------------------------------------------------------------------
  private cleanupVictoryUI(world: IWorld): void {
    for (const eid of this.victoryUIEntities) {
      world.destroyEntity(eid);
    }
    this.victoryUIEntities = [];
  }

  // ------------------------------------------------------------------
  // onExit
  // ------------------------------------------------------------------
  onExit(world: IWorld): void {
    for (const h of this.touchHandlers) {
      globalEventBus.off(h.evt, h.fn);
    }
    this.touchHandlers = [];
    this.grid = [];
    this.entityMap.clear();
    this.safeZones.clear();
    this.player = null;
    this.player2 = null;
    this.enemies = [];
    this.bombs = [];
    this.phase = 'ready';
    this.readyTimer = READY_DURATION;
    this.completeTimer = 0;
    this.victoryType = 'none';
    this.timeLeft = TIME_LIMIT_SECONDS;
    this.completionHandled = false;
    this.touchDir = null;
    if (this.isMultiplayer) {
      multiplayerState.cleanup();
    }
    super.onExit(world);
  }

  // ------------------------------------------------------------------
  // Modify push distance (for power-ups)
  // ------------------------------------------------------------------
  public modifyPushDistance(distance: number): void {
    if (this.player) {
      const newDistance = Math.max(1, Math.min(distance, PLAYER_MAX_PUSH_DISTANCE));
      this.player.pushDistance = newDistance;
      console.log(`Push distance changed to ${newDistance}`);
    }
  }

  // ------------------------------------------------------------------
  // Reset push distance to default
  // ------------------------------------------------------------------
  public resetPushDistance(): void {
    if (this.player) {
      this.player.pushDistance = PLAYER_PUSH_DISTANCE;
    }
  }
}
