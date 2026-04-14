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
  CELL_PLAYER,
  CELL_ITEM,
  CELL_SAFE,
  PLAYER_MOVE_COOLDOWN,
  PLAYER_MOVE_TWEEN_DURATION,
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
} from '../config';
import { getRunHp, getRunScore, setRunHp, setRunScore } from '../gameProgress';
import { gameAudio } from '../audio';
import type { PlayerState, EnemyState, NpcState, BombState, GamePhase, VictoryType } from '../entity/types';
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
  destroyBlockAt, destroyWallAt, spawnBreakEffect, spawnItemAt, clearItemAt,
  pushBlock as _pushBlock, explodeSingleBomb as _explodeSingleBomb,
  pushBombUntilCollision as _pushBombUntilCollision,
  handleEdgePush as _handleEdgePush, collectItem as _collectItem,
  type BlockContext,
} from '../game/BlockSystem';
import { updateEnemies as _updateEnemies, type EnemyAIContext } from '../game/EnemyAI';
import { updateNpc as _updateNpc, tryPushNpc as _tryPushNpc, type NpcContext } from '../game/NpcController';

const W = GAME_WIDTH;
const H = GAME_HEIGHT;

// ---- State interfaces ----

// ---- Helpers ----

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
  private currentWave = 0;          // 已刷出的波数
  private waveEnemyTypeIndex = 0;   // enemySequence 游标
  private nextWaveTimer = 0;        // 距下一波刷新的倒计时
  private readonly WAVE_INTERVAL = 18; // 每波间隔秒数

  // ---- Touch ----
  private touchDir: { dc: number; dr: number } | null = null;
  private touchHandlers: Array<{ evt: string; fn: () => void }> = [];

  // ---- Victory UI entities ----
  private victoryUIEntities: EntityId[] = [];

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
    return {
      grid: this.grid, entityMap: this.entityMap,
      player: this.player, npc: this.npc, enemies: this.enemies,
      findEnemyAt: (c, r) => this.findEnemyAt(c, r),
      damagePlayer: (world) => this.damagePlayer(world),
      damageNpc: (world, npc) => this.damageNpc(world, npc),
    };
  }

  private get npcCtx(): NpcContext {
    return {
      grid: this.grid, enemies: this.enemies,
      findEnemyAt: (c, r) => this.findEnemyAt(c, r),
      pushBlock: (world, fC, fR, tC, tR, ct) => this.pushBlock(world, fC, fR, tC, tR, ct),
      crushEnemy: (world, p, enemy) => this.crushEnemy(world, p, enemy),
      movePlayerTo: (world, p, tc, tr) => this.movePlayerTo(world, p, tc, tr),
    };
  }
  onEnter(world: IWorld, _data?: SceneTransitionData): void {
    globalTheme.setTheme('retro');
    this.currentLevelIndex = getCurrentLevelIndex();

    this.resetState();
    this.timeLeft = getLevelTimeLimit(this.currentLevelIndex, Math.max(LEVELS.length, 1));
    this.registerNextLevelHandler(world);
    this.parseLevel();
    this.createFloor(world);
    this.createEntitiesFromGrid(world);
    this.createHUD(world);
    this.createReadyOverlay(world);
    this.createTouchControls(world);
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
    // 读取关卡波次配置
    const levelData = LEVELS[this.currentLevelIndex];
    this.totalWaves = levelData?.enemyWaves ?? 1;
    this.enemiesPerWave = levelData?.enemiesPerWave ?? 3;
    this.currentWave = 0;
    this.waveEnemyTypeIndex = 0;

    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const raw = this.grid[r][c];
        const pos = gridToWorld(c, r);

        // Walls
        if (raw === CELL_WALL) {
          const eid = EntityBuilder.create(world, W, H)
            .withTransform({ x: pos.x, y: pos.y })
            .withSprite({ textureId: ASSETS.WALL, width: TILE_SIZE, height: TILE_SIZE, zIndex: Z_WALL })
            .build();
          this.trackEntity(eid);
          this.entityMap.set(gridKey(c, r), eid);
        }

        // Blocks (normal / star / heart)
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

        // Bombs
        if (raw === CELL_BOMB) {
          const eid = EntityBuilder.create(world, W, H)
            .withTransform({ x: pos.x, y: pos.y })
            .withSprite({ textureId: ASSETS.BOMB_BLOCK, width: TILE_SIZE, height: TILE_SIZE, zIndex: Z_BLOCK })
            .build();
          this.trackEntity(eid);
          this.entityMap.set(gridKey(c, r), eid);
          this.bombs.push({ col: c, row: r, entity: eid, exploded: false });
        }

        // Player spawn
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

          // 松鼠 NPC：生成在玩家右边一格
          if (isNpcSquirrelEnabled()) {
            const nc = c + 1;
            const nr = r;
            if (inBounds(nc, nr) && this.grid[nr][nc] === CELL_EMPTY) {
              const npcPos = gridToWorld(nc, nr);
              const neid = EntityBuilder.create(world, W, H)
                .withTransform({ x: npcPos.x, y: npcPos.y })
                .withSprite({ textureId: ASSETS.PLAYER2, width: TILE_SIZE, height: TILE_SIZE, zIndex: Z_PLAYER })
                .build();
              this.trackEntity(neid);
              this.grid[nr][nc] = CELL_PLAYER; // 占位
              this.npc = {
                col: nc, row: nr, entity: neid,
                hp: NPC_HP, cooldown: NPC_MOVE_COOLDOWN_MIN,
                stunTimer: 0, moving: false,
                damageCooldown: 0, isInvincible: false,
              };
            }
          }
        }

        // CELL_ENEMY_SPAWN(6) 已从地图移除，忽略
        if (raw === CELL_ENEMY_SPAWN) {
          this.grid[r][c] = CELL_EMPTY;
        }
      }
    }
    // 第一波在 activateEnemies 时刷出
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

    this.spawnEnemies(world, types, false); // 直接激活

    // 设置下一波计时器（最后一波不需要）
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
        type, active: activate, moveCooldown: getEnemyMoveCooldown(type),
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
  // HUD (single-player) - delegates to HudSystem
  // ------------------------------------------------------------------
  private createHUD(world: IWorld): void {
    const initHp = this.player?.hp ?? getRunHp();
    this.hudEntities = _createHUD(world, this.currentLevelIndex, initHp, (eid) => this.trackEntity(eid));
  }
  // ------------------------------------------------------------------
  // READY overlay - delegates to HudSystem
  // ------------------------------------------------------------------
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
      this.syncRunProgress();
      // Update time
      if (this.timeLeft > 0) {
        this.timeLeft -= dt;
        if (this.timeLeft <= 0) {
          this.timeLeft = 0;
          this.gameOver(world, 'time');
        }
      }

      this.updateEnemies(world, dt);
      this.updateWaves(world, dt);
      // combo 窗口计时
      if (this.comboTimer > 0) {
        this.comboTimer -= dt;
        if (this.comboTimer <= 0) this.comboCount = 0;
      }
      this.handlePlayerInput(world, dt);
      this.updateNpc(world, dt);
      this.updateHUD(world);
      this.checkComplete(world);
      return;
    }

    if (this.phase === 'complete') {
      this.completeTimer -= dt;
      if (this.completeTimer <= 0 && !this.completionHandled) {
        this.completionHandled = true;
        const hasNextLevel = LEVELS.length > 0 && this.currentLevelIndex < LEVELS.length - 1;
        // 有下一关时，等待玩家点击"下一关"按钮，不自动跳转
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

  // ------------------------------------------------------------------
  // Activate enemies
  // ------------------------------------------------------------------
  private activateEnemies(world: IWorld): void {
    // 刷出第一波
    this.spawnNextWave(world);
  }

  private hideReady(world: IWorld): void {
    if (this.readyEntity) {
      world.destroyEntity(this.readyEntity);
    }
  }

  // ------------------------------------------------------------------
  // Player input (single player: WASD + Arrows + Touch)
  // ------------------------------------------------------------------
  private handlePlayerInput(world: IWorld, dt: number): void {
    const p = this.player;
    if (!p) return;

    // Update damage cooldown
    if (p.damageCooldown > 0) {
      p.damageCooldown -= dt;
      if (p.damageCooldown <= 0) {
        p.isInvincible = false;
      }
    }

    // 受伤后短暂锁定输入
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

    // WASD
    if (input.isKeyDown(KEYS.W) || input.isKeyDown(KEYS.UP)) dr = -1;
    else if (input.isKeyDown(KEYS.S) || input.isKeyDown(KEYS.DOWN)) dr = 1;
    else if (input.isKeyDown(KEYS.A) || input.isKeyDown(KEYS.LEFT)) dc = -1;
    else if (input.isKeyDown(KEYS.D) || input.isKeyDown(KEYS.RIGHT)) dc = 1;

    // Touch fallback
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
  // Try to move player
  // ------------------------------------------------------------------
  private tryMovePlayer(world: IWorld, p: PlayerState, dc: number, dr: number): void {
    const tc = p.col + dc;
    const tr = p.row + dr;
    if (!inBounds(tc, tr)) return;

    const targetCell = this.grid[tr][tc];

    // ---- 首先检查目标位置是否有敌人 ----
    const enemy = this.findEnemyAt(tc, tr);
    if (enemy) {
      if (!enemy.active) {
        // inactive 敌人（灰球状态）：玩家可以穿过，不扣血
        // 继续往下走正常移动逻辑
      } else {
        // active 敌人：受到伤害，不能移动
        this.damagePlayer(world);
        p.cooldown = PLAYER_MOVE_COOLDOWN;
        return;
      }
    }

    // ---- 检查目标位置是否是 NPC（吃了 powerup 才能推） ----
    if (this.npc && this.npc.col === tc && this.npc.row === tr) {
      if (p.canBreakWalls && !this.npc.isInvincible) {
        this.tryPushNpc(world, p, tc, tr, dc, dr);
      } else {
        // 没有 powerup 或 NPC 在硬直中，不能推
        p.cooldown = PLAYER_MOVE_COOLDOWN;
      }
      return;
    }

    // ---- EMPTY or SAFE: just move ----
    if (targetCell === CELL_EMPTY || targetCell === CELL_SAFE) {
      this.movePlayerTo(world, p, tc, tr);
      return;
    }

    // ---- ITEM: collect and move ----
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

    // ---- Pushable blocks: BLOCK / STAR / HEART ----
    if (this.isPushable(targetCell)) {
      // 计算砖块可以推动的最终位置
      const { finalC, finalR, distance } = this.calculatePushPath(
        tc, tr, dc, dr, p.pushDistance
      );

      if (distance > 0) {
        // 先锁定路径上的敌人（立即 dying，不给移动机会）
        for (let i = 1; i <= distance; i++) {
          const checkC = tc + dc * i;
          const checkR = tr + dr * i;
          const enemyInPath = this.findEnemyAt(checkC, checkR);
          if (enemyInPath) {
            this.crushEnemy(world, p, enemyInPath);
          }
        }

        // 再推动砖块
        this.pushBlock(world, tc, tr, finalC, finalR, targetCell);
        this.movePlayerTo(world, p, tc, tr);
        return;
      } else {
        // 无法推动，使用边缘推动机制
        this.handleEdgePush(world, p, tc, tr, targetCell, dc, dr);
        return;
      }
    }

    // ---- WALL or other: can't move ----
  }

  // ---- BlockSystem delegates (usati internamente da tryMovePlayer e altri) ----
  private isPushable(cell: number): boolean { return isPushable(cell); }
  private calculatePushPath(sC: number, sR: number, dc: number, dr: number, max: number) { return calculatePushPath(this.blockCtx, sC, sR, dc, dr, max); }
  private destroyWallAt(world: IWorld, c: number, r: number) { destroyWallAt(world, this.blockCtx, c, r); }
  private spawnBreakEffect(world: IWorld, c: number, r: number, color: number) { spawnBreakEffect(world, this.blockCtx, c, r, color); }
  private spawnItemAt(world: IWorld, c: number, r: number, tex: string) { spawnItemAt(world, this.blockCtx, c, r, tex); }
  private pushBlock(world: IWorld, fC: number, fR: number, tC: number, tR: number, ct: number) { return _pushBlock(world, this.blockCtx, fC, fR, tC, tR, ct); }
  private pushBombUntilCollision(world: IWorld, p: PlayerState, bC: number, bR: number, dc: number, dr: number) {
    _pushBombUntilCollision(world, this.blockCtx, p, bC, bR, dc, dr, (w, pl, tc, tr) => this.movePlayerTo(w, pl, tc, tr));
  }
  private handleEdgePush(world: IWorld, p: PlayerState, bC: number, bR: number, ct: number, _dc: number, _dr: number) {
    _handleEdgePush(world, this.blockCtx, p, bC, bR, ct, (w, pl, tc, tr) => this.movePlayerTo(w, pl, tc, tr), (w, c, r, v, col) => this.spawnScorePopup(w, c, r, v, col));
  }
  private collectItem(world: IWorld, p: PlayerState, c: number, r: number) {
    _collectItem(world, this.blockCtx, p, c, r, (w, c2, r2, v, col) => this.spawnScorePopup(w, c2, r2, v, col), (w, c2, r2, t, col) => this.spawnPowerupText(w, c2, r2, t, col));
  }
  private killEnemyScore(world: IWorld, p: PlayerState, ec: number, er: number) {
    _killEnemyScore(world, p, this.combo, ec, er, (eid) => this.trackEntity(eid));
  }

  // ------------------------------------------------------------------
  // Move player entity to new grid cell
  // ------------------------------------------------------------------
  private movePlayerTo(world: IWorld, p: PlayerState, tc: number, tr: number): void {
    // 立即更新逻辑状态
    // Restore old cell: safe zone keeps CELL_SAFE, otherwise CELL_EMPTY
    this.grid[p.row][p.col] = this.safeZones.has(gridKey(p.col, p.row)) ? CELL_SAFE : CELL_EMPTY;
    this.grid[tr][tc] = CELL_PLAYER;

    p.col = tc;
    p.row = tr;
    p.cooldown = PLAYER_MOVE_COOLDOWN;
    p.moving = true;
    gameAudio.playWalk();

    // 动画表现：移动实体到新位置
    const target = gridToWorld(tc, tr);
    const transform = world.getComponent<TransformComponent>(p.entity, TRANSFORM_COMPONENT);
    if (transform) {
      // 立即设置最终位置
      transform.x = target.x;
      transform.y = target.y;

      // 添加轻微的弹出效果作为视觉反馈
      // 轻微缩放效果（简单动画，不使用yoyo和repeat）
      const originalScaleX = transform.scaleX;
      const originalScaleY = transform.scaleY;
      globalTweens.to(transform, { scaleX: 1.05, scaleY: 1.05 }, {
        duration: PLAYER_MOVE_TWEEN_DURATION * 0.15,
        easing: Easing.easeOutQuad,
        onComplete: () => {
          globalTweens.to(transform, { scaleX: originalScaleX, scaleY: originalScaleY }, {
            duration: PLAYER_MOVE_TWEEN_DURATION * 0.15,
            easing: Easing.easeInQuad,
            onComplete: () => {
              // 动画完成，可以接受新的移动输入
              p.moving = false;
            }
          });
        }
      });
    } else {
      p.moving = false;
    }
  }

  // ------------------------------------------------------------------
  // Crush enemy (block push)
  // ------------------------------------------------------------------
  private crushEnemy(world: IWorld, p: PlayerState, enemy: EnemyState): void {
    this.killEnemyScore(world, p, enemy.col, enemy.row);

    // 立即标记为 dying，停止碰撞检测和 AI
    enemy.dying = true;
    // 从 enemies 数组移除（不再参与任何逻辑），但实体还在
    const idx = this.enemies.indexOf(enemy);
    if (idx >= 0) this.enemies.splice(idx, 1);
    // 清除网格占位
    if (this.grid[enemy.row][enemy.col] !== CELL_HEART_BLOCK &&
        this.grid[enemy.row][enemy.col] !== CELL_BLOCK &&
        this.grid[enemy.row][enemy.col] !== CELL_STAR_BLOCK &&
        this.grid[enemy.row][enemy.col] !== CELL_BOMB) {
      this.grid[enemy.row][enemy.col] = CELL_EMPTY;
    }

    // 压扁动画：卡通夸张效果
    const transform = world.getComponent<TransformComponent>(enemy.entity, TRANSFORM_COMPONENT);
    const sprite = world.getComponent<SpriteComponent>(enemy.entity, SPRITE_COMPONENT);

    if (transform) {
      // 阶段1：瞬间压扁（宽变大，高变小）
      globalTweens.to(transform, { scaleX: 2.2, scaleY: 0.15 }, {
        duration: 0.08,
        easing: Easing.easeOutQuad,
        onComplete: () => {
          // 阶段2：轻微弹回（还是扁的，但稍微回弹）
          globalTweens.to(transform, { scaleX: 1.8, scaleY: 0.25 }, {
            duration: 0.1,
            easing: Easing.easeOutQuad,
            onComplete: () => {
              // 阶段3：淡出消失
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

    // 清除网格中的敌人位置，设置为空单元格
    // 但需要检查该位置是否已经被其他东西占据（比如正在压过来的方块）
    if (this.grid[enemy.row][enemy.col] !== CELL_HEART_BLOCK &&
      this.grid[enemy.row][enemy.col] !== CELL_BLOCK &&
      this.grid[enemy.row][enemy.col] !== CELL_STAR_BLOCK &&
      this.grid[enemy.row][enemy.col] !== CELL_BOMB) {
      this.grid[enemy.row][enemy.col] = CELL_EMPTY;
    }
  }

  private maybeDropItem(world: IWorld, c: number, r: number, enemyType?: number): void {
    if (this.grid[r][c] !== CELL_EMPTY) return;

    // 只有青蛙怪物（ENEMY_TYPE_FROG）固定掉落黄钻
    if (enemyType !== undefined && enemyType !== ENEMY_TYPE_FROG) {
      return;
    }

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
        // fontStyle: 'bold' // 暂时注释掉，可能不被支持
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
  // ------------------------------------------------------------------
  // NPC Squirrel AI
  // ------------------------------------------------------------------
  // ---- EnemyAI delegates ----
  private updateEnemies(world: IWorld, dt: number) { _updateEnemies(world, this.enemyAICtx, dt); }

  // ---- NpcController delegates ----
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
  // HUD update
  // ------------------------------------------------------------------
  private updateHUD(world: IWorld): void {
    _updateHUD(world, this.hudEntities, this.player, this.enemies, this.timeLeft, this.currentLevelIndex, this.grid);
  }

  // ------------------------------------------------------------------
  // Heart victory - delegates to WinCondition module
  // ------------------------------------------------------------------
  private checkHeartsConnected(): boolean { return checkHeartsConnected(this.grid); }

  // ------------------------------------------------------------------
  // Damage player - delegates to CombatSystem
  // ------------------------------------------------------------------
  private damagePlayer(world: IWorld): void {
    if (!this.player) return;
    setRunHp(this.player.hp - 1); // pre-update for sync
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
  // Check completion (hearts only)
  // ------------------------------------------------------------------
  private checkComplete(world: IWorld): void {
    if (this.phase !== 'playing') return;

    const levelClearBonus = this.currentLevelIndex + 1; // 每关+1分，街机风格

    // 唯一胜利条件：3个心心方块连在一起
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
    // 保存当前胜利UI实体ID，以便后续清除
    this.victoryUIEntities = [];

    // 显示关卡通关文本
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

    // 显示说明文本
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

    // 只在还有下一关时显示"下一关"按钮
    const hasNextLevel = LEVELS.length > 0 && this.currentLevelIndex < LEVELS.length - 1;

    if (hasNextLevel) {
      // 下一关按钮
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

    // 回到主菜单按钮
    const menuBtn = UIEntityBuilder.create(world, W, H)
      .withUITransform({
        anchor: 'center',
        y: hasNextLevel ? 130 : 60,
        width: 200,
        height: 50
      })
      .withButton({
        label: '回到主菜单',
        onClick: 'scene:menu',
        borderRadius: 8
      })
      .build();

    this.trackEntity(menuBtn);
    this.victoryUIEntities.push(menuBtn);
  }

  private goToNextLevel(world: IWorld): void {
    if (this.currentLevelIndex >= LEVELS.length - 1) {
      return;
    }
    // 防止按钮被多次点击重复触发
    if (this.phase !== 'complete') {
      return;
    }
    this.phase = 'ready'; // 立即锁定，防止重入

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
  // Cleanup all entities (including UI)
  // ------------------------------------------------------------------
  private cleanupAllEntities(world: IWorld): void {
    // 清除胜利UI实体
    this.cleanupVictoryUI(world);

    // Use the base Scene tracking list so each entity is destroyed once.
    this.destroyTrackedEntities(world);

    if (this.nonGridEntities) {
      this.nonGridEntities.clear();
    }

    // 清除场景状态
    this.entityMap.clear();
    this.bombs = [];
    this.enemies = [];
    this.player = null;
    this.safeZones.clear();
    this.grid = [];

    // 重置 HUD 实体引用
    this.hudEntities = { hpEntity: 0 as EntityId, scoreDisplayEntity: 0 as EntityId, timeDisplayEntity: 0 as EntityId, levelDisplayEntity: 0 as EntityId, heartStatusEntity: 0 as EntityId, enemyCountEntity: 0 as EntityId, scoreEntity: 0 as EntityId, collectEntity: 0 as EntityId, readyEntity: 0 as EntityId };
    this.readyEntity = 0;
  }

  // ------------------------------------------------------------------
  // Track entity for cleanup
  // ------------------------------------------------------------------
  protected override trackEntity(eid: EntityId): void {
    super.trackEntity(eid);

    // 这个方法用于跟踪实体，以便在清理时销毁
    // 注意：地板实体等不需要网格位置跟踪的实体只通过这个方法跟踪
    // 网格实体（方块、敌人等）还会被添加到entityMap中
    // 我们需要一个额外的集合来跟踪非网格实体
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
    // 移除所有事件监听器
    for (const h of this.touchHandlers) {
      globalEventBus.off(h.evt, h.fn);
    }
    this.touchHandlers = [];

    // 停止所有可能正在运行的tween动画
    // 注意：globalTweens可能没有直接的停止所有方法
    // 但清除状态应该足够

    // 清除所有游戏状态
    this.grid = [];
    this.entityMap.clear();
    this.safeZones.clear();
    this.player = null;
    this.enemies = [];
    this.bombs = [];

    // 重置其他状态
    this.phase = 'ready';
    this.readyTimer = READY_DURATION;
    this.completeTimer = 0;
    this.victoryType = 'none';
    this.timeLeft = TIME_LIMIT_SECONDS;
    this.completionHandled = false;
    this.touchDir = null;
    // 调用父类的onExit
    super.onExit(world);
  }

  // ------------------------------------------------------------------
  // Modify push distance (for power-ups)
  // ------------------------------------------------------------------
  public modifyPushDistance(distance: number): void {
    if (this.player) {
      // 限制推动距离在合理范围内
      const newDistance = Math.max(1, Math.min(distance, PLAYER_MAX_PUSH_DISTANCE));
      this.player.pushDistance = newDistance;

      // 可以添加视觉反馈
      console.log(`Push distance changed to ${newDistance}`);

      // 这里可以添加视觉特效，比如显示提示文字等
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
