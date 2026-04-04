/**
 * GridSystem - gestisce il parsing del livello e la creazione del floor
 */
import { EntityBuilder } from 'agent-gamedev';
import type { IWorld } from 'agent-gamedev';
import {
  GRID_ROWS, GRID_COLS, TILE_SIZE,
  CELL_EMPTY, CELL_WALL, CELL_BLOCK, CELL_STAR_BLOCK, CELL_HEART_BLOCK,
  CELL_BOMB, CELL_P1_SPAWN, CELL_ENEMY_SPAWN, CELL_ITEM, CELL_SAFE,
  GAME_WIDTH, GAME_HEIGHT,
  PALETTE, ASSETS, Z_FLOOR,
  LEVELS,
  gridKey, gridToWorld,
} from '../config';

export interface GridContext {
  grid: number[][];
  safeZones: Set<string>;
  outerGrassZones: Set<string>;
  trackEntity: (eid: number) => void;
}

const W = GAME_WIDTH;
const H = GAME_HEIGHT;

export function parseLevel(ctx: GridContext, levelIndex: number): void {
  if (LEVELS.length === 0) {
    console.warn('No levels loaded, using fallback');
    parseLevelFromGrid(ctx, [
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
      [1,11,11,11,11,11,11,11,11,11,11,11,11,11,1],
      [1,11,0,2,4,2,0,0,0,2,0,2,0,11,1],
      [1,11,2,0,2,0,5,0,2,0,2,0,2,11,1],
      [1,11,2,0,0,2,0,0,0,2,4,0,2,11,1],
      [1,11,0,0,0,0,0,0,0,0,0,0,0,11,1],
      [1,11,0,0,0,0,0,7,0,0,0,0,0,11,1],
      [1,11,0,0,0,0,0,0,4,0,0,0,0,11,1],
      [1,11,0,0,0,0,0,0,0,0,0,0,0,11,1],
      [1,11,0,0,0,0,0,3,0,0,0,0,0,11,1],
      [1,11,0,0,0,0,0,0,0,0,0,0,0,11,1],
      [1,11,11,11,11,11,11,11,11,11,11,11,11,11,1],
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    ]);
    return;
  }
  const idx = Math.max(0, Math.min(levelIndex, LEVELS.length - 1));
  parseLevelFromGrid(ctx, LEVELS[idx].grid);
}

export function parseLevelFromGrid(ctx: GridContext, levelGrid: number[][]): void {
  for (let r = 0; r < GRID_ROWS; r++) {
    ctx.grid[r] = [];
    for (let c = 0; c < GRID_COLS; c++) {
      const cell = levelGrid[r][c];
      const isOuterRing = r === 0 || r === GRID_ROWS - 1 || c === 0 || c === GRID_COLS - 1;

      if (isOuterRing) {
        ctx.grid[r][c] = CELL_SAFE;
        const key = gridKey(c, r);
        ctx.safeZones.add(key);
        ctx.outerGrassZones.add(key);
        continue;
      }

      switch (cell) {
        case CELL_WALL:       ctx.grid[r][c] = CELL_WALL; break;
        case CELL_ITEM:       ctx.grid[r][c] = CELL_ITEM; break;
        case CELL_BLOCK:
        case CELL_STAR_BLOCK:
        case CELL_HEART_BLOCK:
        case CELL_BOMB:
        case CELL_P1_SPAWN:
        case CELL_ENEMY_SPAWN:
          ctx.grid[r][c] = cell; break;
        case CELL_SAFE:
          ctx.grid[r][c] = CELL_SAFE;
          ctx.safeZones.add(gridKey(c, r));
          break;
        default:
          ctx.grid[r][c] = CELL_EMPTY; break;
      }
    }
  }
}

export function createFloor(world: IWorld, ctx: GridContext): void {
  ctx.trackEntity(
    EntityBuilder.create(world, W, H).withBackground({ color: PALETTE.BACKGROUND }).build()
  );
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const pos = gridToWorld(c, r);
      ctx.trackEntity(
        EntityBuilder.create(world, W, H)
          .withTransform({ x: pos.x, y: pos.y })
          .withSprite({
            textureId: ctx.outerGrassZones.has(gridKey(c, r)) ? ASSETS.GRASS : ASSETS.FLOOR,
            width: TILE_SIZE, height: TILE_SIZE, zIndex: Z_FLOOR,
          })
          .build()
      );
    }
  }
}
