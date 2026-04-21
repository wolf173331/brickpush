// ---- Screen & Game ----
export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 720;
export const GAME_BG_COLOR = 0x1a1a2e;
declare const __APP_VERSION__: string;
export const APP_VERSION: string = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.8.0';

// ---- Grid ----
export const GRID_COLS = 15;
export const GRID_ROWS = 13;
export const TILE_SIZE = 48;
export const GRID_OFFSET_X = 120;
export const GRID_OFFSET_Y = 48;

// ---- Cell types ----
export const CELL_EMPTY = 0;
export const CELL_WALL = 1;
export const CELL_BLOCK = 2;
export const CELL_STAR_BLOCK = 3;
export const CELL_HEART_BLOCK = 4;
export const CELL_BOMB = 5;
export const CELL_ENEMY_SPAWN = 6;
export const CELL_P1_SPAWN = 7;
export const CELL_P2_SPAWN = 8;
export const CELL_PLAYER = 9;
export const CELL_ITEM = 10;
export const CELL_SAFE = 11;

// ---- Player ----
export const PLAYER_MOVE_COOLDOWN = 0.13;
export const PLAYER_MOVE_TWEEN_DURATION = 0.1;
export const PLAYER_MAX_HP = 3;
export const PLAYER_DAMAGE_COOLDOWN = 1.0; // 受伤后无敌时间（秒）

// ---- Push mechanics ----
export const PLAYER_PUSH_DISTANCE = 1; // 默认推动距离（格数）
export const PLAYER_MAX_PUSH_DISTANCE = 10; // 最大推动距离

// ---- Enemy ----
export const ENEMY_MOVE_INTERVAL_MIN = 0.5;
export const ENEMY_MOVE_INTERVAL_MAX = 0.9;

export const ENEMY_TYPE_FROG = 0;
export const ENEMY_TYPE_BLOB = 1;
export const ENEMY_TYPE_BOW = 2;
export const ENEMY_TYPE_GEAR = 3;

export const ENEMY_TEXTURES: readonly string[] = [
  'enemy-frog',
  'enemy-blue',
  'enemy-pink',
  'enemy-silver',
];

// ---- Bomb ----
export const BOMB_EXPLOSION_DELAY = 4.5;
export const BOMB_EXPLOSION_RANGE = 1;

// ---- Score ----
export const SCORE_BLOCK_CRUSH = 500;    // 方块压死怪物（基础，combo会翻倍）
export const SCORE_BOMB_KILL   = 500;    // 炸弹杀怪（基础，combo会翻倍）
export const SCORE_YELLOW_ITEM = 200;
export const SCORE_BLUE_ITEM   = 300;
export const SCORE_BLOCK_BREAK = 100;    // 推坏普通方块
export const SCORE_WALL_BREAK  = 200;    // 推坏墙
export const SCORE_STAR_BREAK  = 300;    // 推坏星块
export const SCORE_HEART_MERGE = 5000;
export const SCORE_TIME_BONUS_MAX = 10000; // 时间奖励最大值（开始就过关）

/** 根据剩余时间计算通关时间奖励，抛物线过渡
 *  timeLeft: 当前剩余秒数
 *  totalTime: 该关总时间
 *  警告阈值以下得0分，满时间得 SCORE_TIME_BONUS_MAX
 */
export function calcTimeBonusScore(timeLeft: number, totalTime: number): number {
  const threshold = TIME_WARNING_THRESHOLD;
  if (timeLeft <= threshold) return 0;
  const t = (timeLeft - threshold) / (totalTime - threshold); // 0~1
  return Math.round(SCORE_TIME_BONUS_MAX * t * t); // 抛物线
}

// ---- Combo ----
export const COMBO_WINDOW = 5.0;         // combo 窗口（秒）
export const COMBO_BASE_KILL = 500;      // 第1杀
export const COMBO_INCREMENT = 500;      // 每次 combo 递增
export const COMBO_MAX = 10000;          // combo 上限

// ---- Heart victory ----
export const HEARTS_NEEDED_FOR_WIN = 3;
export const HEART_CONNECTION_REQUIRED = true; // 心心方块必须横竖连接才算过关

// ---- Score display ----
export const SCORE_DISPLAY_X = 20;
export const SCORE_DISPLAY_Y = 0;

// ---- Time limit ----
export const TIME_LIMIT_SECONDS = 99;
export const TIME_LIMIT_MIN = 60;   // 最后一关的时间上限
export const TIME_WARNING_THRESHOLD = 15; // 15秒时开始警告

/** 根据关卡索引（0-based）计算该关的时间上限，从99秒线性递减到60秒 */
export function getLevelTimeLimit(levelIndex: number, totalLevels: number): number {
  if (totalLevels <= 1) return TIME_LIMIT_SECONDS;
  const t = Math.min(1, levelIndex / (totalLevels - 1));
  return Math.round(TIME_LIMIT_SECONDS - t * (TIME_LIMIT_SECONDS - TIME_LIMIT_MIN));
}

// ---- HUD layout ----
export const HUD_TOP_Y = 16;
export const HUD_TOP_HEIGHT = 32;
export const HUD_BOTTOM_Y = 688;
export const HUD_BOTTOM_HEIGHT = 28;
export const HUD_PADDING_X = 20;

// ---- NPC Squirrel ----
export const NPC_HP = 255;
export const NPC_MOVE_COOLDOWN_MIN = 0.6;
export const NPC_MOVE_COOLDOWN_MAX = 1.4;
export const NPC_STUN_DURATION = 1.0;

let npcSquirrelEnabled = false;
export function isNpcSquirrelEnabled(): boolean { return npcSquirrelEnabled; }
export function setNpcSquirrelEnabled(v: boolean): void { npcSquirrelEnabled = v; }
export const ENEMY_SPAWN_ACTIVATE_DELAY = 1.0;

// ---- Phase ----
export const READY_DURATION = 2.0;

// ---- Z-index layers ----
export const Z_FLOOR = -10;
export const Z_WALL = 0;
export const Z_BLOCK = 5;
export const Z_ITEM = 8;
export const Z_ENEMY = 10;
export const Z_PLAYER = 15;
export const Z_UI = 20;
export const Z_UI_POPUP = 30;
export const Z_SCORE_POPUP = 25;

// ---- Palette ----
export const PALETTE = {
  BACKGROUND: 0x1a1a2e,
  HUD_BG: 0x16213e,
  HUD_TEXT: 0xeeeeff,
  SCORE_GOLD: 0xffd700,
  READY_TEXT: 0xff4444,
  TITLE_YELLOW: 0xffe066,
  SUBTITLE_WHITE: 0xcccccc,
  SCORE_CYAN: 0x00ffff,
  LEVEL_COMPLETE_GOLD: 0xffd700,
  MENU_BG: 0x0a0a1a,
  HEART_RED: 0xff4444,
  BREAK_WHITE: 0xffffff,
} as const;

// ---- Level system ----
export interface LevelData {
  id: string;
  name: string;
  grid: number[][];
  enemySequence: number[];
  enemyWaves: number;      // 总波数（1-5）
  enemiesPerWave: number;  // 每波敌人数量
}

export const LEVELS: LevelData[] = [
  // This will be populated dynamically
];

/** 当前开放的最大关卡数，调整此值控制玩家可游玩的关卡范围 */
export const MAX_UNLOCKED_LEVELS = 15;

let currentLevelIndexState = 0;

export function getCurrentLevelIndex(): number {
  const maxIndex = Math.max(LEVELS.length - 1, 0);
  return Math.max(0, Math.min(currentLevelIndexState, maxIndex));
}

export function setCurrentLevelIndex(index: number): void {
  const maxIndex = Math.max(LEVELS.length - 1, 0);
  currentLevelIndexState = Math.max(0, Math.min(index, maxIndex));
}

export function getCurrentLevelName(): string {
  const levelIndex = getCurrentLevelIndex();
  return LEVELS[levelIndex]?.name ?? `ROUND-${levelIndex + 1}`;
}

export function loadLevels(): Promise<void> {
  // 用 fetch 而不是 import()，确保每次都读取最新文件，不受模块缓存影响
  return fetch(import.meta.env.BASE_URL + 'assets/levels.json?t=' + Date.now())
    .then(r => {
      if (!r.ok) throw new Error('fetch failed: ' + r.status);
      return r.json();
    })
    .then((module) => {
      LEVELS.length = 0;
      module.levels.slice(0, MAX_UNLOCKED_LEVELS).forEach((level: any) => {
        LEVELS.push({
          id: level.id,
          name: level.name,
          grid: level.grid,
          enemySequence: level.enemySequence,
          enemyWaves: level.enemyWaves ?? 1,
          enemiesPerWave: level.enemiesPerWave ?? 3,
        });
      });
      setCurrentLevelIndex(currentLevelIndexState);
    })
    .catch((error) => {
      console.error('Failed to load levels:', error);
      // Fallback to default level (第一关)
      const defaultLevel: LevelData = {
        id: 'default',
        name: 'ROUND-01',
        grid: [
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
          [1, 11, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 11, 1],
          [1, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 1],
          [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
        ],
        enemySequence: [ENEMY_TYPE_FROG, ENEMY_TYPE_BLOB, ENEMY_TYPE_BOW, ENEMY_TYPE_GEAR],
        enemyWaves: 1,
        enemiesPerWave: 3,
      };
      LEVELS.push(defaultLevel);
      setCurrentLevelIndex(0);
    });
}

// For backward compatibility
export const LEVEL_BOUND_02: readonly (readonly number[])[] = []; // Will be populated dynamically

// ---- Asset IDs ----
export const ASSETS = {
  PLAYER1: 'player1',
  PLAYER1_IDLE_L: 'player1-idle-l',
  PLAYER1_IDLE_R: 'player1-idle-r',
  PLAYER2: 'player2',
  PLAYER2_IDLE_L: 'player2-idle-l',
  PLAYER2_IDLE_R: 'player2-idle-r',
  WALL: 'wall',
  FLOOR: 'floor',
  GRASS: 'grass',
  BLOCK: 'block',
  STAR_BLOCK: 'star-block',
  HEART_BLOCK: 'heart-block',
  BOMB_BLOCK: 'bomb',
  ENEMY_FROG: 'enemy-frog',
  ENEMY_BLUE: 'enemy-blue',
  ENEMY_PINK: 'enemy-pink',
  ENEMY_SILVER: 'enemy-silver',
  ENEMY_INACTIVE: 'enemy-inactive',
  ITEM_YELLOW: 'item-yellow',
  ITEM_BLUE: 'item-blue',
  ITEM_WATERMELON: 'item-watermelon',
  SCORE_POPUP: 'score-popup',
  PUSH_POWERUP: 'push-powerup', // 推动距离道具
} as const;

// ---- Helper functions ----

/** Convert grid col/row to world pixel coordinates (center of tile). */
export function gridToWorld(col: number, row: number): { x: number; y: number } {
  return {
    x: GRID_OFFSET_X + col * TILE_SIZE + TILE_SIZE / 2,
    y: GRID_OFFSET_Y + row * TILE_SIZE + TILE_SIZE / 2,
  };
}

/** Create a unique string key from grid coordinates. */
export function gridKey(col: number, row: number): string {
  return `${col},${row}`;
}

/** Check whether a col/row is within the grid bounds. */
export function inBounds(col: number, row: number): boolean {
  return col >= 0 && col < GRID_COLS && row >= 0 && row < GRID_ROWS;
}

// ---- Directions ----
export const DIR_UP = { dc: 0, dr: -1 };
export const DIR_DOWN = { dc: 0, dr: 1 };
export const DIR_LEFT = { dc: -1, dr: 0 };
export const DIR_RIGHT = { dc: 1, dr: 0 };
export const ALL_DIRECTIONS = [DIR_UP, DIR_DOWN, DIR_LEFT, DIR_RIGHT];

// ---- Touch ----
export const TOUCH_ZONE_HEIGHT = 120;

// ---- Multiplayer ----
export const MULTIPLAYER_FRAME_RATE = 20; // 20 FPS lockstep
export const MULTIPLAYER_FRAME_INTERVAL = 1 / MULTIPLAYER_FRAME_RATE; // 50ms
export const MULTIPLAYER_INPUT_DELAY = 2; // 2 frames buffer
export const MULTIPLAYER_TIMEOUT_MS = 3000; // 连接超时
