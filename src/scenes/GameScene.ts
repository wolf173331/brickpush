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
  UITextComponent,
  TRANSFORM_COMPONENT,
  SPRITE_COMPONENT,
  TEXT_COMPONENT,
  UI_TEXT_COMPONENT,
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
  PLAYER_DAMAGE_COOLDOWN,
  PLAYER_PUSH_DISTANCE,
  PLAYER_MAX_PUSH_DISTANCE,
  ENEMY_MOVE_INTERVAL_MIN,
  ENEMY_MOVE_INTERVAL_MAX,
  ENEMY_TYPE_FROG,
  ENEMY_TYPE_BLOB,
  ENEMY_TYPE_BOW,
  ENEMY_TYPE_GEAR,
  ENEMY_TEXTURES,
  BOMB_EXPLOSION_RANGE,
  SCORE_YELLOW_ITEM,
  SCORE_BLUE_ITEM,
  SCORE_BLOCK_BREAK,
  SCORE_WALL_BREAK,
  SCORE_STAR_BREAK,
  SCORE_HEART_MERGE,
  COMBO_WINDOW,
  COMBO_BASE_KILL,
  COMBO_INCREMENT,
  COMBO_MAX,
  calcTimeBonusScore,
  HEARTS_NEEDED_FOR_WIN,
  READY_DURATION,
  ENEMY_SPAWN_ACTIVATE_DELAY,
  TIME_LIMIT_SECONDS,
  TIME_WARNING_THRESHOLD,
  getLevelTimeLimit,
  Z_FLOOR,
  Z_WALL,
  Z_BLOCK,
  Z_ITEM,
  Z_ENEMY,
  Z_PLAYER,
  Z_UI,
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
  ALL_DIRECTIONS,
  HUD_TOP_Y,
  HUD_PADDING_X,
} from '../constants';
import { getRunHp, getRunScore, setRunHp, setRunScore } from '../gameProgress';
import { gameAudio } from '../audio';

const W = GAME_WIDTH;
const H = GAME_HEIGHT;

// ---- State interfaces ----

interface PlayerState {
  col: number;
  row: number;
  entity: EntityId;
  moving: boolean;
  cooldown: number;
  score: number;
  collectibles: number;
  hp: number;
  damageCooldown: number;
  isInvincible: boolean;
  pushDistance: number; // 当前推动距离
  canBreakWalls: boolean;
  inputLockTimer: number; // 受伤后短暂锁定输入
}

interface EnemyState {
  col: number;
  row: number;
  entity: EntityId;
  type: number;
  active: boolean;
  moveCooldown: number;
  stunTimer: number;
  activateTimer: number; // > 0 时等待激活
}

interface BombState {
  col: number;
  row: number;
  entity: EntityId;
  exploded: boolean;
}

interface SpawnCandidate {
  col: number;
  row: number;
  bucket: number;
  nearbyObstacles: number;
}

type GamePhase = 'ready' | 'playing' | 'complete';
type VictoryType = 'hearts' | 'enemies' | 'none';

// ---- Helpers ----
function randomEnemyCooldown(): number {
  return ENEMY_MOVE_INTERVAL_MIN + Math.random() * (ENEMY_MOVE_INTERVAL_MAX - ENEMY_MOVE_INTERVAL_MIN);
}

function getEnemyMoveCooldown(enemyType: number): number {
  const base = randomEnemyCooldown();

  switch (enemyType) {
    case ENEMY_TYPE_FROG:
      return base * 1.6;   // 慢，随机游荡
    case ENEMY_TYPE_BLOB:
      return base * 1.0;   // 最快，追玩家，约 0.18~0.35s（玩家 0.13s）
    case ENEMY_TYPE_BOW:
      return base * 1.2;   // 中速，会跳过方块
    case ENEMY_TYPE_GEAR:
      return base * 2.0;   // 最慢，但能推方块
    default:
      return base;
  }
}


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
  private enemies: EnemyState[] = [];
  private bombs: BombState[] = [];

  // ---- HUD entity references ----
  private enemyCountEntity: EntityId = 0;
  private heartStatusEntity: EntityId = 0;
  private scoreEntity: EntityId = 0;
  private collectEntity: EntityId = 0;
  private hpEntity: EntityId = 0;
  private scoreDisplayEntity: EntityId = 0;
  private timeDisplayEntity: EntityId = 0;
  private levelDisplayEntity: EntityId = 0;
  private readyEntity: EntityId = 0;

  // ---- Victory UI entities ----
  private victoryUIEntities: EntityId[] = [];

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

  // ---- Combo ----
  private comboCount = 0;       // 当前连杀数
  private comboTimer = 0;       // 距上次杀怪的计时

  // ------------------------------------------------------------------
  // onEnter
  // ------------------------------------------------------------------
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
    // Ensure levels are loaded
    if (LEVELS.length === 0) {
      console.warn('No levels loaded, loading default levels...');
      // Fallback to hardcoded level
      this.parseLevelFromGrid([
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        [1, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 1],
        [1, 11, 6, 2, 4, 2, 0, 0, 0, 2, 0, 2, 6, 11, 1],
        [1, 11, 2, 0, 2, 0, 5, 0, 2, 0, 2, 0, 2, 11, 1],
        [1, 11, 2, 0, 0, 2, 0, 0, 0, 2, 4, 0, 2, 11, 1],
        [1, 11, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 11, 1],
        [1, 11, 0, 0, 0, 0, 0, 7, 0, 0, 0, 0, 0, 11, 1],
        [1, 11, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 11, 1],
        [1, 11, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 11, 1],
        [1, 11, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 11, 1],
        [1, 11, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 11, 1],
        [1, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 1],
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      ]);
      return;
    }

    // Clamp level index to valid range
    const levelIndex = Math.max(0, Math.min(this.currentLevelIndex, LEVELS.length - 1));
    const level = LEVELS[levelIndex];

    this.parseLevelFromGrid(level.grid);
  }

  private parseLevelFromGrid(levelGrid: number[][]): void {
    for (let r = 0; r < GRID_ROWS; r++) {
      this.grid[r] = [];
      for (let c = 0; c < GRID_COLS; c++) {
        const cell = levelGrid[r][c];
        const isOuterRing = r === 0 || r === GRID_ROWS - 1 || c === 0 || c === GRID_COLS - 1;

        // 最外圈无论 JSON 里存的是什么，一律强制为草地安全区
        if (isOuterRing) {
          this.grid[r][c] = CELL_SAFE;
          const key = gridKey(c, r);
          this.safeZones.add(key);
          this.outerGrassZones.add(key);
          continue;
        }

        switch (cell) {
          case CELL_WALL:
            this.grid[r][c] = CELL_WALL;
            break;
          case CELL_ITEM:
            this.grid[r][c] = CELL_ITEM;
            break;
          case CELL_BLOCK:
          case CELL_STAR_BLOCK:
          case CELL_HEART_BLOCK:
          case CELL_BOMB:
          case CELL_P1_SPAWN:
          case CELL_ENEMY_SPAWN:
            this.grid[r][c] = cell;
            break;
          case CELL_SAFE:
            this.grid[r][c] = CELL_SAFE;
            this.safeZones.add(gridKey(c, r));
            break;
          default:
            this.grid[r][c] = CELL_EMPTY;
            break;
        }
      }
    }
  }

  // ------------------------------------------------------------------
  // Create floor tiles
  // ------------------------------------------------------------------
  private createFloor(world: IWorld): void {
    // 创建背景层
    this.trackEntity(
      EntityBuilder.create(world, W, H)
        .withBackground({ color: PALETTE.BACKGROUND })
        .build()
    );

    // 创建地板层
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const pos = gridToWorld(c, r);
        this.trackEntity(
          EntityBuilder.create(world, W, H)
            .withTransform({ x: pos.x, y: pos.y })
            .withSprite({
              textureId: this.outerGrassZones.has(gridKey(c, r)) ? ASSETS.GRASS : ASSETS.FLOOR,
              width: TILE_SIZE,
              height: TILE_SIZE,
              zIndex: Z_FLOOR,
            })
            .build()
        );
      }
    }
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
      });
    }
  }

  private resolveEnemySpawnCells(count: number): Array<{ col: number; row: number }> {
    const candidates: SpawnCandidate[] = [];
    for (let r = 2; r < GRID_ROWS - 2; r++) {
      for (let c = 2; c < GRID_COLS - 2; c++) {
        if (this.grid[r][c] !== CELL_EMPTY) continue;
        const baseExits = this.countEnemySpawnExits([], c, r);
        if (baseExits <= 0) continue;
        candidates.push({
          col: c,
          row: r,
          bucket: this.getSpawnBucket(r),
          nearbyObstacles: this.countNearbyObstacles(c, r),
        });
      }
    }

    const targetBuckets = this.getTargetSpawnBucketCounts(count, candidates);
    const targetVariants = this.getTargetBucketVariants(targetBuckets);

    for (const target of targetVariants) {
      const picked = this.tryBuildEnemySpawnSet(candidates, count, target);
      if (picked.length === count) {
        return picked;
      }
    }

    return candidates.slice(0, count).map((candidate) => ({ col: candidate.col, row: candidate.row }));
  }

  private tryBuildEnemySpawnSet(
    candidates: SpawnCandidate[],
    count: number,
    targetBuckets: [number, number, number]
  ): Array<{ col: number; row: number }> {
    const baseSeed = (this.currentLevelIndex + 1) * 9973 + count * 37;

    for (let attempt = 0; attempt < 80; attempt++) {
      let state = (baseSeed + attempt * 7919) >>> 0;
      const nextRandom = (): number => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 0x100000000;
      };

      const chosen: Array<{ col: number; row: number }> = [];
      const bucketCounts: [number, number, number] = [0, 0, 0];

      while (chosen.length < count) {
        const need = targetBuckets.map((target, idx) => Math.max(0, target - bucketCounts[idx])) as [number, number, number];
        const preferredBuckets = new Set(need.flatMap((value, idx) => (value > 0 ? [idx] : [])));
        const remaining = candidates.filter(
          (candidate) => !chosen.some((pick) => pick.col === candidate.col && pick.row === candidate.row)
        );

        const ranked = this.rankEnemySpawnCandidates(
          remaining.filter((candidate) => preferredBuckets.size === 0 || preferredBuckets.has(candidate.bucket)),
          chosen,
          need,
          nextRandom
        );
        const fallback = ranked.length > 0 ? ranked : this.rankEnemySpawnCandidates(remaining, chosen, need, nextRandom);
        if (fallback.length === 0) break;

        const pick = fallback[0];
        chosen.push({ col: pick.col, row: pick.row });
        bucketCounts[pick.bucket]++;
      }

      if (chosen.length === count && this.countTrappedEnemySpawns(chosen) <= 2) {
        return chosen;
      }
    }

    return [];
  }

  private rankEnemySpawnCandidates(
    candidates: SpawnCandidate[],
    chosen: Array<{ col: number; row: number }>,
    need: [number, number, number],
    nextRandom: () => number
  ): SpawnCandidate[] {
    return candidates
      .map((candidate) => {
        const projected = [...chosen, { col: candidate.col, row: candidate.row }];
        const trapped = this.countTrappedEnemySpawns(projected);
        if (trapped > 2) {
          return null;
        }

        const exits = this.countEnemySpawnExits(projected, candidate.col, candidate.row);
        const minDistance = chosen.length === 0
          ? 6
          : Math.min(
            ...chosen.map((pick) => Math.abs(pick.col - candidate.col) + Math.abs(pick.row - candidate.row))
          );
        const distToPlayer = this.player
          ? Math.abs(this.player.col - candidate.col) + Math.abs(this.player.row - candidate.row)
          : Math.abs(7 - candidate.col) + Math.abs(6 - candidate.row);

        const score =
          need[candidate.bucket] * 110 +
          Math.min(exits, 4) * 34 +
          Math.min(minDistance, 6) * 18 +
          Math.min(distToPlayer, 8) * 4 +
          Math.min(candidate.nearbyObstacles, 5) * 5 -
          Math.abs(candidate.row - 6) * 2 -
          trapped * 12 +
          (nextRandom() * 12 - 6);

        return { candidate, score };
      })
      .filter((entry): entry is { candidate: SpawnCandidate; score: number } => entry !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((entry) => entry.candidate);
  }

  private countEnemySpawnExits(occupied: Array<{ col: number; row: number }>, col: number, row: number): number {
    let exits = 0;
    for (const dir of ALL_DIRECTIONS) {
      const nc = col + dir.dc;
      const nr = row + dir.dr;
      if (!inBounds(nc, nr)) continue;
      if (this.grid[nr][nc] !== CELL_EMPTY) continue;
      const blockedByEnemy = occupied.some((enemy) => enemy.col === nc && enemy.row === nr);
      if (!blockedByEnemy) {
        exits++;
      }
    }
    return exits;
  }

  private countTrappedEnemySpawns(spawns: Array<{ col: number; row: number }>): number {
    return spawns.reduce((total, spawn) => {
      const occupied = spawns.filter((other) => other !== spawn);
      return total + (this.countEnemySpawnExits(occupied, spawn.col, spawn.row) <= 2 ? 1 : 0);
    }, 0);
  }

  private getSpawnBucket(row: number): number {
    if (row <= 4) return 0;
    if (row <= 7) return 1;
    return 2;
  }

  private countNearbyObstacles(col: number, row: number): number {
    let total = 0;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dc === 0 && dr === 0) continue;
        const nc = col + dc;
        const nr = row + dr;
        if (!inBounds(nc, nr)) continue;
        if (this.grid[nr][nc] !== CELL_EMPTY) {
          total++;
        }
      }
    }
    return total;
  }

  private getTargetSpawnBucketCounts(
    count: number,
    candidates: SpawnCandidate[]
  ): [number, number, number] {
    const capacity: [number, number, number] = [0, 0, 0];
    for (const candidate of candidates) {
      capacity[candidate.bucket]++;
    }

    const target: [number, number, number] = [
      Math.floor(count / 3),
      Math.floor(count / 3),
      Math.floor(count / 3),
    ];
    const remainder = count % 3;
    const order = [0, 2, 1];
    for (let i = 0; i < remainder; i++) {
      target[order[i]]++;
    }

    let overflow = 0;
    for (let i = 0; i < target.length; i++) {
      if (target[i] > capacity[i]) {
        overflow += target[i] - capacity[i];
        target[i] = capacity[i];
      }
    }

    while (overflow > 0) {
      const bestBucket = [0, 1, 2].reduce((best, current) => {
        const bestRoom = capacity[best] - target[best];
        const currentRoom = capacity[current] - target[current];
        return currentRoom > bestRoom ? current : best;
      }, 0);
      if (capacity[bestBucket] <= target[bestBucket]) break;
      target[bestBucket]++;
      overflow--;
    }

    return target;
  }

  private getTargetBucketVariants(target: [number, number, number]): Array<[number, number, number]> {
    const variants: Array<[number, number, number]> = [target];
    const swaps: Array<[number, number]> = [
      [0, 1],
      [1, 2],
      [0, 2],
    ];

    for (const [from, to] of swaps) {
      if (target[from] <= 0) continue;
      variants.push(
        target.map((value, idx) => {
          if (idx === from) return value - 1;
          if (idx === to) return value + 1;
          return value;
        }) as [number, number, number]
      );
    }

    return variants.filter((variant, idx, list) => {
      if (variant.some((value) => value < 0)) return false;
      return list.findIndex((other) => other.every((value, i) => value === variant[i])) === idx;
    });
  }

  // ------------------------------------------------------------------
  // HUD (single-player)
  // ------------------------------------------------------------------
  private createHUD(world: IWorld): void {
    // HUD 背景条
    this.trackEntity(
      EntityBuilder.create(world, W, H)
        .withTransform({ x: W / 2, y: HUD_TOP_Y + 10, screenSpace: true })
        .withSprite({ color: PALETTE.HUD_BG, width: W, height: 52, zIndex: Z_UI })
        .build()
    );

    // 左：HP（用实际 HP 初始化，避免进入下一关时显示错误）
    const initHp = this.player?.hp ?? getRunHp();
    const initHearts = '♥'.repeat(Math.max(0, initHp));
    const initEmpty  = '♡'.repeat(Math.max(0, PLAYER_MAX_HP - initHp));
    this.hpEntity = UIEntityBuilder.create(world, W, H)
      .withUITransform({ anchor: 'top-left', x: HUD_PADDING_X, y: 6, width: 160, height: 36 })
      .withText({ text: `HP: ${initHearts}${initEmpty}`, fontSize: 22, color: 0xff6666, align: 'left' })
      .build();
    this.trackEntity(this.hpEntity);

    // 中：得分
    this.scoreDisplayEntity = UIEntityBuilder.create(world, W, H)
      .withUITransform({ anchor: 'top-center', y: 6, width: 280, height: 36 })
      .withText({ text: '得分: 0', fontSize: 24, color: PALETTE.SCORE_GOLD, align: 'center' })
      .build();
    this.trackEntity(this.scoreDisplayEntity);

    // 右上：倒计时（突出显示）
    const initTime = getLevelTimeLimit(this.currentLevelIndex, Math.max(LEVELS.length, 1));
    this.timeDisplayEntity = UIEntityBuilder.create(world, W, H)
      .withUITransform({ anchor: 'top-right', x: -HUD_PADDING_X, y: 4, width: 130, height: 40 })
      .withText({ text: `⏱ ${initTime}`, fontSize: 26, color: PALETTE.SCORE_CYAN, align: 'right' })
      .build();
    this.trackEntity(this.timeDisplayEntity);

    // 右下：关卡
    this.levelDisplayEntity = UIEntityBuilder.create(world, W, H)
      .withUITransform({ anchor: 'top-right', x: -HUD_PADDING_X, y: 46, width: 130, height: 26 })
      .withText({ text: `关卡: 1`, fontSize: 16, color: PALETTE.SCORE_CYAN, align: 'right' })
      .build();
    this.trackEntity(this.levelDisplayEntity);

    // 右侧中部：心心提示
    this.heartStatusEntity = UIEntityBuilder.create(world, W, H)
      .withUITransform({ anchor: 'top-right', x: -5, y: 90, width: 110, height: 80 })
      .withText({ text: '将♥\n连成一线!', fontSize: 16, color: PALETTE.HEART_RED, align: 'center' })
      .build();
    this.trackEntity(this.heartStatusEntity);
  }

  // ------------------------------------------------------------------
  // READY overlay
  // ------------------------------------------------------------------
  private createReadyOverlay(world: IWorld): void {
    this.readyEntity = UIEntityBuilder.create(world, W, H)
      .withUITransform({ anchor: 'center', width: 400, height: 80 })
      .withText({ text: 'READY', fontSize: 52, color: PALETTE.READY_TEXT, align: 'center' })
      .build();
    this.trackEntity(this.readyEntity);
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

      this.handlePlayerInput(world, dt);
      this.updateEnemies(world, dt);
      this.updateWaves(world, dt);
      // combo 窗口计时
      if (this.comboTimer > 0) {
        this.comboTimer -= dt;
        if (this.comboTimer <= 0) this.comboCount = 0;
      }
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
        // 可以推动，检查路径上是否有敌人
        for (let i = 1; i <= distance; i++) {
          const checkC = tc + dc * i;
          const checkR = tr + dr * i;
          const enemyInPath = this.findEnemyAt(checkC, checkR);
          if (enemyInPath) {
            this.crushEnemy(world, p, enemyInPath);
          }
        }

        // 推动砖块到最终位置
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

  /** Check if a cell type is a pushable block. */
  private isPushable(cell: number): boolean {
    return cell === CELL_BLOCK || cell === CELL_STAR_BLOCK
      || cell === CELL_HEART_BLOCK || cell === CELL_BOMB;
  }

  private calculateBombSlidePath(
    startC: number, startR: number,
    dc: number, dr: number,
  ): { finalC: number; finalR: number; distance: number; hitEnemy: boolean } {
    let finalC = startC;
    let finalR = startR;
    let distance = 0;

    for (let i = 1; ; i++) {
      const testC = startC + dc * i;
      const testR = startR + dr * i;

      if (!inBounds(testC, testR)) {
        break;
      }

      // 遇到敌人：炸弹停在敌人位置并爆炸
      if (this.findEnemyAt(testC, testR)) {
        return { finalC: testC, finalR: testR, distance: i, hitEnemy: true };
      }

      const cell = this.grid[testR][testC];
      const canOccupySafe = cell === CELL_SAFE && !this.outerGrassZones.has(gridKey(testC, testR));
      if (cell === CELL_EMPTY || cell === CELL_ITEM || canOccupySafe) {
        finalC = testC;
        finalR = testR;
        distance = i;
        continue;
      }

      break;
    }

    return { finalC, finalR, distance, hitEnemy: false };
  }

  /** Calculate the final position a block can be pushed to. */
  private calculatePushPath(
    startC: number, startR: number,
    dc: number, dr: number,
    maxDistance: number
  ): { finalC: number; finalR: number; distance: number } {
    let finalC = startC;
    let finalR = startR;
    let distance = 0;

    // 检查从起点开始，最多maxDistance格的路径
    for (let i = 1; i <= maxDistance; i++) {
      const testC = startC + dc * i;
      const testR = startR + dr * i;

      if (!inBounds(testC, testR)) {
        // 超出边界，停在上一格
        break;
      }

      const cell = this.grid[testR][testC];
      const canOccupySafe = cell === CELL_SAFE && !this.outerGrassZones.has(gridKey(testC, testR));
      if (cell === CELL_EMPTY || cell === CELL_ITEM || canOccupySafe) {
        // 可以占据这个位置
        finalC = testC;
        finalR = testR;
        distance = i;
      } else if (cell === CELL_WALL || this.isPushable(cell)) {
        // 遇到墙或其他方块，停在上一格
        break;
      } else if (this.findEnemyAt(testC, testR)) {
        // 遇到敌人，可以压死敌人并占据这个位置
        finalC = testC;
        finalR = testR;
        distance = i;
        // 压死敌人后可以继续前进，检查下一个位置
        continue;
      } else {
        // 其他情况，停止
        break;
      }
    }

    return { finalC, finalR, distance };
  }

  // ------------------------------------------------------------------
  // Edge-push mechanic: block can't move further
  // ------------------------------------------------------------------
  private handleEdgePush(
    world: IWorld, p: PlayerState,
    blockC: number, blockR: number, cellType: number,
    _dc: number, _dr: number,
  ): void {
    const key = gridKey(blockC, blockR);
    const blockEntity = this.entityMap.get(key);

    if (cellType === CELL_BLOCK) {
      // Brick block shatters
      gameAudio.playPush();
      p.score += SCORE_BLOCK_BREAK;
      this.spawnScorePopup(world, blockC, blockR, SCORE_BLOCK_BREAK, PALETTE.BREAK_WHITE);
      this.destroyBlockAt(world, blockC, blockR);
      this.spawnBreakEffect(world, blockC, blockR, 0x44bbaa);
      // Player moves into the now-empty space
      this.movePlayerTo(world, p, blockC, blockR);
      return;
    }

    if (cellType === CELL_STAR_BLOCK) {
      // Star block shatters and drops item
      gameAudio.playPush();
      p.score += SCORE_STAR_BREAK;
      this.spawnScorePopup(world, blockC, blockR, SCORE_STAR_BREAK, PALETTE.SCORE_GOLD);
      this.destroyBlockAt(world, blockC, blockR);
      this.spawnBreakEffect(world, blockC, blockR, 0xffd700);
      // Drop push power-up at that position
      this.spawnItemAt(world, blockC, blockR, ASSETS.PUSH_POWERUP);
      // Player does NOT move in (item is there now), but we set cooldown
      p.cooldown = PLAYER_MOVE_COOLDOWN;
      return;
    }

    if (cellType === CELL_BOMB) {
      // Bomb explodes immediately
      gameAudio.playPush();
      this.explodeSingleBomb(world, p, blockC, blockR);
      // Player moves into the cleared cell if it's now empty
      if (this.grid[blockR][blockC] === CELL_EMPTY) {
        this.movePlayerTo(world, p, blockC, blockR);
      } else {
        p.cooldown = PLAYER_MOVE_COOLDOWN;
      }
      return;
    }

    if (cellType === CELL_HEART_BLOCK) {
      // Heart blocks cannot be broken – just can't push further
      gameAudio.playPush();
      // Check if beyond the obstacle there's a valid spot (no movement, just feedback)
      p.cooldown = PLAYER_MOVE_COOLDOWN;
      // Visual bounce feedback on the heart block (只做视觉效果，不改变实际坐标)
      if (blockEntity !== undefined) {
        const transform = world.getComponent<TransformComponent>(blockEntity, TRANSFORM_COMPONENT);
        if (transform) {
          // 使用缩放动画来模拟反弹效果，不改变实际坐标
          const scaleFactor = 1.1; // 轻微放大
          globalTweens.to(transform, { scaleX: scaleFactor, scaleY: scaleFactor }, {
            duration: 0.06,
            easing: Easing.easeOutQuad,
            yoyo: true,
            repeat: 1,
            onComplete: () => {
              // 确保恢复原状
              transform.scaleX = 1.0;
              transform.scaleY = 1.0;
            }
          });
        }
      }
      return;
    }
  }

  private pushBombUntilCollision(
    world: IWorld,
    p: PlayerState,
    bombC: number,
    bombR: number,
    dc: number,
    dr: number,
  ): void {
    const { finalC, finalR, distance, hitEnemy } = this.calculateBombSlidePath(bombC, bombR, dc, dr);

    if (distance === 0) {
      // 无处可移动，原地爆炸
      this.explodeSingleBomb(world, p, bombC, bombR);
      p.cooldown = PLAYER_MOVE_COOLDOWN;
      return;
    }

    if (hitEnemy) {
      // 炸弹滑到敌人位置立即爆炸（不移动炸弹实体，直接在目标格爆炸）
      this.movePlayerTo(world, p, bombC, bombR);
      // 先把炸弹逻辑位置移过去再爆炸，确保 explodeSingleBomb 能找到它
      const bombKey = gridKey(bombC, bombR);
      const bombEid = this.entityMap.get(bombKey);
      if (bombEid !== undefined) {
        this.entityMap.delete(bombKey);
        this.entityMap.set(gridKey(finalC, finalR), bombEid);
        const bt = world.getComponent<TransformComponent>(bombEid, TRANSFORM_COMPONENT);
        if (bt) { const bp = gridToWorld(finalC, finalR); bt.x = bp.x; bt.y = bp.y; }
      }
      const bomb = this.bombs.find(b => b.col === bombC && b.row === bombR);
      if (bomb) { bomb.col = finalC; bomb.row = finalR; }
      this.grid[bombR][bombC] = CELL_EMPTY;
      this.grid[finalR][finalC] = CELL_BOMB;
      this.explodeSingleBomb(world, p, finalC, finalR);
      return;
    }

    // 正常滑行到终点，延迟爆炸
    const duration = this.pushBlock(world, bombC, bombR, finalC, finalR, CELL_BOMB);
    this.movePlayerTo(world, p, bombC, bombR);

    setTimeout(() => {
      if (!this.isActive || this.phase === 'complete') return;
      this.explodeSingleBomb(world, p, finalC, finalR);
    }, Math.max(0, Math.round(duration * 1000)));
  }

  // ------------------------------------------------------------------
  // Destroy block at grid position
  // ------------------------------------------------------------------
  private destroyBlockAt(world: IWorld, c: number, r: number): void {
    // 保护心心方块不被销毁
    if (this.grid[r][c] === CELL_HEART_BLOCK) {
      console.warn('Attempted to destroy a heart block at', c, r, '- prevented');
      return;
    }

    const key = gridKey(c, r);
    const ent = this.entityMap.get(key);
    if (ent !== undefined) {
      world.destroyEntity(ent);
      this.entityMap.delete(key);
    }
    this.grid[r][c] = this.safeZones.has(key) ? CELL_SAFE : CELL_EMPTY;

    // Also remove from bombs array if it was a bomb
    const bIdx = this.bombs.findIndex(b => b.col === c && b.row === r);
    if (bIdx >= 0) this.bombs.splice(bIdx, 1);
  }

  private destroyWallAt(world: IWorld, c: number, r: number): void {
    const key = gridKey(c, r);
    const ent = this.entityMap.get(key);
    if (ent !== undefined) {
      world.destroyEntity(ent);
      this.entityMap.delete(key);
    }
    this.grid[r][c] = CELL_EMPTY;
  }

  // ------------------------------------------------------------------
  // Break visual effect (particle burst simulation)
  // ------------------------------------------------------------------
  private spawnBreakEffect(world: IWorld, c: number, r: number, color: number): void {
    const pos = gridToWorld(c, r);
    const FRAGMENT_COUNT = 6;
    for (let i = 0; i < FRAGMENT_COUNT; i++) {
      const angle = (Math.PI * 2 * i) / FRAGMENT_COUNT;
      const dist = TILE_SIZE * 0.8;
      const tx = pos.x + Math.cos(angle) * dist;
      const ty = pos.y + Math.sin(angle) * dist;
      const fragSize = 8 + Math.random() * 6;

      const eid = EntityBuilder.create(world, W, H)
        .withTransform({ x: pos.x, y: pos.y })
        .withSprite({ color, width: fragSize, height: fragSize, zIndex: Z_SCORE_POPUP })
        .build();
      this.trackEntity(eid);

      const transform = world.getComponent<TransformComponent>(eid, TRANSFORM_COMPONENT);
      const sprite = world.getComponent<SpriteComponent>(eid, SPRITE_COMPONENT);
      if (transform) {
        globalTweens.to(transform, { x: tx, y: ty }, {
          duration: 0.4,
          easing: Easing.easeOutQuad,
          onComplete: () => { world.destroyEntity(eid); },
        });
      }
      if (sprite) {
        globalTweens.to(sprite, { alpha: 0 }, { duration: 0.4, easing: Easing.easeOutQuad });
      }
    }
  }

  // ------------------------------------------------------------------
  // Spawn an item at grid position
  // ------------------------------------------------------------------
  private spawnItemAt(world: IWorld, c: number, r: number, tex: string): void {
    const key = gridKey(c, r);
    const canSpawnOnCell = this.grid[r][c] === CELL_EMPTY || this.safeZones.has(key);
    if (!canSpawnOnCell) return;
    const pos = gridToWorld(c, r);
    const eid = EntityBuilder.create(world, W, H)
      .withTransform({ x: pos.x, y: pos.y })
      .withSprite({ textureId: tex, width: TILE_SIZE, height: TILE_SIZE, zIndex: Z_ITEM })
      .build();
    this.trackEntity(eid);
    this.entityMap.set(key, eid);
    this.grid[r][c] = CELL_ITEM;

    // 如果是POWERUP道具，添加一个字母"P"的文本显示
    if (tex === ASSETS.PUSH_POWERUP) {
      const textEid = EntityBuilder.create(world, W, H)
        .withTransform({ x: pos.x, y: pos.y })
        .withText({
          text: 'P',
          fontSize: 24,
          color: 0xffffff,
          align: 'center',
          zIndex: Z_ITEM + 1,
        })
        .build();
      this.trackEntity(textEid);
      this.itemDecorationMap.set(key, [textEid]);
    }
  }

  private clearItemAt(world: IWorld, c: number, r: number): void {
    const key = gridKey(c, r);
    const itemEntity = this.entityMap.get(key);
    if (itemEntity !== undefined) {
      world.destroyEntity(itemEntity);
      this.entityMap.delete(key);
    }

    const decorations = this.itemDecorationMap.get(key);
    if (decorations) {
      for (const eid of decorations) {
        world.destroyEntity(eid);
      }
      this.itemDecorationMap.delete(key);
    }

    if (this.grid[r][c] === CELL_ITEM) {
      this.grid[r][c] = this.safeZones.has(key) ? CELL_SAFE : CELL_EMPTY;
    }
  }

  // ------------------------------------------------------------------
  // Explode a single bomb at a given position
  // ------------------------------------------------------------------
  private explodeSingleBomb(world: IWorld, p: PlayerState, bc: number, br: number): void {
    // Find and mark bomb as exploded
    const bIdx = this.bombs.findIndex(b => b.col === bc && b.row === br && !b.exploded);
    if (bIdx < 0) return;
    this.bombs[bIdx].exploded = true;
    gameAudio.playExplosion();

    // Destroy bomb entity
    this.destroyBlockAt(world, bc, br);

    if (this.isPlayerInExplosionRange(bc, br)) {
      this.damagePlayer(world);
    }

    // Explosion affects a 3x3 area centered on the bomb.
    for (let dr = -BOMB_EXPLOSION_RANGE; dr <= BOMB_EXPLOSION_RANGE; dr++) {
      for (let dc = -BOMB_EXPLOSION_RANGE; dc <= BOMB_EXPLOSION_RANGE; dc++) {
        const ec = bc + dc;
        const er = br + dr;
        if (!inBounds(ec, er)) continue;
        if (ec === bc && er === br) continue;

        if (this.grid[er][ec] === CELL_WALL) {
          this.destroyWallAt(world, ec, er);
          this.spawnBreakEffect(world, ec, er, 0x222222);
          continue;
        }

        // Destroy pushable blocks in range (except hearts)
        const cell = this.grid[er][ec];
        if (cell === CELL_BLOCK || cell === CELL_STAR_BLOCK) {
          this.destroyBlockAt(world, ec, er);
        }
        // Chain-explode other bombs
        if (cell === CELL_BOMB) {
          this.explodeSingleBomb(world, p, ec, er);
        }

        // Kill enemies in range
        const enemy = this.findEnemyAt(ec, er);
        if (enemy) {
          this.killEnemyScore(world, p, ec, er);
          this.destroyEnemy(world, enemy);
        }
      }
    }

    // Explosion visual flash
    this.spawnExplosionFlash(world, bc, br);
  }

  private isPlayerInExplosionRange(bc: number, br: number): boolean {
    if (!this.player) return false;
    return (
      Math.abs(this.player.col - bc) <= BOMB_EXPLOSION_RANGE &&
      Math.abs(this.player.row - br) <= BOMB_EXPLOSION_RANGE
    );
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
  // Push block normally (to an empty/enemy cell)
  // ------------------------------------------------------------------
  private pushBlock(
    world: IWorld, fromC: number, fromR: number,
    toC: number, toR: number, cellType: number,
  ): number {
    gameAudio.playPush();
    const key = gridKey(fromC, fromR);
    const blockEntity = this.entityMap.get(key);

    if (this.grid[toR][toC] === CELL_ITEM) {
      this.clearItemAt(world, toC, toR);
    }

    // 立即更新逻辑状态
    this.grid[fromR][fromC] = this.safeZones.has(key) ? CELL_SAFE : CELL_EMPTY;
    this.grid[toR][toC] = cellType;
    this.entityMap.delete(key);
    if (blockEntity !== undefined) {
      this.entityMap.set(gridKey(toC, toR), blockEntity);
    }

    // Update bomb position tracking
    for (const b of this.bombs) {
      if (b.col === fromC && b.row === fromR) {
        b.col = toC;
        b.row = toR;
        break;
      }
    }

    // 动画表现：移动实体到新位置
    if (blockEntity !== undefined) {
      const target = gridToWorld(toC, toR);
      const transform = world.getComponent<TransformComponent>(blockEntity, TRANSFORM_COMPONENT);
      if (transform) {
        // 根据推动距离调整动画持续时间，推动距离越远，动画越快
        const distance = Math.max(Math.abs(toC - fromC), Math.abs(toR - fromR));
        const duration = PLAYER_MOVE_TWEEN_DURATION * (0.5 + distance * 0.3); // 滑动效果

        // 立即设置最终位置，然后做动画
        transform.x = target.x;
        transform.y = target.y;

        // 使用缩放和位置偏移创建滑动效果，而不改变实际位置
        const sprite = world.getComponent<SpriteComponent>(blockEntity, SPRITE_COMPONENT);
        if (sprite) {
          // 保存原始位置
          const originalX = transform.x;
          const originalY = transform.y;

          // 设置动画起始位置（往回偏移一点）
          const offsetX = (fromC - toC) * TILE_SIZE * 0.3;
          const offsetY = (fromR - toR) * TILE_SIZE * 0.3;
          transform.x = originalX + offsetX;
          transform.y = originalY + offsetY;

          // 动画到最终位置
          globalTweens.to(transform, { x: originalX, y: originalY }, {
            duration: duration,
            easing: Easing.easeOutCubic, // 使用更平滑的缓动函数
          });
        }

        return duration;
      }
    }

    return PLAYER_MOVE_TWEEN_DURATION;
  }

  // ------------------------------------------------------------------
  // Collect item
  // ------------------------------------------------------------------
  private collectItem(world: IWorld, p: PlayerState, c: number, r: number): void {
    const key = gridKey(c, r);
    const itemEntity = this.entityMap.get(key);
    if (itemEntity !== undefined) {
      const sprite = world.getComponent<SpriteComponent>(itemEntity, SPRITE_COMPONENT);
      let scoreVal = SCORE_YELLOW_ITEM;

      if (sprite) {
        if (sprite.textureId === ASSETS.ITEM_BLUE) {
          scoreVal = SCORE_BLUE_ITEM;
        }
        // 检查是否是POWERUP道具（胶囊，显示大写的P）
        if (sprite.textureId === ASSETS.PUSH_POWERUP) {
          // 增加推动距离
          p.pushDistance = Math.min(p.pushDistance + 1, PLAYER_MAX_PUSH_DISTANCE);
          p.canBreakWalls = true;
          // 显示特殊提示
          this.spawnPowerupText(world, c, r, '推力+1 / 可碎墙!', 0xff8800);
          gameAudio.playCoin();
          // 不增加分数和收集品计数
          this.clearItemAt(world, c, r);
          return;
        }
      }

      p.score += scoreVal;
      p.collectibles += 1;
      gameAudio.playCoin();
      this.spawnScorePopup(world, c, r, scoreVal, PALETTE.SCORE_GOLD);
    }
    this.clearItemAt(world, c, r);
  }

  // ------------------------------------------------------------------
  // Find enemy at grid position
  // ------------------------------------------------------------------
  private findEnemyAt(c: number, r: number): EnemyState | null {
    for (const e of this.enemies) {
      if (e.col === c && e.row === r && e.active) return e;
    }
    return null;
  }


  /** 统一处理杀怪得分，含 combo 计算 */
  private killEnemyScore(world: IWorld, p: PlayerState, ec: number, er: number): void {
    this.comboCount++;
    this.comboTimer = COMBO_WINDOW;
    const score = Math.min(COMBO_BASE_KILL + (this.comboCount - 1) * COMBO_INCREMENT, COMBO_MAX);
    p.score += score;
    const color = this.comboCount >= 3 ? 0xff4400 : PALETTE.SCORE_GOLD;
    const label = this.comboCount >= 2 ? `COMBO×${this.comboCount}  +${score}` : `+${score}`;
    this.spawnScorePopup(world, ec, er, score, color, label);
  }

  // ------------------------------------------------------------------
  // Crush enemy (block push)
  // ------------------------------------------------------------------
  private crushEnemy(world: IWorld, p: PlayerState, enemy: EnemyState): void {
    this.killEnemyScore(world, p, enemy.col, enemy.row);
    this.destroyEnemy(world, enemy);
    this.maybeDropItem(world, enemy.col, enemy.row, enemy.type);
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

  // ------------------------------------------------------------------
  // Spawn score popup
  // ------------------------------------------------------------------
  private spawnScorePopup(world: IWorld, c: number, r: number, value: number, color: number, label?: string): void {
    const pos = gridToWorld(c, r);
    const text = label ?? `+${value}`;
    const fontSize = label ? 16 : 18;
    const eid = EntityBuilder.create(world, W, H)
      .withTransform({ x: pos.x, y: pos.y })
      .withText({ text, fontSize, color, align: 'center', zIndex: Z_SCORE_POPUP })
      .build();
    this.trackEntity(eid);

    const transform = world.getComponent<TransformComponent>(eid, TRANSFORM_COMPONENT);
    if (transform) {
      globalTweens.to(transform, { y: pos.y - 48 }, {
        duration: 0.9,
        easing: Easing.easeOutQuad,
        onComplete: () => { world.destroyEntity(eid); },
      });
    }
    const textComp = world.getComponent<TextComponent>(eid, TEXT_COMPONENT);
    if (textComp) {
      globalTweens.to(textComp, { alpha: 0 }, { duration: 0.9, easing: Easing.linear });
    }
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
  private updateWaves(world: IWorld, dt: number): void {
    if (this.currentWave >= this.totalWaves) return;
    if (this.nextWaveTimer <= 0) return;
    this.nextWaveTimer -= dt;
    if (this.nextWaveTimer <= 0) {
      this.spawnNextWave(world);
    }
  }

  private updateEnemies(world: IWorld, dt: number): void {
    for (const enemy of this.enemies) {
      // 延迟激活
      if (!enemy.active) {
        if (enemy.activateTimer > 0) {
          enemy.activateTimer -= dt;
          if (enemy.activateTimer <= 0) {
            enemy.active = true;
            const sprite = world.getComponent<SpriteComponent>(enemy.entity, SPRITE_COMPONENT);
            if (sprite) sprite.textureId = ENEMY_TEXTURES[enemy.type] ?? ASSETS.ENEMY_FROG;
          }
        }
        continue;
      }

      // stun 计时
      if (enemy.stunTimer > 0) enemy.stunTimer -= dt;

      enemy.moveCooldown -= dt;
      if (enemy.moveCooldown > 0) continue;
      enemy.moveCooldown = getEnemyMoveCooldown(enemy.type);

      // stun 中随机游荡
      if (enemy.stunTimer > 0) {
        this.stepEnemyRandom(world, enemy);
        continue;
      }

      if (enemy.type === ENEMY_TYPE_BOW) {
        this.stepEnemyBow(world, enemy);
      } else if (enemy.type === ENEMY_TYPE_GEAR) {
        this.stepEnemyGear(world, enemy);
      } else {
        this.stepEnemyBasic(world, enemy);
      }
    }
  }

  /** 移动敌人到目标格，动画完成后再检测碰撞 */
  private moveEnemyTo(world: IWorld, enemy: EnemyState, nc: number, nr: number): void {
    this.grid[enemy.row][enemy.col] = CELL_EMPTY;
    enemy.col = nc;
    enemy.row = nr;

    const target = gridToWorld(nc, nr);
    const transform = world.getComponent<TransformComponent>(enemy.entity, TRANSFORM_COMPONENT);
    const duration = enemy.moveCooldown * 0.82;

    if (transform) {
      globalTweens.to(transform, { x: target.x, y: target.y }, {
        duration,
        easing: Easing.easeOutQuad,
        onComplete: () => {
          // 动画完成后才判断碰撞，此时玩家若已离开则不扣血
          if (this.player && this.player.col === nc && this.player.row === nr) {
            this.damagePlayer(world);
            enemy.stunTimer = 1.2;
            // 碰撞反弹：敌人轻微缩放表示撞击感
            globalTweens.to(transform, { scaleX: 1.3, scaleY: 1.3 }, {
              duration: 0.06, easing: Easing.easeOutQuad,
              onComplete: () => {
                globalTweens.to(transform, { scaleX: 1.0, scaleY: 1.0 }, {
                  duration: 0.1, easing: Easing.easeInQuad,
                });
              },
            });
          }
        },
      });
    }
  }

  /** BOW 跳跃动画：起跳缩小 → 空中放大 → 落地恢复，分三段 */
  private moveEnemyBowJump(world: IWorld, enemy: EnemyState, nc: number, nr: number): void {
    this.grid[enemy.row][enemy.col] = CELL_EMPTY;
    enemy.col = nc;
    enemy.row = nr;

    const target = gridToWorld(nc, nr);
    const transform = world.getComponent<TransformComponent>(enemy.entity, TRANSFORM_COMPONENT);
    const totalDuration = enemy.moveCooldown * 0.82;
    const phase = totalDuration / 3;

    if (!transform) return;

    // 阶段1：起跳 — 缩小（蓄力感）
    globalTweens.to(transform, { scaleX: 0.7, scaleY: 0.7 }, {
      duration: phase * 0.4,
      easing: Easing.easeInQuad,
      onComplete: () => {
        // 阶段2：空中 — 放大并移动到目标
        globalTweens.to(transform, { x: target.x, y: target.y, scaleX: 1.4, scaleY: 1.4 }, {
          duration: phase * 1.2,
          easing: Easing.easeOutQuad,
          onComplete: () => {
            // 阶段3：落地 — 恢复正常大小，轻微压扁
            globalTweens.to(transform, { scaleX: 1.1, scaleY: 0.8 }, {
              duration: phase * 0.2,
              easing: Easing.easeOutQuad,
              onComplete: () => {
                globalTweens.to(transform, { scaleX: 1.0, scaleY: 1.0 }, {
                  duration: phase * 0.2,
                  easing: Easing.easeInQuad,
                  onComplete: () => {
                    // 落地后检测碰撞
                    if (this.player && this.player.col === nc && this.player.row === nr) {
                      this.damagePlayer(world);
                      enemy.stunTimer = 1.2;
                    }
                  },
                });
              },
            });
          },
        });
      },
    });
  }

  /** 纯随机移动（stun 状态 / FROG） */
  private stepEnemyRandom(world: IWorld, enemy: EnemyState): void {
    const dirs = [...ALL_DIRECTIONS].sort(() => Math.random() - 0.5);
    for (const dir of dirs) {
      const nc = enemy.col + dir.dc;
      const nr = enemy.row + dir.dr;
      if (!inBounds(nc, nr)) continue;
      if (this.grid[nr][nc] !== CELL_EMPTY) continue;
      if (this.findEnemyAt(nc, nr)) continue;
      this.moveEnemyTo(world, enemy, nc, nr);
      break;
    }
  }

  /** FROG: 随机；BLOB: 追玩家，可走进玩家格触发碰撞 */
  private stepEnemyBasic(world: IWorld, enemy: EnemyState): void {
    if (enemy.type === ENEMY_TYPE_BLOB && this.player) {
      const dirs = [...ALL_DIRECTIONS].sort((a, b) => {
        const da = Math.abs(this.player!.col - (enemy.col + a.dc)) + Math.abs(this.player!.row - (enemy.row + a.dr));
        const db = Math.abs(this.player!.col - (enemy.col + b.dc)) + Math.abs(this.player!.row - (enemy.row + b.dr));
        return da - db;
      });
      for (const dir of dirs) {
        const nc = enemy.col + dir.dc;
        const nr = enemy.row + dir.dr;
        if (!inBounds(nc, nr)) continue;
        const isPlayerCell = this.player.col === nc && this.player.row === nr;
        if (this.grid[nr][nc] !== CELL_EMPTY && !isPlayerCell) continue;
        if (this.findEnemyAt(nc, nr)) continue;
        this.moveEnemyTo(world, enemy, nc, nr);
        return;
      }
    } else {
      this.stepEnemyRandom(world, enemy);
    }
  }

  /** BOW: 优先追玩家，若正前方是方块则跳过它落到方块后面的空格 */
  private stepEnemyBow(world: IWorld, enemy: EnemyState): void {
    if (!this.player) { this.stepEnemyBasic(world, enemy); return; }

    // 按距离玩家由近到远排序方向
    const dirs = [...ALL_DIRECTIONS].sort((a, b) => {
      const da = Math.abs(this.player!.col - (enemy.col + a.dc)) + Math.abs(this.player!.row - (enemy.row + a.dr));
      const db = Math.abs(this.player!.col - (enemy.col + b.dc)) + Math.abs(this.player!.row - (enemy.row + b.dr));
      return da - db;
    });

    for (const dir of dirs) {
      const nc = enemy.col + dir.dc;
      const nr = enemy.row + dir.dr;
      if (!inBounds(nc, nr)) continue;

      const cell = this.grid[nr][nc];

      // 正常空格直接走（或玩家格）
      const isPlayerCell = this.player.col === nc && this.player.row === nr;
      if ((cell === CELL_EMPTY || isPlayerCell) && !this.findEnemyAt(nc, nr)) {
        this.moveEnemyTo(world, enemy, nc, nr);
        return;
      }

      // 前方是可推方块 → 尝试跳到方块后面的空格
      const isBlock = cell === CELL_BLOCK || cell === CELL_STAR_BLOCK ||
                      cell === CELL_HEART_BLOCK || cell === CELL_BOMB;
      if (isBlock) {
        const jc = nc + dir.dc;
        const jr = nr + dir.dr;
        if (inBounds(jc, jr) && this.grid[jr][jc] === CELL_EMPTY && !this.findEnemyAt(jc, jr)) {
          this.moveEnemyBowJump(world, enemy, jc, jr); // 跳跃动画
          return;
        }
      }
    }
  }

  /** GEAR: 追玩家，若正前方是方块则推动它（方块滑到下一个空格） */
  private stepEnemyGear(world: IWorld, enemy: EnemyState): void {
    if (!this.player) { this.stepEnemyBasic(world, enemy); return; }

    const dc = this.player.col - enemy.col;
    const dr = this.player.row - enemy.row;
    // 主轴优先，再备用方向
    const primaryDirs = (Math.abs(dc) >= Math.abs(dr)
      ? [{ dc: Math.sign(dc), dr: 0 }, { dc: 0, dr: Math.sign(dr) }]
      : [{ dc: 0, dr: Math.sign(dr) }, { dc: Math.sign(dc), dr: 0 }]
    ).filter(d => d.dc !== 0 || d.dr !== 0);
    const fallbackDirs = ALL_DIRECTIONS.filter(d => !primaryDirs.some(p => p.dc === d.dc && p.dr === d.dr));
    const dirs = [...primaryDirs, ...fallbackDirs];

    for (const dir of dirs) {
      const nc = enemy.col + dir.dc;
      const nr = enemy.row + dir.dr;
      if (!inBounds(nc, nr)) continue;

      const cell = this.grid[nr][nc];

      // 空格或玩家格直接走
      const isPlayerCell = this.player.col === nc && this.player.row === nr;
      if ((cell === CELL_EMPTY || isPlayerCell) && !this.findEnemyAt(nc, nr)) {
        this.moveEnemyTo(world, enemy, nc, nr);
        return;
      }

      // 前方是可推方块 → 只推一格，且不能推普通 BLOCK
      const isGearPushable = cell === CELL_STAR_BLOCK || cell === CELL_HEART_BLOCK;
      if (isGearPushable) {
        const bc = nc + dir.dc;
        const br = nr + dir.dr;
        // 目标格必须是空格且没有敌人
        if (!inBounds(bc, br) || this.grid[br][bc] !== CELL_EMPTY || this.findEnemyAt(bc, br)) continue;

        // 移动方块实体一格
        const blockKey = gridKey(nc, nr);
        const blockEid = this.entityMap.get(blockKey);
        if (blockEid !== undefined) {
          this.entityMap.delete(blockKey);
          this.entityMap.set(gridKey(bc, br), blockEid);
          const bt = world.getComponent<TransformComponent>(blockEid, TRANSFORM_COMPONENT);
          if (bt) { const bp = gridToWorld(bc, br); bt.x = bp.x; bt.y = bp.y; }
        }
        this.grid[br][bc] = cell;
        this.grid[nr][nc] = CELL_EMPTY;

        gameAudio.playPush();
        this.moveEnemyTo(world, enemy, nc, nr);
        return;
      }
    }
  }

  // ------------------------------------------------------------------
  // Explosion flash visual
  // ------------------------------------------------------------------
  private spawnExplosionFlash(world: IWorld, c: number, r: number): void {
    const pos = gridToWorld(c, r);
    const size = TILE_SIZE * (BOMB_EXPLOSION_RANGE * 2 + 1);
    const eid = EntityBuilder.create(world, W, H)
      .withTransform({ x: pos.x, y: pos.y })
      .withSprite({ color: 0xff6600, width: size, height: size, zIndex: Z_SCORE_POPUP - 1 })
      .build();
    this.trackEntity(eid);

    const sprite = world.getComponent<SpriteComponent>(eid, SPRITE_COMPONENT);
    if (sprite) {
      globalTweens.to(sprite, { alpha: 0 }, {
        duration: 0.5,
        easing: Easing.easeOutQuad,
        onComplete: () => { world.destroyEntity(eid); },
      });
    }
  }

  // ------------------------------------------------------------------
  // HUD update
  // ------------------------------------------------------------------
  private updateHUD(world: IWorld): void {
    this.setUIText(world, this.enemyCountEntity, `敌人: ${this.enemies.length}`);

    const p = this.player;
    if (p) {
      this.setUIText(world, this.scoreEntity, `${p.score}`);
      this.setUIText(world, this.collectEntity, `★ ${p.collectibles}/10`);

      // Update large score display
      this.setUIText(world, this.scoreDisplayEntity, `得分: ${p.score}`);

      // Update HP display
      const hearts = '♥'.repeat(Math.max(0, p.hp));
      const emptyHearts = '♡'.repeat(Math.max(0, PLAYER_MAX_HP - p.hp));
      const hpColor = p.hp <= 1 ? 0xff4444 : (p.hp === 2 ? 0xffaa44 : 0x44ff44);
      this.setUIText(world, this.hpEntity, `HP: ${hearts}${emptyHearts}`);

      // Update HP text color
      const uiText = world.getComponent<UITextComponent>(this.hpEntity, UI_TEXT_COMPONENT);
      if (uiText) {
        uiText.color = hpColor;
      }
    }

    // Update time display
    const timeSeconds = Math.max(0, Math.floor(this.timeLeft));
    const isWarning = timeSeconds <= TIME_WARNING_THRESHOLD;
    const timeColor = isWarning ? 0xff2222 : (timeSeconds <= 30 ? 0xffaa00 : PALETTE.SCORE_CYAN);
    this.setUIText(world, this.timeDisplayEntity, `⏱ ${timeSeconds}`);

    const timeUiText = world.getComponent<UITextComponent>(this.timeDisplayEntity, UI_TEXT_COMPONENT);
    if (timeUiText) {
      timeUiText.color = timeColor;
    }

    // 警告阶段：每秒脉冲缩放
    const timeTransform = world.getComponent<TransformComponent>(this.timeDisplayEntity, TRANSFORM_COMPONENT);
    if (timeTransform && isWarning) {
      const pulse = 1 + 0.18 * Math.abs(Math.sin(this.timeLeft * Math.PI));
      timeTransform.scaleX = pulse;
      timeTransform.scaleY = pulse;
    } else if (timeTransform) {
      timeTransform.scaleX = 1;
      timeTransform.scaleY = 1;
    }

    // Update heart status hint
    const heartCount = this.countHearts();
    const connected = this.checkHeartsConnected();
    const statusText = connected
      ? '♥ 已集合!'
      : `♥×${heartCount} \n连成一线\n通关!`;
    this.setUIText(world, this.heartStatusEntity, statusText);

    // Update level display
    const displayLevel = this.currentLevelIndex + 1; // 显示从1开始的关卡号
    this.setUIText(world, this.levelDisplayEntity, `关卡: ${displayLevel}`);

    // Update push distance display (debug/info)
    if (p && p.pushDistance > PLAYER_PUSH_DISTANCE) {
      // 如果推动距离大于默认值，可以在UI中显示（可选）
      // 例如在HP旁边显示推动距离
    }
  }

  private setUIText(world: IWorld, entity: EntityId, text: string): void {
    const uiText = world.getComponent<UITextComponent>(entity, UI_TEXT_COMPONENT);
    if (uiText) { uiText.setText(text); return; }
    const tc = world.getComponent<TextComponent>(entity, TEXT_COMPONENT);
    if (tc) { tc.text = text; }
  }

  // ------------------------------------------------------------------
  // Heart victory: check if 3+ heart blocks are all connected
  // ------------------------------------------------------------------
  private countHearts(): number {
    let count = 0;
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        if (this.grid[r][c] === CELL_HEART_BLOCK) count++;
      }
    }
    return count;
  }

  private checkHeartsConnected(): boolean {
    // Find all heart positions
    const hearts: Array<{ c: number; r: number }> = [];
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        if (this.grid[r][c] === CELL_HEART_BLOCK) {
          hearts.push({ c, r });
        }
      }
    }
    if (hearts.length < HEARTS_NEEDED_FOR_WIN) return false;

    // 按行分组
    const heartsByRow = new Map<number, Array<{ c: number; r: number }>>();
    // 按列分组
    const heartsByCol = new Map<number, Array<{ c: number; r: number }>>();

    for (const heart of hearts) {
      // 添加到行分组
      if (!heartsByRow.has(heart.r)) {
        heartsByRow.set(heart.r, []);
      }
      heartsByRow.get(heart.r)!.push(heart);

      // 添加到列分组
      if (!heartsByCol.has(heart.c)) {
        heartsByCol.set(heart.c, []);
      }
      heartsByCol.get(heart.c)!.push(heart);
    }

    // 检查是否有至少HEARTS_NEEDED_FOR_WIN个心心方块在同一行且连续
    for (const [, rowHearts] of heartsByRow) {
      if (rowHearts.length >= HEARTS_NEEDED_FOR_WIN) {
        // 按X坐标排序
        rowHearts.sort((a, b) => a.c - b.c);

        // 检查连续的心心方块
        let consecutiveCount = 1;
        for (let i = 1; i < rowHearts.length; i++) {
          if (rowHearts[i].c === rowHearts[i - 1].c + 1) {
            consecutiveCount++;
            if (consecutiveCount >= HEARTS_NEEDED_FOR_WIN) {
              return true;
            }
          } else {
            consecutiveCount = 1; // 重新开始计数
          }
        }
      }
    }

    // 检查是否有至少HEARTS_NEEDED_FOR_WIN个心心方块在同一列且连续
    for (const [, colHearts] of heartsByCol) {
      if (colHearts.length >= HEARTS_NEEDED_FOR_WIN) {
        // 按Y坐标排序
        colHearts.sort((a, b) => a.r - b.r);

        // 检查连续的心心方块
        let consecutiveCount = 1;
        for (let i = 1; i < colHearts.length; i++) {
          if (colHearts[i].r === colHearts[i - 1].r + 1) {
            consecutiveCount++;
            if (consecutiveCount >= HEARTS_NEEDED_FOR_WIN) {
              return true;
            }
          } else {
            consecutiveCount = 1; // 重新开始计数
          }
        }
      }
    }

    return false;
  }

  // ------------------------------------------------------------------
  // Damage player
  // ------------------------------------------------------------------
  private damagePlayer(world: IWorld): void {
    if (!this.player || this.player.isInvincible) return;

    this.player.hp -= 1;
    setRunHp(this.player.hp);
    this.player.damageCooldown = PLAYER_DAMAGE_COOLDOWN;
    this.player.isInvincible = true;
    this.player.inputLockTimer = 0.3; // 300ms 锁定输入

    const sprite = world.getComponent<SpriteComponent>(this.player.entity, SPRITE_COMPONENT);
    if (sprite) {
      sprite.alpha = 1.0;
      let flashes = 0;
      const flash = () => {
        if (!this.player) return;
        flashes++;
        const bright = flashes % 2 === 1;
        sprite.alpha = bright ? 1.0 : 0.15;
        if (flashes < 6) {
          globalTweens.to(sprite, { alpha: bright ? 0.15 : 1.0 }, {
            duration: 0.07,
            easing: Easing.easeOutQuad,
            onComplete: flash,
          });
        } else {
          sprite.alpha = 0.45;
          globalTweens.to(sprite, { alpha: 1.0 }, {
            duration: PLAYER_DAMAGE_COOLDOWN - 0.5,
            easing: Easing.easeOutQuad,
          });
        }
      };
      flash();
    }

    if (this.player.hp <= 0) {
      this.gameOver(world, 'hp');
    }
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
    this.enemyCountEntity = 0;
    this.heartStatusEntity = 0;
    this.scoreEntity = 0;
    this.collectEntity = 0;
    this.hpEntity = 0;
    this.scoreDisplayEntity = 0;
    this.timeDisplayEntity = 0;
    this.levelDisplayEntity = 0;
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
