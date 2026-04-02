// ---- Screen & Game ----
export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 720;
export const GAME_BG_COLOR = 0x1a1a2e;

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
export const PLAYER_MOVE_COOLDOWN = 0.18;
export const PLAYER_MOVE_TWEEN_DURATION = 0.1;
export const PLAYER_MAX_HP = 3;
export const PLAYER_DAMAGE_COOLDOWN = 1.0; // 受伤后无敌时间（秒）

// ---- Push mechanics ----
export const PLAYER_PUSH_DISTANCE = 1; // 默认推动距离（格数）
export const PLAYER_MAX_PUSH_DISTANCE = 10; // 最大推动距离

// ---- Enemy ----
export const ENEMY_MOVE_INTERVAL_MIN = 0.8;
export const ENEMY_MOVE_INTERVAL_MAX = 2.0;

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
export const SCORE_BLOCK_CRUSH = 1000;
export const SCORE_BOMB_KILL = 2000;
export const SCORE_YELLOW_ITEM = 500;
export const SCORE_BLUE_ITEM = 300;
export const SCORE_BLOCK_BREAK = 100;
export const SCORE_STAR_BREAK = 800;
export const SCORE_HEART_MERGE = 5000;

// ---- Heart victory ----
export const HEARTS_NEEDED_FOR_WIN = 3;
export const HEART_CONNECTION_REQUIRED = true; // 心心方块必须横竖连接才算过关

// ---- Score display ----
export const SCORE_DISPLAY_X = 20;
export const SCORE_DISPLAY_Y = 60;

// ---- Time limit ----
export const TIME_LIMIT_SECONDS = 99;
export const TIME_WARNING_THRESHOLD = 10; // 10秒时开始警告

// ---- HUD layout ----
export const HUD_TOP_Y = 16;
export const HUD_TOP_HEIGHT = 32;
export const HUD_BOTTOM_Y = 688;
export const HUD_BOTTOM_HEIGHT = 28;
export const HUD_PADDING_X = 20;

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
}

export const LEVELS: LevelData[] = [
  // This will be populated dynamically
];

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
  return import('./levels.json')
    .then((module) => {
      // Clear and populate LEVELS array
      LEVELS.length = 0;
      module.levels.forEach((level: any) => {
        LEVELS.push({
          id: level.id,
          name: level.name,
          grid: level.grid,
          enemySequence: level.enemySequence,
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
  PLAYER2: 'player2',
  WALL: 'wall',
  FLOOR: 'floor',
  GRASS: 'grass',
  BLOCK: 'block',
  STAR_BLOCK: 'star-block',
  HEART_BLOCK: 'heart-block',
  BOMB_BLOCK: 'bomb-block',
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
