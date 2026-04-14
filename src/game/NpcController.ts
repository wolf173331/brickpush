/**
 * NpcController - 松鼠 NPC AI 和推动逻辑
 */
import {
  globalTweens,
  TransformComponent, TRANSFORM_COMPONENT,
  Easing,
} from 'agent-gamedev';
import type { IWorld } from 'agent-gamedev';
import {
  GRID_ROWS, GRID_COLS,
  CELL_EMPTY, CELL_SAFE, CELL_HEART_BLOCK, CELL_BLOCK, CELL_PLAYER,
  PLAYER_MOVE_COOLDOWN, PLAYER_MAX_PUSH_DISTANCE,
  NPC_MOVE_COOLDOWN_MIN, NPC_MOVE_COOLDOWN_MAX,
  ALL_DIRECTIONS, gridToWorld, inBounds,
} from '../config';
import type { PlayerState, NpcState, EnemyState } from '../entity/types';
import { gameAudio } from '../audio';
import { damageNpc } from './CombatSystem';
import { shuffleArray } from '../network/DeterministicRandom';
import type { RandomGenerator } from '../network/DeterministicRandom';

export interface NpcContext {
  grid: number[][];
  enemies: EnemyState[];
  findEnemyAt: (c: number, r: number) => EnemyState | null;
  pushBlock: (world: IWorld, fromC: number, fromR: number, toC: number, toR: number, cellType: number) => number;
  crushEnemy: (world: IWorld, p: PlayerState, enemy: EnemyState) => void;
  movePlayerTo: (world: IWorld, p: PlayerState, tc: number, tr: number) => void;
  rng?: RandomGenerator;
}

export function updateNpc(world: IWorld, ctx: NpcContext, npc: NpcState, dt: number): void {
  const rng = ctx.rng ?? Math.random;
  if (npc.damageCooldown > 0) {
    npc.damageCooldown -= dt;
    if (npc.damageCooldown <= 0) npc.isInvincible = false;
  }
  if (npc.stunTimer > 0) { npc.stunTimer -= dt; return; }
  if (npc.moving) return;
  if (npc.cooldown > 0) { npc.cooldown -= dt; return; }

  const hearts: Array<{ c: number; r: number }> = [];
  for (let r = 0; r < GRID_ROWS; r++)
    for (let c = 0; c < GRID_COLS; c++)
      if (ctx.grid[r][c] === CELL_HEART_BLOCK) hearts.push({ c, r });
  if (hearts.length === 0) return;

  hearts.sort((a, b) =>
    (Math.abs(a.c - npc.col) + Math.abs(a.r - npc.row)) -
    (Math.abs(b.c - npc.col) + Math.abs(b.r - npc.row))
  );
  const target = hearts[0];

  let dirs = [...ALL_DIRECTIONS];
  if (rng() > 0.3) {
    dirs.sort((a, b) => {
      const da = Math.abs((npc.col + a.dc) - target.c) + Math.abs((npc.row + a.dr) - target.r);
      const db = Math.abs((npc.col + b.dc) - target.c) + Math.abs((npc.row + b.dr) - target.r);
      return da - db;
    });
    if (rng() < 0.25 && dirs.length > 1) [dirs[0], dirs[1]] = [dirs[1], dirs[0]];
  } else {
    dirs = shuffleArray(dirs, rng);
  }

  for (const dir of dirs) {
    const nc = npc.col + dir.dc, nr = npc.row + dir.dr;
    if (!inBounds(nc, nr)) continue;
    const cell = ctx.grid[nr][nc];
    if (cell === CELL_EMPTY || cell === CELL_SAFE) {
      moveNpcTo(world, ctx, npc, nc, nr, rng); break;
    }
    if (cell === CELL_HEART_BLOCK) {
      const bc = nc + dir.dc, br = nr + dir.dr;
      if (inBounds(bc, br) && ctx.grid[br][bc] === CELL_EMPTY) {
        ctx.pushBlock(world, nc, nr, bc, br, CELL_HEART_BLOCK);
        moveNpcTo(world, ctx, npc, nc, nr, rng); break;
      }
    }
    if (cell === CELL_BLOCK) {
      const bc = nc + dir.dc, br = nr + dir.dr;
      if (inBounds(bc, br) && ctx.grid[br][bc] === CELL_EMPTY) {
        ctx.pushBlock(world, nc, nr, bc, br, CELL_BLOCK);
        moveNpcTo(world, ctx, npc, nc, nr, rng); break;
      }
    }
  }
  npc.cooldown = NPC_MOVE_COOLDOWN_MIN + rng() * (NPC_MOVE_COOLDOWN_MAX - NPC_MOVE_COOLDOWN_MIN);
}

export function tryPushNpc(
  world: IWorld, ctx: NpcContext,
  p: PlayerState, npc: NpcState,
  npcC: number, npcR: number, dc: number, dr: number
): void {
  let finalC = npcC, finalR = npcR, distance = 0;
  for (let i = 1; i <= PLAYER_MAX_PUSH_DISTANCE; i++) {
    const cc = npcC + dc * i, cr = npcR + dr * i;
    if (!inBounds(cc, cr)) break;
    const cell = ctx.grid[cr][cc];
    if (cell === CELL_EMPTY || cell === CELL_SAFE) { finalC = cc; finalR = cr; distance = i; }
    else if (ctx.findEnemyAt(cc, cr)) { finalC = cc; finalR = cr; distance = i; break; }
    else break;
  }
  if (distance === 0) { p.cooldown = PLAYER_MOVE_COOLDOWN; return; }

  for (let i = 1; i <= distance; i++) {
    const cc = npcC + dc * i, cr = npcR + dr * i;
    const enemyInPath = ctx.findEnemyAt(cc, cr);
    if (enemyInPath) { ctx.crushEnemy(world, p, enemyInPath); finalC = cc; finalR = cr; break; }
  }

  ctx.grid[npc.row][npc.col] = CELL_EMPTY;
  npc.col = finalC; npc.row = finalR;
  ctx.grid[finalR][finalC] = CELL_PLAYER;

  const npcTransform = world.getComponent<TransformComponent>(npc.entity, TRANSFORM_COMPONENT);
  if (npcTransform) {
    const tgt = gridToWorld(finalC, finalR);
    const dur = 0.12 + distance * 0.04;
    globalTweens.to(npcTransform, { scaleX: 1.3, scaleY: 0.75 }, {
      duration: 0.05, easing: Easing.easeOutQuad,
      onComplete: () => globalTweens.to(npcTransform, { x: tgt.x, y: tgt.y, scaleX: 1.0, scaleY: 1.0 }, { duration: dur, easing: Easing.easeOutCubic }),
    });
  }
  gameAudio.playPush();
  ctx.movePlayerTo(world, p, npcC, npcR);
}

export function moveNpcTo(world: IWorld, ctx: NpcContext, npc: NpcState, nc: number, nr: number, rng: RandomGenerator = Math.random): void {
  ctx.grid[npc.row][npc.col] = CELL_EMPTY;
  npc.col = nc; npc.row = nr;
  ctx.grid[nr][nc] = CELL_PLAYER;
  const target = gridToWorld(nc, nr);
  const transform = world.getComponent<TransformComponent>(npc.entity, TRANSFORM_COMPONENT);
  if (transform) {
    const duration = 0.18 + rng() * 0.1;
    globalTweens.to(transform, { x: target.x, y: target.y }, {
      duration, easing: Easing.easeOutQuad,
      onComplete: () => {
        for (const enemy of ctx.enemies) {
          if (enemy.active && !enemy.dying && enemy.col === nc && enemy.row === nr) {
            damageNpc(world, npc); break;
          }
        }
      },
    });
  }
}

export { damageNpc };
