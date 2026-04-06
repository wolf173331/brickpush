import {
  Scene,
  EntityBuilder,
  UIEntityBuilder,
  globalEventBus,
  globalTheme,
  InputSystem,
  TransformComponent,
  SpriteComponent,
  TextComponent,
  UITextComponent,
  TRANSFORM_COMPONENT,
  SPRITE_COMPONENT,
  TEXT_COMPONENT,
  UI_TEXT_COMPONENT,
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
  isNpcSquirrelEnabled,
  NPC_HP,
  NPC_MOVE_COOLDOWN_MIN,
  NPC_MOVE_COOLDOWN_MAX,
  NPC_STUN_DURATION,
} from '../constants';
import { getRunHp, getRunScore, setRunHp, setRunScore } from '../gameProgress';
import { gameAudio } from '../audio';

const W = GAME_WIDTH;
const H = GAME_HEIGHT;

// ---- 移动速度配置 (像素/秒) ----
const PLAYER_MOVE_SPEED = 360;  // 玩家移动速度
const ENEMY_MOVE_SPEED = 280;   // 敌人移动速度
const NPC_MOVE_SPEED = 340;     // NPC移动速度
const BLOCK_PUSH_SPEED = 400;   // 方块推动速度

// ---- 转向配置 ----
const REDIRECT_THRESHOLD = 0.5;  // 移动进度超过此值后不能转向（0.5 = 半个格子）

//---随机主角颜色 ----
const Character_Color_Index : number [] = [
0xFF6600, //橙
0x6600FF,   //紫：
0xFF69B4,   //粉：
0x00CCFF,   //天蓝：
0x33CC33,   //草绿：
0xFFCC00,   //金黄：
0x990000,   //暗红：
0x003366,  //深蓝：
0xFFFFFF,   //白色
];



// ---- State interfaces ----

/** 移动状态接口 - 增强版支持中途转向 */
interface MovementState {
  isMoving: boolean;
  // 像素坐标
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  // 格子坐标
  sourceCol: number;
  sourceRow: number;
  targetCol: number;
  targetRow: number;
  // 进度
  progress: number;      // 0 ~ 1
  duration: number;      // 预计持续时间
  elapsed: number;       // 已用时间
  // 方向（用于判断是否同方向）
  direction: { dc: number; dr: number } | null;
}

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
  pushDistance: number;
  canBreakWalls: boolean;
  inputLockTimer: number;
  // 平滑移动状态
  movement: MovementState;
}

interface EnemyState {
  col: number;
  row: number;
  entity: EntityId;
  type: number;
  active: boolean;
  moveCooldown: number;
  stunTimer: number;
  activateTimer: number;
  dying: boolean;
  // 平滑移动状态
  movement: MovementState;
}

interface NpcState {
  col: number;
  row: number;
  entity: EntityId;
  hp: number;
  cooldown: number;
  stunTimer: number;
  moving: boolean;
  damageCooldown: number;
  isInvincible: boolean;
  // 平滑移动状态
  movement: MovementState;
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
    case ENEMY_TYPE_FROG: return base * 1.6;
    case ENEMY_TYPE_BLOB: return base * 1.0;
    case ENEMY_TYPE_BOW: return base * 1.2;
    case ENEMY_TYPE_GEAR: return base * 2.0;
    default: return base;
  }
}

/** 创建新的移动状态 */
function createMovementState(): MovementState {
  return {
    isMoving: false,
    startX: 0, startY: 0,
    targetX: 0, targetY: 0,
    sourceCol: 0, sourceRow: 0,
    targetCol: 0, targetRow: 0,
    progress: 0,
    duration: 0,
    elapsed: 0,
    direction: null,
  };
}

/** 初始化移动 */
function startMovement(
  state: MovementState, 
  startX: number, startY: number, 
  targetX: number, targetY: number, 
  sourceCol: number, sourceRow: number,
  targetCol: number, targetRow: number,
  dc: number, dr: number,
  speed: number
): void {
  state.isMoving = true;
  state.startX = startX;
  state.startY = startY;
  state.targetX = targetX;
  state.targetY = targetY;
  state.sourceCol = sourceCol;
  state.sourceRow = sourceRow;
  state.targetCol = targetCol;
  state.targetRow = targetRow;
  state.direction = { dc, dr };
  state.progress = 0;
  state.elapsed = 0;
  const distance = Math.sqrt((targetX - startX) ** 2 + (targetY - startY) ** 2);
  state.duration = distance / speed;
}

/** 更新移动状态，返回是否完成 */
function updateMovement(state: MovementState, dt: number): boolean {
  if (!state.isMoving) return false;
  
  state.elapsed += dt;
  state.progress = Math.min(1, state.elapsed / state.duration);
  
  if (state.progress >= 1) {
    state.isMoving = false;
    state.direction = null;
    return true; // 移动完成
  }
  return false;
}

/** 检查是否还可以转向（移动未超过阈值） */
function canRedirect(state: MovementState): boolean {
  if (!state.isMoving) return false;
  return state.progress < REDIRECT_THRESHOLD;
}

/** 从当前移动位置计算新的目标（用于中途转向） */
function redirectMovement(
  state: MovementState,
  newTargetX: number, newTargetY: number,
  newTargetCol: number, newTargetRow: number,
  newDc: number, newDr: number,
  speed: number
): void {
  // 获取当前位置
  const currentPos = getCurrentPosition(state);
  
  // 更新为新的移动目标
  state.startX = currentPos.x;
  state.startY = currentPos.y;
  state.targetX = newTargetX;
  state.targetY = newTargetY;
  state.targetCol = newTargetCol;
  state.targetRow = newTargetRow;
  state.direction = { dc: newDc, dr: newDr };
  state.progress = 0;
  state.elapsed = 0;
  
  const distance = Math.sqrt((newTargetX - currentPos.x) ** 2 + (newTargetY - currentPos.y) ** 2);
  state.duration = distance / speed;
}

/** 获取当前插值位置 */
function getCurrentPosition(state: MovementState): { x: number; y: number } {
  const t = 1 - (1 - state.progress) * (1 - state.progress); // easeOutQuad
  return {
    x: state.startX + (state.targetX - state.startX) * t,
    y: state.startY + (state.targetY - state.startY) * t,
  };
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
  private npc: NpcState | null = null;
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

  // ---- Non-grid entities ----
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

  // ---- Combo ----
  private comboCount = 0;
  private comboTimer = 0;

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
    const nextLevelHandler = () => { this.goToNextLevel(world); };
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
    if (this.nonGridEntities) this.nonGridEntities.clear();
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
    if (LEVELS.length === 0) {
      console.warn('No levels loaded, loading default levels...');
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

        if (isOuterRing) {
          this.grid[r][c] = CELL_SAFE;
          const key = gridKey(c, r);
          this.safeZones.add(key);
          this.outerGrassZones.add(key);
          continue;
        }

        switch (cell) {
          case CELL_WALL: this.grid[r][c] = CELL_WALL; break;
          case CELL_ITEM: this.grid[r][c] = CELL_ITEM; break;
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
          default: this.grid[r][c] = CELL_EMPTY; break;
        }
      }
    }
  }

  // ------------------------------------------------------------------
  // Create floor tiles
  // ------------------------------------------------------------------
  private createFloor(world: IWorld): void {
    this.trackEntity(
      EntityBuilder.create(world, W, H)
        .withBackground({ color: PALETTE.BACKGROUND })
        .build()
    );

    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const pos = gridToWorld(c, r);
        this.trackEntity(
          EntityBuilder.create(world, W, H)
            .withTransform({ x: pos.x, y: pos.y })
            .withSprite({
              textureId: this.outerGrassZones.has(gridKey(c, r)) ? ASSETS.GRASS : ASSETS.FLOOR,
              width: TILE_SIZE, height: TILE_SIZE, zIndex: Z_FLOOR,
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

        // Blocks
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
          const MC_Random_Color = Math.floor(Math.random() * ((Character_Color_Index.length-1)-1));
          const eid = EntityBuilder.create(world, W, H)
            .withTransform({ x: pos.x, y: pos.y })
            .withSprite({ textureId: ASSETS.PLAYER1, width: TILE_SIZE, height: TILE_SIZE, zIndex: Z_PLAYER })
            .withTint({ color: Character_Color_Index[MC_Random_Color] })
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
            movement: createMovementState(),
          };

          // NPC Squirrel
          if (isNpcSquirrelEnabled()) {
            const nc = c + 1, nr = r;
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
                movement: createMovementState(),
              };
            }
          }
        }

        if (raw === CELL_ENEMY_SPAWN) this.grid[r][c] = CELL_EMPTY;
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
    if (this.currentWave < this.totalWaves) this.nextWaveTimer = this.WAVE_INTERVAL;
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
        stunTimer: 0, activateTimer: activate ? 0 : ENEMY_SPAWN_ACTIVATE_DELAY,
        dying: false,
        movement: createMovementState(),
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
        candidates.push({ col: c, row: r, bucket: this.getSpawnBucket(r), nearbyObstacles: this.countNearbyObstacles(c, r) });
      }
    }

    const targetBuckets = this.getTargetSpawnBucketCounts(count, candidates);
    const targetVariants = this.getTargetBucketVariants(targetBuckets);

    for (const target of targetVariants) {
      const picked = this.tryBuildEnemySpawnSet(candidates, count, target);
      if (picked.length === count) return picked;
    }

    return candidates.slice(0, count).map(c => ({ col: c.col, row: c.row }));
  }

  private tryBuildEnemySpawnSet(candidates: SpawnCandidate[], count: number, targetBuckets: [number, number, number]): Array<{ col: number; row: number }> {
    const baseSeed = (this.currentLevelIndex + 1) * 9973 + count * 37;
    for (let attempt = 0; attempt < 80; attempt++) {
      let state = (baseSeed + attempt * 7919) >>> 0;
      const nextRandom = (): number => { state = (state * 1664525 + 1013904223) >>> 0; return state / 0x100000000; };

      const chosen: Array<{ col: number; row: number }> = [];
      const bucketCounts: [number, number, number] = [0, 0, 0];

      while (chosen.length < count) {
        const need = targetBuckets.map((target, idx) => Math.max(0, target - bucketCounts[idx])) as [number, number, number];
        const preferredBuckets = new Set(need.flatMap((value, idx) => (value > 0 ? [idx] : [])));
        const remaining = candidates.filter(c => !chosen.some(pick => pick.col === c.col && pick.row === c.row));

        const ranked = this.rankEnemySpawnCandidates(
          remaining.filter(c => preferredBuckets.size === 0 || preferredBuckets.has(c.bucket)),
          chosen, need, nextRandom
        );
        const fallback = ranked.length > 0 ? ranked : this.rankEnemySpawnCandidates(remaining, chosen, need, nextRandom);
        if (fallback.length === 0) break;

        const pick = fallback[0];
        chosen.push({ col: pick.col, row: pick.row });
        bucketCounts[pick.bucket]++;
      }

      if (chosen.length === count && this.countTrappedEnemySpawns(chosen) <= 2) return chosen;
    }
    return [];
  }

  private rankEnemySpawnCandidates(candidates: SpawnCandidate[], chosen: Array<{ col: number; row: number }>, need: [number, number, number], nextRandom: () => number): SpawnCandidate[] {
    return candidates
      .map(candidate => {
        const projected = [...chosen, { col: candidate.col, row: candidate.row }];
        const trapped = this.countTrappedEnemySpawns(projected);
        if (trapped > 2) return null;

        const exits = this.countEnemySpawnExits(projected, candidate.col, candidate.row);
        const minDistance = chosen.length === 0 ? 6
          : Math.min(...chosen.map(pick => Math.abs(pick.col - candidate.col) + Math.abs(pick.row - candidate.row)));
        const distToPlayer = this.player
          ? Math.abs(this.player.col - candidate.col) + Math.abs(this.player.row - candidate.row)
          : Math.abs(7 - candidate.col) + Math.abs(6 - candidate.row);

        const score = need[candidate.bucket] * 110 + Math.min(exits, 4) * 34 + Math.min(minDistance, 6) * 18
          + Math.min(distToPlayer, 8) * 4 + Math.min(candidate.nearbyObstacles, 5) * 5
          - Math.abs(candidate.row - 6) * 2 - trapped * 12 + (nextRandom() * 12 - 6);

        return { candidate, score };
      })
      .filter((entry): entry is { candidate: SpawnCandidate; score: number } => entry !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map(entry => entry.candidate);
  }

  private countEnemySpawnExits(occupied: Array<{ col: number; row: number }>, col: number, row: number): number {
    let exits = 0;
    for (const dir of ALL_DIRECTIONS) {
      const nc = col + dir.dc, nr = row + dir.dr;
      if (!inBounds(nc, nr)) continue;
      if (this.grid[nr][nc] !== CELL_EMPTY) continue;
      if (occupied.some(e => e.col === nc && e.row === nr)) continue;
      exits++;
    }
    return exits;
  }

  private countTrappedEnemySpawns(spawns: Array<{ col: number; row: number }>): number {
    return spawns.reduce((total, spawn) => {
      const occupied = spawns.filter(other => other !== spawn);
      return total + (this.countEnemySpawnExits(occupied, spawn.col, spawn.row) <= 2 ? 1 : 0);
    }, 0);
  }

  private getSpawnBucket(row: number): number { return row <= 4 ? 0 : row <= 7 ? 1 : 2; }

  private countNearbyObstacles(col: number, row: number): number {
    let total = 0;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dc === 0 && dr === 0) continue;
        const nc = col + dc, nr = row + dr;
        if (!inBounds(nc, nr)) continue;
        if (this.grid[nr][nc] !== CELL_EMPTY) total++;
      }
    }
    return total;
  }

  private getTargetSpawnBucketCounts(count: number, candidates: SpawnCandidate[]): [number, number, number] {
    const capacity: [number, number, number] = [0, 0, 0];
    for (const c of candidates) capacity[c.bucket]++;

    const target: [number, number, number] = [Math.floor(count / 3), Math.floor(count / 3), Math.floor(count / 3)];
    const remainder = count % 3;
    const order = [0, 2, 1];
    for (let i = 0; i < remainder; i++) target[order[i]]++;

    let overflow = 0;
    for (let i = 0; i < target.length; i++) {
      if (target[i] > capacity[i]) { overflow += target[i] - capacity[i]; target[i] = capacity[i]; }
    }

    while (overflow > 0) {
      const bestBucket = [0, 1, 2].reduce((best, cur) => {
        const bestRoom = capacity[best] - target[best];
        const curRoom = capacity[cur] - target[cur];
        return curRoom > bestRoom ? cur : best;
      }, 0);
      if (capacity[bestBucket] <= target[bestBucket]) break;
      target[bestBucket]++;
      overflow--;
    }

    return target;
  }

  private getTargetBucketVariants(target: [number, number, number]): Array<[number, number, number]> {
    const variants: Array<[number, number, number]> = [target];
    const swaps: Array<[number, number]> = [[0, 1], [1, 2], [0, 2]];

    for (const [from, to] of swaps) {
      if (target[from] <= 0) continue;
      variants.push(target.map((value, idx) => {
        if (idx === from) return value - 1;
        if (idx === to) return value + 1;
        return value;
      }) as [number, number, number]);
    }

    return variants.filter((variant, idx, list) => {
      if (variant.some(v => v < 0)) return false;
      return list.findIndex(other => other.every((v, i) => v === variant[i])) === idx;
    });
  }

  // ------------------------------------------------------------------
  // HUD
  // ------------------------------------------------------------------
  private createHUD(world: IWorld): void {
    this.trackEntity(
      EntityBuilder.create(world, W, H)
        .withTransform({ x: W / 2, y: HUD_TOP_Y + 10, screenSpace: true })
        .withSprite({ color: PALETTE.HUD_BG, width: W, height: 52, zIndex: Z_UI })
        .build()
    );

    const initHp = this.player?.hp ?? getRunHp();
    const initHearts = '♥'.repeat(Math.max(0, initHp));
    const initEmpty = '♡'.repeat(Math.max(0, PLAYER_MAX_HP - initHp));
    this.hpEntity = UIEntityBuilder.create(world, W, H)
      .withUITransform({ anchor: 'top-left', x: HUD_PADDING_X, y: 6, width: 160, height: 36 })
      .withText({ text: `HP: ${initHearts}${initEmpty}`, fontSize: 22, color: 0xff6666, align: 'left' })
      .build();
    this.trackEntity(this.hpEntity);

    this.scoreDisplayEntity = UIEntityBuilder.create(world, W, H)
      .withUITransform({ anchor: 'top-center', y: 6, width: 280, height: 36 })
      .withText({ text: '得分: 0', fontSize: 24, color: PALETTE.SCORE_GOLD, align: 'center' })
      .build();
    this.trackEntity(this.scoreDisplayEntity);

    const initTime = getLevelTimeLimit(this.currentLevelIndex, Math.max(LEVELS.length, 1));
    this.timeDisplayEntity = UIEntityBuilder.create(world, W, H)
      .withUITransform({ anchor: 'top-right', x: -HUD_PADDING_X, y: 4, width: 130, height: 40 })
      .withText({ text: `⏱ ${initTime}`, fontSize: 26, color: PALETTE.SCORE_CYAN, align: 'right' })
      .build();
    this.trackEntity(this.timeDisplayEntity);

    this.levelDisplayEntity = UIEntityBuilder.create(world, W, H)
      .withUITransform({ anchor: 'top-right', x: -HUD_PADDING_X, y: 46, width: 130, height: 26 })
      .withText({ text: `关卡: 1`, fontSize: 16, color: PALETTE.SCORE_CYAN, align: 'right' })
      .build();
    this.trackEntity(this.levelDisplayEntity);

    this.heartStatusEntity = UIEntityBuilder.create(world, W, H)
      .withUITransform({ anchor: 'top-right', x: -5, y: 90, width: 110, height: 80 })
      .withText({ text: '将♥\n连成一线!', fontSize: 16, color: PALETTE.HEART_RED, align: 'center' })
      .build();
    this.trackEntity(this.heartStatusEntity);
  }

  private createReadyOverlay(world: IWorld): void {
    this.readyEntity = UIEntityBuilder.create(world, W, H)
      .withUITransform({ anchor: 'center', width: 400, height: 80 })
      .withText({ text: 'READY', fontSize: 52, color: PALETTE.READY_TEXT, align: 'center' })
      .build();
    this.trackEntity(this.readyEntity);
  }

  private createTouchControls(world: IWorld): void {
    const screen = getScreenCategory(W, H);
    if (screen.category === 'desktop' || screen.category === 'large') return;

    const BTN = 80;
    const dirs = [
      { label: '▲', x: BTN + 370, y: -(BTN * 2 + 20), dc: 0, dr: -1 },
      { label: '▼', x: BTN + 370, y: -20, dc: 0, dr: 1 },
      { label: '◀', x: 370, y: -(BTN + 20), dc: -1, dr: 0 },
      { label: '▶', x: BTN * 2 + 370, y: -(BTN + 20), dc: 1, dr: 0 },
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
  // update - 主更新循环
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
      
      if (this.timeLeft > 0) {
        this.timeLeft -= dt;
        if (this.timeLeft <= 0) {
          this.timeLeft = 0;
          this.gameOver(world, 'time');
        }
      }

      // 更新所有实体的平滑移动
      this.updatePlayerMovement(world, dt);
      this.updateEnemyMovements(world, dt);
      this.updateNpcMovement(world, dt);

      // 更新敌人AI和其他逻辑
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
            score, victoryType: this.victoryType,
            levelName: LEVELS[this.currentLevelIndex]?.name ?? `ROUND-${this.currentLevelIndex + 1}`,
            canSubmitScore: score > 0,
          });
        }
      }
    }
  }

  // ------------------------------------------------------------------
  // 平滑移动更新
  // ------------------------------------------------------------------
  private updatePlayerMovement(world: IWorld, dt: number): void {
    if (!this.player || !this.player.movement.isMoving) return;

    const p = this.player;
    const completed = updateMovement(p.movement, dt);
    
    // 更新实体位置
    const transform = world.getComponent<TransformComponent>(p.entity, TRANSFORM_COMPONENT);
    if (transform) {
      const pos = getCurrentPosition(p.movement);
      transform.x = pos.x;
      transform.y = pos.y;
      
      // 每帧检测与敌人的碰撞（基于实际坐标，而非格子）
      this.checkPlayerEnemyCollisionDuringMovement(world, p, pos.x, pos.y);
    }

    if (completed) {
      // 移动完成，更新逻辑格子坐标到目标位置
      this.completePlayerMove(p);
      
      // 确保最终位置精确
      const finalPos = gridToWorld(p.col, p.row);
      if (transform) {
        transform.x = finalPos.x;
        transform.y = finalPos.y;
      }
    }
  }

  private updateEnemyMovements(world: IWorld, dt: number): void {
    for (const enemy of this.enemies) {
      if (!enemy.movement.isMoving) continue;

      const completed = updateMovement(enemy.movement, dt);
      
      const transform = world.getComponent<TransformComponent>(enemy.entity, TRANSFORM_COMPONENT);
      if (transform) {
        const pos = getCurrentPosition(enemy.movement);
        transform.x = pos.x;
        transform.y = pos.y;
        
        // 移动过程中检测与玩家/NPC的碰撞
        this.checkEnemyCollisionDuringMovement(world, enemy, pos.x, pos.y);
      }

      if (completed) {
        // 移动完成
        const finalPos = gridToWorld(enemy.col, enemy.row);
        if (transform) {
          transform.x = finalPos.x;
          transform.y = finalPos.y;
        }
        // 最终碰撞检测
        this.checkEnemyCollisionAtGrid(world, enemy, enemy.col, enemy.row);
      }
    }
  }

  private updateNpcMovement(world: IWorld, dt: number): void {
    if (!this.npc || !this.npc.movement.isMoving) return;

    const npc = this.npc;
    const completed = updateMovement(npc.movement, dt);
    
    const transform = world.getComponent<TransformComponent>(npc.entity, TRANSFORM_COMPONENT);
    if (transform) {
      const pos = getCurrentPosition(npc.movement);
      transform.x = pos.x;
      transform.y = pos.y;
    }

    if (completed) {
      npc.moving = false;
      const finalPos = gridToWorld(npc.col, npc.row);
      if (transform) {
        transform.x = finalPos.x;
        transform.y = finalPos.y;
      }
      // 落地后检测敌人碰撞
      for (const enemy of this.enemies) {
        if (enemy.active && !enemy.dying && enemy.col === npc.col && enemy.row === npc.row) {
          this.damageNpc(world, npc);
          break;
        }
      }
    }
  }

  // ------------------------------------------------------------------
  // 碰撞检测（基于实际坐标）
  // ------------------------------------------------------------------
  private checkPlayerEnemyCollisionDuringMovement(world: IWorld, _p: PlayerState, x: number, y: number): void {
    const playerRadius = TILE_SIZE * 0.3;
    
    for (const enemy of this.enemies) {
      if (!enemy.active || enemy.dying) continue;
      
      const enemyPos = this.getEnemyCurrentPosition(enemy);
      const dx = x - enemyPos.x;
      const dy = y - enemyPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      // 碰撞检测：两实体中心距离小于碰撞半径和
      if (dist < playerRadius + TILE_SIZE * 0.3) {
        this.damagePlayer(world);
        enemy.stunTimer = 1.2;
        break; // 只处理一次伤害
      }
    }
  }

  /* 保留：格子坐标碰撞检测（备用）
  private checkPlayerCollisionAtGrid(world: IWorld, col: number, row: number): void {
    const enemy = this.findEnemyAt(col, row);
    if (enemy && enemy.active && !enemy.dying) {
      this.damagePlayer(world);
      enemy.stunTimer = 1.2;
    }
  }
  */

  private checkEnemyCollisionDuringMovement(world: IWorld, enemy: EnemyState, x: number, y: number): void {
    const enemyRadius = TILE_SIZE * 0.3;
    
    // 检测与玩家的碰撞
    if (this.player && !this.player.isInvincible) {
      const playerPos = this.getPlayerCurrentPosition();
      const dx = x - playerPos.x;
      const dy = y - playerPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist < enemyRadius + TILE_SIZE * 0.3) {
        this.damagePlayer(world);
        enemy.stunTimer = 1.2;
      }
    }
    
    // 检测与NPC的碰撞
    if (this.npc && !this.npc.isInvincible) {
      const npcPos = this.getNpcCurrentPosition();
      const dx = x - npcPos.x;
      const dy = y - npcPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist < enemyRadius + TILE_SIZE * 0.3) {
        this.damageNpc(world, this.npc);
        enemy.stunTimer = 1.2;
      }
    }
  }

  private checkEnemyCollisionAtGrid(world: IWorld, enemy: EnemyState, col: number, row: number): void {
    if (this.player && this.player.col === col && this.player.row === row) {
      this.damagePlayer(world);
      enemy.stunTimer = 1.2;
    }
    if (this.npc && !this.npc.isInvincible && this.npc.col === col && this.npc.row === row) {
      this.damageNpc(world, this.npc);
      enemy.stunTimer = 1.2;
    }
  }

  private getPlayerCurrentPosition(): { x: number; y: number } {
    if (!this.player) return { x: 0, y: 0 };
    if (this.player.movement.isMoving) {
      return getCurrentPosition(this.player.movement);
    }
    return gridToWorld(this.player.col, this.player.row);
  }

  private getEnemyCurrentPosition(enemy: EnemyState): { x: number; y: number } {
    if (enemy.movement.isMoving) {
      return getCurrentPosition(enemy.movement);
    }
    return gridToWorld(enemy.col, enemy.row);
  }

  private getNpcCurrentPosition(): { x: number; y: number } {
    if (!this.npc) return { x: 0, y: 0 };
    if (this.npc.movement.isMoving) {
      return getCurrentPosition(this.npc.movement);
    }
    return gridToWorld(this.npc.col, this.npc.row);
  }

  private activateEnemies(world: IWorld): void { this.spawnNextWave(world); }
  private hideReady(world: IWorld): void { if (this.readyEntity) world.destroyEntity(this.readyEntity); }

  // ------------------------------------------------------------------
  // Player input
  // ------------------------------------------------------------------
  private handlePlayerInput(world: IWorld, dt: number): void {
    const p = this.player;
    if (!p) return;

    // 更新无敌时间
    if (p.damageCooldown > 0) {
      p.damageCooldown -= dt;
      if (p.damageCooldown <= 0) p.isInvincible = false;
    }

    // 受伤锁定输入
    if (p.inputLockTimer > 0) { p.inputLockTimer -= dt; return; }
    
    // 冷却中
    if (p.cooldown > 0) { p.cooldown -= dt; return; }

    // 获取输入
    const input = world.getSystem<InputSystem>('InputSystem');
    if (!input) return;

    let dc = 0, dr = 0;
    if (input.isKeyDown(KEYS.W) || input.isKeyDown(KEYS.UP)) dr = -1;
    else if (input.isKeyDown(KEYS.S) || input.isKeyDown(KEYS.DOWN)) dr = 1;
    else if (input.isKeyDown(KEYS.A) || input.isKeyDown(KEYS.LEFT)) dc = -1;
    else if (input.isKeyDown(KEYS.D) || input.isKeyDown(KEYS.RIGHT)) dc = 1;

    if (dc === 0 && dr === 0 && this.touchDir) {
      dc = this.touchDir.dc; dr = this.touchDir.dr;
      this.touchDir = null;
    }

    // 无输入则返回
    if (dc === 0 && dr === 0) return;

    // 正在移动中
    if (p.movement.isMoving) {
      // 检查是否可以转向（未超过阈值）
      if (canRedirect(p.movement)) {
        const currentDir = p.movement.direction;
        
        // 同方向：忽略
        if (currentDir && currentDir.dc === dc && currentDir.dr === dr) {
          return;
        }
        
        // 新方向：计算从当前位置到新目标格子的转向
        this.tryRedirectPlayer(world, p, dc, dr);
      }
      // 超过阈值不能转向，忽略输入
      return;
    }

    // 不在移动中，正常移动
    if (dc !== 0 || dr !== 0) this.tryMovePlayer(world, p, dc, dr);
  }

  /** 尝试中途转向 */
  private tryRedirectPlayer(_world: IWorld, p: PlayerState, dc: number, dr: number): void {
    // 从当前实际位置计算新的目标格子
    const currentCol = p.movement.sourceCol;
    const currentRow = p.movement.sourceRow;
    const newTargetCol = currentCol + dc;
    const newTargetRow = currentRow + dr;
    
    if (!inBounds(newTargetCol, newTargetRow)) return;
    
    // 检查新目标是否可移动（简化版，只检查空地）
    const targetCell = this.grid[newTargetRow][newTargetCol];
    if (targetCell !== CELL_EMPTY && targetCell !== CELL_SAFE && targetCell !== CELL_ITEM) {
      // 新方向有障碍，不能转向
      return;
    }
    
    // 恢复原格子状态
    this.grid[p.movement.targetCol][p.movement.targetRow] = CELL_EMPTY;
    
    // 设置新目标
    const newTarget = gridToWorld(newTargetCol, newTargetRow);
    
    // 执行转向
    redirectMovement(
      p.movement,
      newTarget.x, newTarget.y,
      newTargetCol, newTargetRow,
      dc, dr,
      PLAYER_MOVE_SPEED
    );
    
    // 更新网格状态
    this.grid[newTargetRow][newTargetCol] = CELL_PLAYER;
    
    gameAudio.playWalk();
  }

  private tryMovePlayer(world: IWorld, p: PlayerState, dc: number, dr: number): void {
    const tc = p.col + dc, tr = p.row + dr;
    if (!inBounds(tc, tr)) return;

    const targetCell = this.grid[tr][tc];

    // 检查敌人
    const enemy = this.findEnemyAt(tc, tr);
    if (enemy) {
      if (!enemy.active) { /* 可以穿过 */ }
      else { this.damagePlayer(world); p.cooldown = PLAYER_MOVE_COOLDOWN; return; }
    }

    // 检查NPC
    if (this.npc && this.npc.col === tc && this.npc.row === tr) {
      if (p.canBreakWalls && !this.npc.isInvincible) {
        this.tryPushNpc(world, p, tc, tr, dc, dr);
      } else { p.cooldown = PLAYER_MOVE_COOLDOWN; }
      return;
    }

    // 空地或安全区
    if (targetCell === CELL_EMPTY || targetCell === CELL_SAFE) {
      this.movePlayerTo(world, p, tc, tr, dc, dr);
      return;
    }

    // 道具
    if (targetCell === CELL_ITEM) {
      this.collectItem(world, p, tc, tr);
      this.movePlayerTo(world, p, tc, tr, dc, dr);
      return;
    }

    // 碎墙能力
    // ---- WALL: 有powerup时可以像推动方块一样推动（距离为1）
    if (targetCell === CELL_WALL && p.canBreakWalls) {
      const { finalC, finalR, distance } = this.calculatePushPath(tc, tr, dc, dr, 1);
      if (distance > 0) {
        // 路径上有敌人则压死
        for (let i = 1; i <= distance; i++) {
          const checkC = tc + dc * i;
          const checkR = tr + dr * i;
          const enemyInPath = this.findEnemyAt(checkC, checkR);
          if (enemyInPath) this.crushEnemy(world, p, enemyInPath);
        }
        this.pushWall(world, tc, tr, finalC, finalR);
        this.movePlayerTo(world, p, tc, tr, dc, dr);
        return;
      } else {
        // 无法推动（被阻挡），墙碎裂
        this.handleEdgePushWall(world, p, tc, tr, dc, dr);
        return;
      }
    }

    // 炸弹
    if (targetCell === CELL_BOMB) {
      this.pushBombUntilCollision(world, p, tc, tr, dc, dr);
      return;
    }

    // 可推方块
    if (this.isPushable(targetCell)) {
      const { finalC, finalR, distance } = this.calculatePushPath(tc, tr, dc, dr, p.pushDistance);
      if (distance > 0) {
        for (let i = 1; i <= distance; i++) {
          const checkC = tc + dc * i, checkR = tr + dr * i;
          const enemyInPath = this.findEnemyAt(checkC, checkR);
          if (enemyInPath) this.crushEnemy(world, p, enemyInPath);
        }
        this.pushBlock(world, tc, tr, finalC, finalR, targetCell);
        this.movePlayerTo(world, p, tc, tr, dc, dr);
        return;
      } else {
        this.handleEdgePush(world, p, tc, tr, targetCell, dc, dr);
        return;
      }
    }
  }

  private isPushable(cell: number): boolean {
    return cell === CELL_BLOCK || cell === CELL_STAR_BLOCK || cell === CELL_HEART_BLOCK || cell === CELL_BOMB;
  }

  private calculateBombSlidePath(startC: number, startR: number, dc: number, dr: number): 
    { finalC: number; finalR: number; distance: number; hitEnemy: boolean } {
    let finalC = startC, finalR = startR, distance = 0;
    for (let i = 1; ; i++) {
      const testC = startC + dc * i, testR = startR + dr * i;
      if (!inBounds(testC, testR)) break;
      if (this.findEnemyAt(testC, testR)) return { finalC: testC, finalR: testR, distance: i, hitEnemy: true };
      const cell = this.grid[testR][testC];
      const canOccupySafe = cell === CELL_SAFE && !this.outerGrassZones.has(gridKey(testC, testR));
      if (cell === CELL_EMPTY || cell === CELL_ITEM || canOccupySafe) {
        finalC = testC; finalR = testR; distance = i;
        continue;
      }
      break;
    }
    return { finalC, finalR, distance, hitEnemy: false };
  }

  private calculatePushPath(startC: number, startR: number, dc: number, dr: number, maxDistance: number):
    { finalC: number; finalR: number; distance: number } {
    let finalC = startC, finalR = startR, distance = 0;
    for (let i = 1; i <= maxDistance; i++) {
      const testC = startC + dc * i, testR = startR + dr * i;
      if (!inBounds(testC, testR)) break;
      const cell = this.grid[testR][testC];
      const canOccupySafe = cell === CELL_SAFE && !this.outerGrassZones.has(gridKey(testC, testR));
      if (cell === CELL_EMPTY || cell === CELL_ITEM || canOccupySafe) {
        finalC = testC; finalR = testR; distance = i;
      } else if (cell === CELL_WALL || this.isPushable(cell)) {
        break;
      } else if (this.findEnemyAt(testC, testR)) {
        finalC = testC; finalR = testR; distance = i;
        continue;
      } else break;
    }
    return { finalC, finalR, distance };
  }

  private handleEdgePush(world: IWorld, p: PlayerState, blockC: number, blockR: number, cellType: number,
    dc: number, dr: number): void {
    const key = gridKey(blockC, blockR);
    const blockEntity = this.entityMap.get(key);

    if (cellType === CELL_BLOCK) {
      gameAudio.playPush();
      p.score += SCORE_BLOCK_BREAK;
      this.spawnScorePopup(world, blockC, blockR, SCORE_BLOCK_BREAK, PALETTE.BREAK_WHITE);
      this.destroyBlockAt(world, blockC, blockR);
      this.spawnBreakEffect(world, blockC, blockR, 0x44bbaa);
      this.movePlayerTo(world, p, blockC, blockR, dc, dr);
      return;
    }

    if (cellType === CELL_STAR_BLOCK) {
      gameAudio.playPush();
      p.score += SCORE_STAR_BREAK;
      this.spawnScorePopup(world, blockC, blockR, SCORE_STAR_BREAK, PALETTE.SCORE_GOLD);
      this.destroyBlockAt(world, blockC, blockR);
      this.spawnBreakEffect(world, blockC, blockR, 0xffd700);
      this.spawnItemAt(world, blockC, blockR, ASSETS.PUSH_POWERUP);
      p.cooldown = PLAYER_MOVE_COOLDOWN;
      return;
    }

    if (cellType === CELL_BOMB) {
      gameAudio.playPush();
      this.explodeSingleBomb(world, p, blockC, blockR);
      if (this.grid[blockR][blockC] === CELL_EMPTY) {
        this.movePlayerTo(world, p, blockC, blockR, dc, dr);
      } else { p.cooldown = PLAYER_MOVE_COOLDOWN; }
      return;
    }

    if (cellType === CELL_HEART_BLOCK) {
      gameAudio.playPush();
      p.cooldown = PLAYER_MOVE_COOLDOWN;
      if (blockEntity !== undefined) {
        const transform = world.getComponent<TransformComponent>(blockEntity, TRANSFORM_COMPONENT);
        if (transform) {
          // 简单的缩放反馈
          transform.scaleX = 1.1; transform.scaleY = 1.1;
          setTimeout(() => { transform.scaleX = 1.0; transform.scaleY = 1.0; }, 60);
        }
      }
      return;
    }
  }

  // ------------------------------------------------------------------
  // Handle edge push for WALL (墙推到边缘碎裂)
  // ------------------------------------------------------------------
  private handleEdgePushWall(world: IWorld, p: PlayerState, wallC: number, wallR: number, dc: number, dr: number): void {
    gameAudio.playPush();
    p.score += SCORE_WALL_BREAK;
    this.spawnScorePopup(world, wallC, wallR, SCORE_WALL_BREAK, PALETTE.BREAK_WHITE);
    this.destroyWallAt(world, wallC, wallR);
    this.spawnBreakEffect(world, wallC, wallR, 0x333333);
    this.movePlayerTo(world, p, wallC, wallR, dc, dr);
  }

  // ------------------------------------------------------------------
  // Push wall to new position (墙被推动后的处理)
  // ------------------------------------------------------------------
  private pushWall(world: IWorld, fromC: number, fromR: number, toC: number, toR: number): void {
    gameAudio.playPush();
    const key = gridKey(fromC, fromR);
    const wallEntity = this.entityMap.get(key);

    this.grid[fromR][fromC] = this.safeZones.has(key) ? CELL_SAFE : CELL_EMPTY;
    this.grid[toR][toC] = CELL_WALL;
    this.entityMap.delete(key);
    if (wallEntity !== undefined) this.entityMap.set(gridKey(toC, toR), wallEntity);

    // 移动墙实体
    if (wallEntity !== undefined) {
      const target = gridToWorld(toC, toR);
      const transform = world.getComponent<TransformComponent>(wallEntity, TRANSFORM_COMPONENT);
      if (transform) {
        transform.x = target.x;
        transform.y = target.y;
      }
    }
  }

  private pushBombUntilCollision(world: IWorld, p: PlayerState, bombC: number, bombR: number, dc: number, dr: number): void {
    const { finalC, finalR, distance, hitEnemy } = this.calculateBombSlidePath(bombC, bombR, dc, dr);

    if (distance === 0) {
      this.explodeSingleBomb(world, p, bombC, bombR);
      p.cooldown = PLAYER_MOVE_COOLDOWN;
      return;
    }

    if (hitEnemy) {
      this.movePlayerTo(world, p, bombC, bombR, dc, dr);
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

    const duration = this.pushBlock(world, bombC, bombR, finalC, finalR, CELL_BOMB);
    this.movePlayerTo(world, p, bombC, bombR, dc, dr);

    setTimeout(() => {
      if (!this.isActive || this.phase === 'complete') return;
      this.explodeSingleBomb(world, p, finalC, finalR);
    }, Math.max(0, Math.round(duration * 1000)));
  }

  private destroyBlockAt(world: IWorld, c: number, r: number): void {
    if (this.grid[r][c] === CELL_HEART_BLOCK) { console.warn('Attempted to destroy a heart block at', c, r); return; }
    const key = gridKey(c, r);
    const ent = this.entityMap.get(key);
    if (ent !== undefined) { world.destroyEntity(ent); this.entityMap.delete(key); }
    this.grid[r][c] = this.safeZones.has(key) ? CELL_SAFE : CELL_EMPTY;
    const bIdx = this.bombs.findIndex(b => b.col === c && b.row === r);
    if (bIdx >= 0) this.bombs.splice(bIdx, 1);
  }

  private destroyWallAt(world: IWorld, c: number, r: number): void {
    const key = gridKey(c, r);
    const ent = this.entityMap.get(key);
    if (ent !== undefined) { world.destroyEntity(ent); this.entityMap.delete(key); }
    this.grid[r][c] = CELL_EMPTY;
  }

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
        // 使用简单的setTimeout代替tween
        const startTime = Date.now();
        const duration = 400;
        const animate = () => {
          const elapsed = Date.now() - startTime;
          const t = Math.min(1, elapsed / duration);
          transform.x = pos.x + (tx - pos.x) * t;
          transform.y = pos.y + (ty - pos.y) * t;
          if (sprite) sprite.alpha = 1 - t;
          if (t < 1) requestAnimationFrame(animate);
          else world.destroyEntity(eid);
        };
        animate();
      }
    }
  }

  private spawnItemAt(world: IWorld, c: number, r: number, tex: string): void {
    const key = gridKey(c, r);
    if (this.grid[r][c] !== CELL_EMPTY && !this.safeZones.has(key)) return;
    const pos = gridToWorld(c, r);
    const eid = EntityBuilder.create(world, W, H)
      .withTransform({ x: pos.x, y: pos.y })
      .withSprite({ textureId: tex, width: TILE_SIZE, height: TILE_SIZE, zIndex: Z_ITEM })
      .build();
    this.trackEntity(eid);
    this.entityMap.set(key, eid);
    this.grid[r][c] = CELL_ITEM;

    if (tex === ASSETS.PUSH_POWERUP) {
      const textEid = EntityBuilder.create(world, W, H)
        .withTransform({ x: pos.x, y: pos.y })
        .withText({ text: 'P', fontSize: 24, color: 0xffffff, align: 'center', zIndex: Z_ITEM + 1 })
        .build();
      this.trackEntity(textEid);
      this.itemDecorationMap.set(key, [textEid]);
    }
  }

  private clearItemAt(world: IWorld, c: number, r: number): void {
    const key = gridKey(c, r);
    const itemEntity = this.entityMap.get(key);
    if (itemEntity !== undefined) { world.destroyEntity(itemEntity); this.entityMap.delete(key); }
    const decorations = this.itemDecorationMap.get(key);
    if (decorations) { for (const eid of decorations) world.destroyEntity(eid); this.itemDecorationMap.delete(key); }
    if (this.grid[r][c] === CELL_ITEM) this.grid[r][c] = this.safeZones.has(key) ? CELL_SAFE : CELL_EMPTY;
  }

  private explodeSingleBomb(world: IWorld, p: PlayerState, bc: number, br: number): void {
    const bIdx = this.bombs.findIndex(b => b.col === bc && b.row === br && !b.exploded);
    if (bIdx < 0) return;
    this.bombs[bIdx].exploded = true;
    gameAudio.playExplosion();
    this.destroyBlockAt(world, bc, br);

    if (this.isPlayerInExplosionRange(bc, br)) this.damagePlayer(world);

    for (let dr = -BOMB_EXPLOSION_RANGE; dr <= BOMB_EXPLOSION_RANGE; dr++) {
      for (let dc = -BOMB_EXPLOSION_RANGE; dc <= BOMB_EXPLOSION_RANGE; dc++) {
        const ec = bc + dc, er = br + dr;
        if (!inBounds(ec, er)) continue;
        if (ec === bc && er === br) continue;

        if (this.grid[er][ec] === CELL_WALL) {
          this.destroyWallAt(world, ec, er);
          this.spawnBreakEffect(world, ec, er, 0x222222);
          continue;
        }
        const cell = this.grid[er][ec];
        if (cell === CELL_BLOCK || cell === CELL_STAR_BLOCK) this.destroyBlockAt(world, ec, er);
        if (cell === CELL_BOMB) this.explodeSingleBomb(world, p, ec, er);
        const enemy = this.findEnemyAt(ec, er);
        if (enemy) { this.killEnemyScore(world, p, ec, er); this.destroyEnemy(world, enemy); }
      }
    }
    this.spawnExplosionFlash(world, bc, br);
  }

  private isPlayerInExplosionRange(bc: number, br: number): boolean {
    if (!this.player) return false;
    return Math.abs(this.player.col - bc) <= BOMB_EXPLOSION_RANGE && Math.abs(this.player.row - br) <= BOMB_EXPLOSION_RANGE;
  }

  // ------------------------------------------------------------------
  // 移动玩家（新的平滑移动方式）
  // ------------------------------------------------------------------
  private movePlayerTo(world: IWorld, p: PlayerState, tc: number, tr: number, dc: number, dr: number): void {
    // 更新网格逻辑 - 源格子变空（或安全区）
    this.grid[p.row][p.col] = this.safeZones.has(gridKey(p.col, p.row)) ? CELL_SAFE : CELL_EMPTY;
    this.grid[tr][tc] = CELL_PLAYER;

    // 注意：这里不立即更新 p.col/p.row，而是等移动完成后再更新
    // 这样碰撞检测基于实际坐标，而不是提前占用目标格子
    const sourceCol = p.col;
    const sourceRow = p.row;
    
    p.cooldown = PLAYER_MOVE_COOLDOWN;
    p.moving = true;
    gameAudio.playWalk();

    // 获取当前实体位置
    const transform = world.getComponent<TransformComponent>(p.entity, TRANSFORM_COMPONENT);
    if (transform) {
      const startX = transform.x;
      const startY = transform.y;
      const target = gridToWorld(tc, tr);
      
      // 初始化移动状态 - 传入完整的格子坐标和方向
      startMovement(
        p.movement, 
        startX, startY, 
        target.x, target.y,
        sourceCol, sourceRow,
        tc, tr,
        dc, dr,
        PLAYER_MOVE_SPEED
      );
    } else {
      p.moving = false;
    }
  }

  /** 完成移动，更新格子坐标 */
  private completePlayerMove(p: PlayerState): void {
    if (p.movement.isMoving) return;
    
    // 更新逻辑格子坐标到目标位置
    p.col = p.movement.targetCol;
    p.row = p.movement.targetRow;
    p.moving = false;
  }

  // ------------------------------------------------------------------
  // 推动方块（新的平滑移动方式）
  // ------------------------------------------------------------------
  private pushBlock(world: IWorld, fromC: number, fromR: number, toC: number, toR: number, cellType: number): number {
    gameAudio.playPush();
    const key = gridKey(fromC, fromR);
    const blockEntity = this.entityMap.get(key);

    if (this.grid[toR][toC] === CELL_ITEM) this.clearItemAt(world, toC, toR);

    this.grid[fromR][fromC] = this.safeZones.has(key) ? CELL_SAFE : CELL_EMPTY;
    this.grid[toR][toC] = cellType;
    this.entityMap.delete(key);
    if (blockEntity !== undefined) this.entityMap.set(gridKey(toC, toR), blockEntity);

    for (const b of this.bombs) {
      if (b.col === fromC && b.row === fromR) { b.col = toC; b.row = toR; break; }
    }

    if (blockEntity !== undefined) {
      const target = gridToWorld(toC, toR);
      const transform = world.getComponent<TransformComponent>(blockEntity, TRANSFORM_COMPONENT);
      if (transform) {
        const distance = Math.max(Math.abs(toC - fromC), Math.abs(toR - fromR));
        const duration = distance * TILE_SIZE / BLOCK_PUSH_SPEED;
        
        // 立即设置目标位置为最终位置（逻辑上）
        transform.x = target.x;
        transform.y = target.y;
        
        return duration;
      }
    }
    return 0.1;
  }

  private collectItem(world: IWorld, p: PlayerState, c: number, r: number): void {
    const key = gridKey(c, r);
    const itemEntity = this.entityMap.get(key);
    if (itemEntity !== undefined) {
      const sprite = world.getComponent<SpriteComponent>(itemEntity, SPRITE_COMPONENT);
      let scoreVal = SCORE_YELLOW_ITEM;

      if (sprite) {
        if (sprite.textureId === ASSETS.ITEM_BLUE) scoreVal = SCORE_BLUE_ITEM;
        if (sprite.textureId === ASSETS.PUSH_POWERUP) {
          p.pushDistance = Math.min(p.pushDistance + 1, PLAYER_MAX_PUSH_DISTANCE);
          p.canBreakWalls = true;
          this.spawnPowerupText(world, c, r, '推力+1 / 可推墙!', 0xff8800);
          gameAudio.playCoin();
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

  private findEnemyAt(c: number, r: number): EnemyState | null {
    for (const e of this.enemies) {
      if (e.col === c && e.row === r && e.active && !e.dying) return e;
    }
    return null;
  }

  private killEnemyScore(world: IWorld, p: PlayerState, ec: number, er: number): void {
    this.comboCount++;
    this.comboTimer = COMBO_WINDOW;
    const score = Math.min(COMBO_BASE_KILL + (this.comboCount - 1) * COMBO_INCREMENT, COMBO_MAX);
    p.score += score;
    const color = this.comboCount >= 3 ? 0xff4400 : PALETTE.SCORE_GOLD;
    const label = this.comboCount >= 2 ? `COMBO×${this.comboCount}  +${score}` : `+${score}`;
    this.spawnScorePopup(world, ec, er, score, color, label);
  }

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

    // 简单的压扁动画
    const transform = world.getComponent<TransformComponent>(enemy.entity, TRANSFORM_COMPONENT);
    const sprite = world.getComponent<SpriteComponent>(enemy.entity, SPRITE_COMPONENT);
    if (transform) {
      transform.scaleX = 2.2; transform.scaleY = 0.15;
      setTimeout(() => {
        transform.scaleX = 1.8; transform.scaleY = 0.25;
        setTimeout(() => {
          if (sprite) {
            const fade = () => {
              sprite.alpha -= 0.05;
              if (sprite.alpha > 0) requestAnimationFrame(fade);
              else {
                world.destroyEntity(enemy.entity);
                this.maybeDropItem(world, enemy.col, enemy.row, enemy.type);
              }
            };
            fade();
          } else {
            world.destroyEntity(enemy.entity);
            this.maybeDropItem(world, enemy.col, enemy.row, enemy.type);
          }
        }, 100);
      }, 80);
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
      const startTime = Date.now();
      const duration = 900;
      const startY = pos.y;
      const animate = () => {
        const elapsed = Date.now() - startTime;
        const t = Math.min(1, elapsed / duration);
        transform.y = startY - 48 * t;
        if (t < 1) requestAnimationFrame(animate);
        else world.destroyEntity(eid);
      };
      animate();
    }
  }

  private spawnPowerupText(world: IWorld, c: number, r: number, text: string, color: number): void {
    const pos = gridToWorld(c, r);
    const eid = EntityBuilder.create(world, W, H)
      .withTransform({ x: pos.x, y: pos.y })
      .withText({ text, fontSize: 22, color, align: 'center', zIndex: Z_SCORE_POPUP })
      .build();
    this.trackEntity(eid);

    const transform = world.getComponent<TransformComponent>(eid, TRANSFORM_COMPONENT);
    if (transform) {
      const startTime = Date.now();
      const duration = 1200;
      const startY = pos.y;
      const animate = () => {
        const elapsed = Date.now() - startTime;
        const t = Math.min(1, elapsed / duration);
        transform.y = startY - 60 * t;
        if (t < 1) requestAnimationFrame(animate);
        else world.destroyEntity(eid);
      };
      animate();
    }
  }

  // ------------------------------------------------------------------
  // NPC Squirrel AI
  // ------------------------------------------------------------------
  private updateNpc(world: IWorld, dt: number): void {
    const npc = this.npc;
    if (!npc) return;

    if (npc.damageCooldown > 0) {
      npc.damageCooldown -= dt;
      if (npc.damageCooldown <= 0) npc.isInvincible = false;
    }
    if (npc.stunTimer > 0) { npc.stunTimer -= dt; return; }
    if (npc.moving || npc.movement.isMoving) return;
    if (npc.cooldown > 0) { npc.cooldown -= dt; return; }

    const hearts: Array<{ c: number; r: number }> = [];
    for (let r = 0; r < GRID_ROWS; r++)
      for (let c = 0; c < GRID_COLS; c++)
        if (this.grid[r][c] === CELL_HEART_BLOCK) hearts.push({ c, r });

    if (hearts.length === 0) return;

    hearts.sort((a, b) => (Math.abs(a.c - npc.col) + Math.abs(a.r - npc.row)) - (Math.abs(b.c - npc.col) + Math.abs(b.r - npc.row)));
    const target = hearts[0];

    let dirs = [...ALL_DIRECTIONS];
    if (Math.random() > 0.3) {
      dirs.sort((a, b) => {
        const da = Math.abs((npc.col + a.dc) - target.c) + Math.abs((npc.row + a.dr) - target.r);
        const db = Math.abs((npc.col + b.dc) - target.c) + Math.abs((npc.row + b.dr) - target.r);
        return da - db;
      });
      if (Math.random() < 0.25 && dirs.length > 1) [dirs[0], dirs[1]] = [dirs[1], dirs[0]];
    } else dirs = dirs.sort(() => Math.random() - 0.5);

    for (const dir of dirs) {
      const nc = npc.col + dir.dc, nr = npc.row + dir.dr;
      if (!inBounds(nc, nr)) continue;
      const cell = this.grid[nr][nc];

      if (cell === CELL_EMPTY || cell === CELL_SAFE) {
        this.moveNpcTo(world, npc, nc, nr, dir.dc, dir.dr);
        break;
      }
      if (cell === CELL_HEART_BLOCK) {
        const bc = nc + dir.dc, br = nr + dir.dr;
        if (inBounds(bc, br) && this.grid[br][bc] === CELL_EMPTY) {
          this.pushBlock(world, nc, nr, bc, br, CELL_HEART_BLOCK);
          this.moveNpcTo(world, npc, nc, nr, dir.dc, dir.dr);
          break;
        }
      }
      if (cell === CELL_BLOCK) {
        const bc = nc + dir.dc, br = nr + dir.dr;
        if (inBounds(bc, br) && this.grid[br][bc] === CELL_EMPTY) {
          this.pushBlock(world, nc, nr, bc, br, CELL_BLOCK);
          this.moveNpcTo(world, npc, nc, nr, dir.dc, dir.dr);
          break;
        }
      }
    }
    npc.cooldown = NPC_MOVE_COOLDOWN_MIN + Math.random() * (NPC_MOVE_COOLDOWN_MAX - NPC_MOVE_COOLDOWN_MIN);
  }

  private tryPushNpc(world: IWorld, p: PlayerState, npcC: number, npcR: number, dc: number, dr: number): void {
    const npc = this.npc!;
    let finalC = npcC, finalR = npcR, distance = 0;
    let crushEnemyAt: { c: number; r: number; enemy: EnemyState } | null = null;
    
    for (let i = 1; i <= PLAYER_MAX_PUSH_DISTANCE; i++) {
      const cc = npcC + dc * i, cr = npcR + dr * i;
      if (!inBounds(cc, cr)) break;
      const cell = this.grid[cr][cc];
      if (cell === CELL_EMPTY || cell === CELL_SAFE) { finalC = cc; finalR = cr; distance = i; }
      else if (this.findEnemyAt(cc, cr)) { 
        const enemy = this.findEnemyAt(cc, cr)!;
        crushEnemyAt = { c: cc, r: cr, enemy };
        finalC = cc; finalR = cr; distance = i; break; 
      }
      else break;
    }

    if (distance === 0) { p.cooldown = PLAYER_MOVE_COOLDOWN; return; }

    this.grid[npc.row][npc.col] = CELL_EMPTY;
    npc.col = finalC; npc.row = finalR;
    this.grid[finalR][finalC] = CELL_PLAYER;

    const npcTransform = world.getComponent<TransformComponent>(npc.entity, TRANSFORM_COMPONENT);
    const npcSprite = world.getComponent<SpriteComponent>(npc.entity, SPRITE_COMPONENT);
    
    if (npcTransform) {
      const target = gridToWorld(finalC, finalR);
      
      // 根据推动方向计算变形
      const isHorizontal = Math.abs(dc) > 0;
      const isVertical = Math.abs(dr) > 0;
      
      // 变形阶段：根据方向压扁/拉伸
      const squashX = isHorizontal ? 1.4 : 0.6;
      const squashY = isVertical ? 1.4 : 0.6;
      
      const originalScaleX = npcTransform.scaleX;
      const originalScaleY = npcTransform.scaleY;
      
      npcTransform.scaleX = squashX;
      npcTransform.scaleY = squashY;
      
      if (npcSprite) npcSprite.alpha = 0.7;
      
      // 延迟后开始滑动
      setTimeout(() => {
        if (!this.isActive) return;
        
        if (npcTransform) {
          npcTransform.scaleX = originalScaleX;
          npcTransform.scaleY = originalScaleY;
        }
        if (npcSprite) npcSprite.alpha = 1.0;
        
        startMovement(npc.movement, npcTransform.x, npcTransform.y, target.x, target.y, npcC, npcR, finalC, finalR, dc, dr, NPC_MOVE_SPEED * 2.0);
        npc.moving = true;
        
        if (isHorizontal) {
          npcTransform.scaleX = 1.15;
          npcTransform.scaleY = 0.9;
        } else {
          npcTransform.scaleX = 0.9;
          npcTransform.scaleY = 1.15;
        }
        
        // 检查是否需要在移动过程中压扁怪物
        if (crushEnemyAt) {
          const checkCrush = () => {
            if (!npc.movement.isMoving) {
              // 移动完成，压扁怪物
              this.crushEnemy(world, p, crushEnemyAt!.enemy);
              // 恢复大小
              if (npcTransform) {
                npcTransform.scaleX = originalScaleX;
                npcTransform.scaleY = originalScaleY;
              }
            } else {
              // 检查是否到达怪物位置
              const currentPos = getCurrentPosition(npc.movement);
              const enemyWorldPos = gridToWorld(crushEnemyAt!.c, crushEnemyAt!.r);
              const dist = Math.sqrt(
                (currentPos.x - enemyWorldPos.x) ** 2 + 
                (currentPos.y - enemyWorldPos.y) ** 2
              );
              
              // 距离足够近时压扁怪物
              if (dist < TILE_SIZE * 0.3) {
                this.crushEnemy(world, p, crushEnemyAt!.enemy);
                crushEnemyAt = null; // 只压一次
              }
              
              if (npc.movement.isMoving) {
                setTimeout(checkCrush, 16); // 每帧检查
              } else {
                // 移动结束但还没到怪物位置（异常情况），恢复大小
                if (npcTransform) {
                  npcTransform.scaleX = originalScaleX;
                  npcTransform.scaleY = originalScaleY;
                }
              }
            }
          };
          checkCrush();
        } else {
          // 没有怪物，只检查移动完成恢复大小
          const checkComplete = () => {
            if (!npc.movement.isMoving) {
              if (npcTransform) {
                npcTransform.scaleX = originalScaleX;
                npcTransform.scaleY = originalScaleY;
              }
            } else {
              setTimeout(checkComplete, 50);
            }
          };
          checkComplete();
        }
        
      }, 120);
    }

    gameAudio.playPush();
    this.movePlayerTo(world, p, npcC, npcR, dc, dr);
  }

  private moveNpcTo(world: IWorld, npc: NpcState, nc: number, nr: number, dc: number, dr: number): void {
    this.grid[npc.row][npc.col] = CELL_EMPTY;
    npc.col = nc; npc.row = nr;
    this.grid[nr][nc] = CELL_PLAYER;

    const transform = world.getComponent<TransformComponent>(npc.entity, TRANSFORM_COMPONENT);
    if (transform) {
      const target = gridToWorld(nc, nr);
      startMovement(npc.movement, transform.x, transform.y, target.x, target.y, npc.col - dc, npc.row - dr, nc, nr, dc, dr, NPC_MOVE_SPEED);
      npc.moving = true;
    }
  }

  private updateWaves(world: IWorld, dt: number): void {
    if (this.currentWave >= this.totalWaves) return;
    if (this.nextWaveTimer <= 0) return;
    this.nextWaveTimer -= dt;
    if (this.nextWaveTimer <= 0) this.spawnNextWave(world);
  }

  private updateEnemies(world: IWorld, dt: number): void {
    for (const enemy of this.enemies) {
      if (enemy.dying) continue;
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
      if (enemy.stunTimer > 0) enemy.stunTimer -= dt;
      enemy.moveCooldown -= dt;
      if (enemy.moveCooldown > 0) continue;
      enemy.moveCooldown = getEnemyMoveCooldown(enemy.type);
      if (enemy.stunTimer > 0) { this.stepEnemyRandom(world, enemy); continue; }

      if (enemy.type === ENEMY_TYPE_BOW) this.stepEnemyBow(world, enemy);
      else if (enemy.type === ENEMY_TYPE_GEAR) this.stepEnemyGear(world, enemy);
      else this.stepEnemyBasic(world, enemy);
    }
  }

  // ------------------------------------------------------------------
  // 移动敌人（新的平滑移动方式）
  // ------------------------------------------------------------------
  private moveEnemyTo(world: IWorld, enemy: EnemyState, nc: number, nr: number, dc: number, dr: number): void {
    this.grid[enemy.row][enemy.col] = CELL_EMPTY;
    enemy.col = nc; enemy.row = nr;

    const transform = world.getComponent<TransformComponent>(enemy.entity, TRANSFORM_COMPONENT);
    if (transform) {
      const target = gridToWorld(nc, nr);
      startMovement(enemy.movement, transform.x, transform.y, target.x, target.y, enemy.col - dc, enemy.row - dr, nc, nr, dc, dr, ENEMY_MOVE_SPEED);
    }
  }

  private stepEnemyRandom(world: IWorld, enemy: EnemyState): void {
    const dirs = [...ALL_DIRECTIONS].sort(() => Math.random() - 0.5);
    for (const dir of dirs) {
      const nc = enemy.col + dir.dc, nr = enemy.row + dir.dr;
      if (!inBounds(nc, nr)) continue;
      if (this.grid[nr][nc] !== CELL_EMPTY) continue;
      if (this.findEnemyAt(nc, nr)) continue;
      this.moveEnemyTo(world, enemy, nc, nr, dir.dc, dir.dr);
      break;
    }
  }

  private stepEnemyBasic(world: IWorld, enemy: EnemyState): void {
    if (enemy.type === ENEMY_TYPE_BLOB && this.player) {
      const dirs = [...ALL_DIRECTIONS].sort((a, b) => {
        const da = Math.abs(this.player!.col - (enemy.col + a.dc)) + Math.abs(this.player!.row - (enemy.row + a.dr));
        const db = Math.abs(this.player!.col - (enemy.col + b.dc)) + Math.abs(this.player!.row - (enemy.row + b.dr));
        return da - db;
      });
      for (const dir of dirs) {
        const nc = enemy.col + dir.dc, nr = enemy.row + dir.dr;
        if (!inBounds(nc, nr)) continue;
        const isPlayerCell = this.player.col === nc && this.player.row === nr;
        if (this.grid[nr][nc] !== CELL_EMPTY && !isPlayerCell) continue;
        if (this.findEnemyAt(nc, nr)) continue;
        this.moveEnemyTo(world, enemy, nc, nr, dir.dc, dir.dr);
        return;
      }
    } else this.stepEnemyRandom(world, enemy);
  }

  private stepEnemyBow(world: IWorld, enemy: EnemyState): void {
    if (!this.player) { this.stepEnemyBasic(world, enemy); return; }
    const dirs = [...ALL_DIRECTIONS].sort((a, b) => {
      const da = Math.abs(this.player!.col - (enemy.col + a.dc)) + Math.abs(this.player!.row - (enemy.row + a.dr));
      const db = Math.abs(this.player!.col - (enemy.col + b.dc)) + Math.abs(this.player!.row - (enemy.row + b.dr));
      return da - db;
    });

    for (const dir of dirs) {
      const nc = enemy.col + dir.dc, nr = enemy.row + dir.dr;
      if (!inBounds(nc, nr)) continue;
      const cell = this.grid[nr][nc];
      const isPlayerCell = this.player.col === nc && this.player.row === nr;
      if ((cell === CELL_EMPTY || isPlayerCell) && !this.findEnemyAt(nc, nr)) {
        this.moveEnemyTo(world, enemy, nc, nr, dir.dc, dir.dr);
        return;
      }
      const isBlock = cell === CELL_BLOCK || cell === CELL_STAR_BLOCK || cell === CELL_HEART_BLOCK || cell === CELL_BOMB;
      if (isBlock) {
        const jc = nc + dir.dc, jr = nr + dir.dr;
        if (inBounds(jc, jr) && this.grid[jr][jc] === CELL_EMPTY && !this.findEnemyAt(jc, jr)) {
          // BOW跳跃 - 直接移动（简化版）
          this.grid[enemy.row][enemy.col] = CELL_EMPTY;
          enemy.col = jc; enemy.row = jr;
          const target = gridToWorld(jc, jr);
          const transform = world.getComponent<TransformComponent>(enemy.entity, TRANSFORM_COMPONENT);
          if (transform) {
            transform.x = target.x;
            transform.y = target.y;
          }
          return;
        }
      }
    }
  }

  private stepEnemyGear(world: IWorld, enemy: EnemyState): void {
    if (!this.player) { this.stepEnemyBasic(world, enemy); return; }
    const dc = this.player.col - enemy.col, dr = this.player.row - enemy.row;
    const primaryDirs = (Math.abs(dc) >= Math.abs(dr)
      ? [{ dc: Math.sign(dc), dr: 0 }, { dc: 0, dr: Math.sign(dr) }]
      : [{ dc: 0, dr: Math.sign(dr) }, { dc: Math.sign(dc), dr: 0 }]
    ).filter(d => d.dc !== 0 || d.dr !== 0);
    const fallbackDirs = ALL_DIRECTIONS.filter(d => !primaryDirs.some(p => p.dc === d.dc && p.dr === d.dr));
    const dirs = [...primaryDirs, ...fallbackDirs];

    for (const dir of dirs) {
      const nc = enemy.col + dir.dc, nr = enemy.row + dir.dr;
      if (!inBounds(nc, nr)) continue;
      const cell = this.grid[nr][nc];
      const isPlayerCell = this.player.col === nc && this.player.row === nr;
      if ((cell === CELL_EMPTY || isPlayerCell) && !this.findEnemyAt(nc, nr)) {
        this.moveEnemyTo(world, enemy, nc, nr, dir.dc, dir.dr);
        return;
      }
      const isGearPushable = cell === CELL_STAR_BLOCK || cell === CELL_HEART_BLOCK;
      if (isGearPushable) {
        const bc = nc + dir.dc, br = nr + dir.dr;
        if (!inBounds(bc, br) || this.grid[br][bc] !== CELL_EMPTY || this.findEnemyAt(bc, br)) continue;
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
        this.moveEnemyTo(world, enemy, nc, nr, dir.dc, dir.dr);
        return;
      }
    }
  }

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
      const fade = () => {
        sprite.alpha -= 0.05;
        if (sprite.alpha > 0) requestAnimationFrame(fade);
        else world.destroyEntity(eid);
      };
      fade();
    }
  }

  private updateHUD(world: IWorld): void {
    this.setUIText(world, this.enemyCountEntity, `敌人: ${this.enemies.length}`);

    const p = this.player;
    if (p) {
      this.setUIText(world, this.scoreEntity, `${p.score}`);
      this.setUIText(world, this.collectEntity, `★ ${p.collectibles}/10`);
      this.setUIText(world, this.scoreDisplayEntity, `得分: ${p.score}`);

      const hearts = '♥'.repeat(Math.max(0, p.hp));
      const emptyHearts = '♡'.repeat(Math.max(0, PLAYER_MAX_HP - p.hp));
      const hpColor = p.hp <= 1 ? 0xff4444 : (p.hp === 2 ? 0xffaa44 : 0x44ff44);
      this.setUIText(world, this.hpEntity, `HP: ${hearts}${emptyHearts}`);

      const uiText = world.getComponent<UITextComponent>(this.hpEntity, UI_TEXT_COMPONENT);
      if (uiText) uiText.color = hpColor;
    }

    const timeSeconds = Math.max(0, Math.floor(this.timeLeft));
    const isWarning = timeSeconds <= TIME_WARNING_THRESHOLD;
    const timeColor = isWarning ? 0xff2222 : (timeSeconds <= 30 ? 0xffaa00 : PALETTE.SCORE_CYAN);
    this.setUIText(world, this.timeDisplayEntity, `⏱ ${timeSeconds}`);

    const timeUiText = world.getComponent<UITextComponent>(this.timeDisplayEntity, UI_TEXT_COMPONENT);
    if (timeUiText) timeUiText.color = timeColor;

    const timeTransform = world.getComponent<TransformComponent>(this.timeDisplayEntity, TRANSFORM_COMPONENT);
    if (timeTransform && isWarning) {
      const pulse = 1 + 0.18 * Math.abs(Math.sin(this.timeLeft * Math.PI));
      timeTransform.scaleX = pulse;
      timeTransform.scaleY = pulse;
    } else if (timeTransform) { timeTransform.scaleX = 1; timeTransform.scaleY = 1; }

    const heartCount = this.countHearts();
    const connected = this.checkHeartsConnected();
    const statusText = connected ? '♥ 已集合!' : `♥×${heartCount} \n连成一线\n通关!`;
    this.setUIText(world, this.heartStatusEntity, statusText);

    const displayLevel = this.currentLevelIndex + 1;
    this.setUIText(world, this.levelDisplayEntity, `关卡: ${displayLevel}`);
  }

  private setUIText(world: IWorld, entity: EntityId, text: string): void {
    const uiText = world.getComponent<UITextComponent>(entity, UI_TEXT_COMPONENT);
    if (uiText) { uiText.setText(text); return; }
    const tc = world.getComponent<TextComponent>(entity, TEXT_COMPONENT);
    if (tc) tc.text = text;
  }

  private countHearts(): number {
    let count = 0;
    for (let r = 0; r < GRID_ROWS; r++)
      for (let c = 0; c < GRID_COLS; c++)
        if (this.grid[r][c] === CELL_HEART_BLOCK) count++;
    return count;
  }

  private checkHeartsConnected(): boolean {
    const hearts: Array<{ c: number; r: number }> = [];
    for (let r = 0; r < GRID_ROWS; r++)
      for (let c = 0; c < GRID_COLS; c++)
        if (this.grid[r][c] === CELL_HEART_BLOCK) hearts.push({ c, r });
    if (hearts.length < HEARTS_NEEDED_FOR_WIN) return false;

    const heartsByRow = new Map<number, Array<{ c: number; r: number }>>();
    const heartsByCol = new Map<number, Array<{ c: number; r: number }>>();

    for (const heart of hearts) {
      if (!heartsByRow.has(heart.r)) heartsByRow.set(heart.r, []);
      heartsByRow.get(heart.r)!.push(heart);
      if (!heartsByCol.has(heart.c)) heartsByCol.set(heart.c, []);
      heartsByCol.get(heart.c)!.push(heart);
    }

    for (const [, rowHearts] of heartsByRow) {
      if (rowHearts.length >= HEARTS_NEEDED_FOR_WIN) {
        rowHearts.sort((a, b) => a.c - b.c);
        let consecutiveCount = 1;
        for (let i = 1; i < rowHearts.length; i++) {
          if (rowHearts[i].c === rowHearts[i - 1].c + 1) {
            consecutiveCount++;
            if (consecutiveCount >= HEARTS_NEEDED_FOR_WIN) return true;
          } else consecutiveCount = 1;
        }
      }
    }

    for (const [, colHearts] of heartsByCol) {
      if (colHearts.length >= HEARTS_NEEDED_FOR_WIN) {
        colHearts.sort((a, b) => a.r - b.r);
        let consecutiveCount = 1;
        for (let i = 1; i < colHearts.length; i++) {
          if (colHearts[i].r === colHearts[i - 1].r + 1) {
            consecutiveCount++;
            if (consecutiveCount >= HEARTS_NEEDED_FOR_WIN) return true;
          } else consecutiveCount = 1;
        }
      }
    }
    return false;
  }

  private damagePlayer(world: IWorld): void {
    if (!this.player || this.player.isInvincible) return;

    this.player.hp -= 1;
    setRunHp(this.player.hp);
    this.player.damageCooldown = PLAYER_DAMAGE_COOLDOWN;
    this.player.isInvincible = true;
    this.player.inputLockTimer = 0.3;

    const sprite = world.getComponent<SpriteComponent>(this.player.entity, SPRITE_COMPONENT);
    if (sprite) {
      let flashes = 0;
      const flash = () => {
        if (!this.player) return;
        flashes++;
        sprite.alpha = flashes % 2 === 1 ? 0.15 : 1.0;
        if (flashes < 6) setTimeout(flash, 70);
        else {
          sprite.alpha = 0.45;
          setTimeout(() => { if (sprite) sprite.alpha = 1.0; }, (PLAYER_DAMAGE_COOLDOWN - 0.5) * 1000);
        }
      };
      flash();
    }

    if (this.player.hp <= 0) this.gameOver(world, 'hp');
  }

  private damageNpc(world: IWorld, npc: NpcState): void {
    if (npc.isInvincible) return;
    npc.hp = Math.max(0, npc.hp - 1);
    npc.damageCooldown = PLAYER_DAMAGE_COOLDOWN;
    npc.isInvincible = true;
    npc.stunTimer = NPC_STUN_DURATION;

    const sprite = world.getComponent<SpriteComponent>(npc.entity, SPRITE_COMPONENT);
    if (sprite) {
      let flashes = 0;
      const flash = () => {
        flashes++;
        sprite.alpha = flashes % 2 === 1 ? 0.2 : 1.0;
        if (flashes < 6) setTimeout(flash, 70);
        else {
          sprite.alpha = 0.5;
          setTimeout(() => { if (sprite) sprite.alpha = 1.0; }, (PLAYER_DAMAGE_COOLDOWN - 0.5) * 1000);
        }
      };
      flash();
    }
  }

  private getResolvedScore(): number { return Math.max(this.player?.score ?? 0, getRunScore()); }
  private syncRunProgress(): void {
    setRunScore(this.getResolvedScore());
    if (this.player) setRunHp(this.player.hp);
  }

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
        score, victoryType: 'defeat',
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
      ? LEVELS[this.currentLevelIndex].name : `ROUND-${this.currentLevelIndex + 1}`;
    const victoryText = `${levelName} CLEAR`;

    const textEid = UIEntityBuilder.create(world, W, H)
      .withUITransform({ anchor: 'center', y: -100, width: 600, height: 80 })
      .withText({ text: victoryText, fontSize: 52, color: PALETTE.LEVEL_COMPLETE_GOLD, align: 'center', zIndex: Z_UI_POPUP })
      .build();
    this.trackEntity(textEid);
    this.victoryUIEntities.push(textEid);

    const descEid = UIEntityBuilder.create(world, W, H)
      .withUITransform({ anchor: 'center', y: -30, width: 400, height: 40 })
      .withText({ text, fontSize: 28, color: PALETTE.HEART_RED, align: 'center', zIndex: Z_UI_POPUP })
      .build();
    this.trackEntity(descEid);
    this.victoryUIEntities.push(descEid);

    const hasNextLevel = LEVELS.length > 0 && this.currentLevelIndex < LEVELS.length - 1;
    if (hasNextLevel) {
      const nextLevelBtn = UIEntityBuilder.create(world, W, H)
        .withUITransform({ anchor: 'center', y: 60, width: 200, height: 50 })
        .withButton({ label: '下一关', onClick: 'custom:nextlevel', borderRadius: 8 })
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

  private cleanupAllEntities(world: IWorld): void {
    this.cleanupVictoryUI(world);
    this.destroyTrackedEntities(world);
    if (this.nonGridEntities) this.nonGridEntities.clear();
    this.entityMap.clear();
    this.bombs = [];
    this.enemies = [];
    this.player = null;
    this.safeZones.clear();
    this.grid = [];
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

  protected override trackEntity(eid: EntityId): void {
    super.trackEntity(eid);
    if (!this.nonGridEntities) this.nonGridEntities = new Set<EntityId>();
    this.nonGridEntities.add(eid);
  }

  private cleanupVictoryUI(world: IWorld): void {
    for (const eid of this.victoryUIEntities) world.destroyEntity(eid);
    this.victoryUIEntities = [];
  }

  onExit(world: IWorld): void {
    for (const h of this.touchHandlers) globalEventBus.off(h.evt, h.fn);
    this.touchHandlers = [];
    this.grid = [];
    this.entityMap.clear();
    this.safeZones.clear();
    this.player = null;
    this.enemies = [];
    this.bombs = [];
    this.phase = 'ready';
    this.readyTimer = READY_DURATION;
    this.completeTimer = 0;
    this.victoryType = 'none';
    this.timeLeft = TIME_LIMIT_SECONDS;
    this.completionHandled = false;
    this.touchDir = null;
    super.onExit(world);
  }

  public modifyPushDistance(distance: number): void {
    if (this.player) this.player.pushDistance = Math.max(1, Math.min(distance, PLAYER_MAX_PUSH_DISTANCE));
  }

  public resetPushDistance(): void {
    if (this.player) this.player.pushDistance = PLAYER_PUSH_DISTANCE;
  }
}
