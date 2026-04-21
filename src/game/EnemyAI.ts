/**
 * EnemyAI - 四种敌人 AI 逻辑
 */
import {
  globalTweens,
  TransformComponent, TRANSFORM_COMPONENT,
  SpriteComponent, SPRITE_COMPONENT,
  Easing,
} from 'agent-gamedev';
import type { IWorld } from 'agent-gamedev';
import {
  CELL_EMPTY, CELL_BLOCK, CELL_STAR_BLOCK, CELL_HEART_BLOCK, CELL_BOMB,
  ENEMY_TYPE_BLOB, ENEMY_TYPE_BOW, ENEMY_TYPE_GEAR,
  ENEMY_TEXTURES, ASSETS,
  ALL_DIRECTIONS, gridKey, gridToWorld, inBounds,
} from '../config';
import type { EnemyState, PlayerState, NpcState } from '../entity/types';
import { gameAudio } from '../audio';
import { getEnemyMoveCooldown } from './EnemySpawner';
import { shuffleArray } from '../network/DeterministicRandom';
import type { RandomGenerator } from '../network/DeterministicRandom';

export interface EnemyAIContext {
  grid: number[][];
  entityMap: Map<string, number>;
  player: PlayerState | null;
  npc: NpcState | null;
  enemies: EnemyState[];
  findEnemyAt: (c: number, r: number) => EnemyState | null;
  damagePlayer: (world: IWorld) => void;
  damageNpc: (world: IWorld, npc: NpcState) => void;
  rng?: RandomGenerator;
}

export function updateEnemies(world: IWorld, ctx: EnemyAIContext, dt: number): void {
  const rng = ctx.rng ?? Math.random;
  for (const enemy of ctx.enemies) {
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
    enemy.moveCooldown = getEnemyMoveCooldown(enemy.type, rng);
    if (enemy.stunTimer > 0) { stepEnemyRandom(world, ctx, enemy, rng); continue; }
    if (enemy.type === ENEMY_TYPE_BOW) stepEnemyBow(world, ctx, enemy);
    else if (enemy.type === ENEMY_TYPE_GEAR) stepEnemyGear(world, ctx, enemy);
    else stepEnemyBasic(world, ctx, enemy, rng);
  }
}

export function moveEnemyTo(world: IWorld, ctx: EnemyAIContext, enemy: EnemyState, nc: number, nr: number): void {
  const dc = nc - enemy.col;
  const dr = nr - enemy.row;
  ctx.grid[enemy.row][enemy.col] = CELL_EMPTY;
  enemy.col = nc;
  enemy.row = nr;
  const target = gridToWorld(nc, nr);
  const transform = world.getComponent<TransformComponent>(enemy.entity, TRANSFORM_COMPONENT);
  const duration = enemy.moveCooldown * 0.82;
  if (transform) {
    globalTweens.to(transform, { x: target.x, y: target.y }, {
      duration, easing: Easing.easeOutQuad,
      onComplete: () => {
        if (ctx.player && ctx.player.col === nc && ctx.player.row === nr) {
          ctx.damagePlayer(world);
          enemy.stunTimer = 1.2;
          globalTweens.to(transform, { scaleX: 1.3, scaleY: 1.3 }, {
            duration: 0.06, easing: Easing.easeOutQuad,
            onComplete: () => globalTweens.to(transform, { scaleX: 1.0, scaleY: 1.0 }, { duration: 0.1, easing: Easing.easeInQuad }),
          });
        }
        if (ctx.npc && !ctx.npc.isInvincible && ctx.npc.col === nc && ctx.npc.row === nr) {
          ctx.damageNpc(world, ctx.npc);
          enemy.stunTimer = 1.2;
        }
      },
    });

    // 移动挤压拉伸动画
    globalTweens.to(transform, { scaleX: 0.88, scaleY: 1.12 }, { duration: duration * 0.3, easing: Easing.easeOutQuad });
    globalTweens.to(transform, { scaleX: 1.0, scaleY: 1.0 }, { duration: duration * 0.7, easing: Easing.easeOutSine, delay: duration * 0.3 });

    if (dc !== 0 && dr === 0) {
      const rotDir = dc < 0 ? -0.12 : 0.12;
      globalTweens.to(transform, { rotation: rotDir }, { duration: duration * 0.3, easing: Easing.easeOutQuad });
      globalTweens.to(transform, { rotation: 0 }, { duration: duration * 0.7, easing: Easing.easeOutSine, delay: duration * 0.3 });
    } else if (dr !== 0 && dc === 0) {
      const wiggle = dr < 0 ? 0.08 : -0.08;
      globalTweens.to(transform, { rotation: wiggle }, { duration: duration * 0.2, easing: Easing.easeOutQuad, yoyo: true, repeat: 1 });
      globalTweens.to(transform, { rotation: 0 }, { duration: duration * 0.4, easing: Easing.easeOutQuad, delay: duration * 0.4 });
    }
  }
}

function moveEnemyBowJump(world: IWorld, ctx: EnemyAIContext, enemy: EnemyState, nc: number, nr: number): void {
  ctx.grid[enemy.row][enemy.col] = CELL_EMPTY;
  enemy.col = nc; enemy.row = nr;
  const target = gridToWorld(nc, nr);
  const transform = world.getComponent<TransformComponent>(enemy.entity, TRANSFORM_COMPONENT);
  const totalDuration = enemy.moveCooldown * 0.82;
  const ph = totalDuration / 3;
  if (!transform) return;
  globalTweens.to(transform, { scaleX: 0.7, scaleY: 0.7 }, {
    duration: ph * 0.4, easing: Easing.easeInQuad,
    onComplete: () => {
      globalTweens.to(transform, { x: target.x, y: target.y, scaleX: 1.4, scaleY: 1.4 }, {
        duration: ph * 1.2, easing: Easing.easeOutQuad,
        onComplete: () => {
          globalTweens.to(transform, { scaleX: 1.1, scaleY: 0.8 }, {
            duration: ph * 0.2, easing: Easing.easeOutQuad,
            onComplete: () => {
              globalTweens.to(transform, { scaleX: 1.0, scaleY: 1.0 }, {
                duration: ph * 0.2, easing: Easing.easeInQuad,
                onComplete: () => {
                  if (ctx.player && ctx.player.col === nc && ctx.player.row === nr) {
                    ctx.damagePlayer(world); enemy.stunTimer = 1.2;
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

function stepEnemyRandom(world: IWorld, ctx: EnemyAIContext, enemy: EnemyState, rng: RandomGenerator): void {
  const dirs = shuffleArray([...ALL_DIRECTIONS], rng);
  for (const dir of dirs) {
    const nc = enemy.col + dir.dc, nr = enemy.row + dir.dr;
    if (!inBounds(nc, nr)) continue;
    if (ctx.grid[nr][nc] !== CELL_EMPTY) continue;
    if (ctx.findEnemyAt(nc, nr)) continue;
    moveEnemyTo(world, ctx, enemy, nc, nr); break;
  }
}

function stepEnemyBasic(world: IWorld, ctx: EnemyAIContext, enemy: EnemyState, rng: RandomGenerator): void {
  if (enemy.type === ENEMY_TYPE_BLOB && ctx.player) {
    const dirs = [...ALL_DIRECTIONS].sort((a, b) => {
      const da = Math.abs(ctx.player!.col - (enemy.col + a.dc)) + Math.abs(ctx.player!.row - (enemy.row + a.dr));
      const db = Math.abs(ctx.player!.col - (enemy.col + b.dc)) + Math.abs(ctx.player!.row - (enemy.row + b.dr));
      return da - db;
    });
    for (const dir of dirs) {
      const nc = enemy.col + dir.dc, nr = enemy.row + dir.dr;
      if (!inBounds(nc, nr)) continue;
      const isPlayerCell = ctx.player.col === nc && ctx.player.row === nr;
      if (ctx.grid[nr][nc] !== CELL_EMPTY && !isPlayerCell) continue;
      if (ctx.findEnemyAt(nc, nr)) continue;
      moveEnemyTo(world, ctx, enemy, nc, nr); return;
    }
  } else {
    stepEnemyRandom(world, ctx, enemy, rng);
  }
}

function stepEnemyBow(world: IWorld, ctx: EnemyAIContext, enemy: EnemyState): void {
  if (!ctx.player) { stepEnemyBasic(world, ctx, enemy, ctx.rng ?? Math.random); return; }
  const dirs = [...ALL_DIRECTIONS].sort((a, b) => {
    const da = Math.abs(ctx.player!.col - (enemy.col + a.dc)) + Math.abs(ctx.player!.row - (enemy.row + a.dr));
    const db = Math.abs(ctx.player!.col - (enemy.col + b.dc)) + Math.abs(ctx.player!.row - (enemy.row + b.dr));
    return da - db;
  });
  for (const dir of dirs) {
    const nc = enemy.col + dir.dc, nr = enemy.row + dir.dr;
    if (!inBounds(nc, nr)) continue;
    const cell = ctx.grid[nr][nc];
    const isPlayerCell = ctx.player.col === nc && ctx.player.row === nr;
    if ((cell === CELL_EMPTY || isPlayerCell) && !ctx.findEnemyAt(nc, nr)) {
      moveEnemyTo(world, ctx, enemy, nc, nr); return;
    }
    const isBlock = cell === CELL_BLOCK || cell === CELL_STAR_BLOCK || cell === CELL_HEART_BLOCK || cell === CELL_BOMB;
    if (isBlock) {
      const jc = nc + dir.dc, jr = nr + dir.dr;
      if (inBounds(jc, jr) && ctx.grid[jr][jc] === CELL_EMPTY && !ctx.findEnemyAt(jc, jr)) {
        moveEnemyBowJump(world, ctx, enemy, jc, jr); return;
      }
    }
  }
}

function stepEnemyGear(world: IWorld, ctx: EnemyAIContext, enemy: EnemyState): void {
  if (!ctx.player) { stepEnemyBasic(world, ctx, enemy, ctx.rng ?? Math.random); return; }
  const dc = ctx.player.col - enemy.col, dr = ctx.player.row - enemy.row;
  const primaryDirs = (Math.abs(dc) >= Math.abs(dr)
    ? [{ dc: Math.sign(dc), dr: 0 }, { dc: 0, dr: Math.sign(dr) }]
    : [{ dc: 0, dr: Math.sign(dr) }, { dc: Math.sign(dc), dr: 0 }]
  ).filter(d => d.dc !== 0 || d.dr !== 0);
  const fallbackDirs = ALL_DIRECTIONS.filter(d => !primaryDirs.some(p => p.dc === d.dc && p.dr === d.dr));
  for (const dir of [...primaryDirs, ...fallbackDirs]) {
    const nc = enemy.col + dir.dc, nr = enemy.row + dir.dr;
    if (!inBounds(nc, nr)) continue;
    const cell = ctx.grid[nr][nc];
    const isPlayerCell = ctx.player.col === nc && ctx.player.row === nr;
    if ((cell === CELL_EMPTY || isPlayerCell) && !ctx.findEnemyAt(nc, nr)) {
      moveEnemyTo(world, ctx, enemy, nc, nr); return;
    }
    const isGearPushable = cell === CELL_STAR_BLOCK || cell === CELL_HEART_BLOCK;
    if (isGearPushable) {
      const bc = nc + dir.dc, br = nr + dir.dr;
      if (!inBounds(bc, br) || ctx.grid[br][bc] !== CELL_EMPTY || ctx.findEnemyAt(bc, br)) continue;
      const blockKey = gridKey(nc, nr);
      const blockEid = ctx.entityMap.get(blockKey);
      if (blockEid !== undefined) {
        ctx.entityMap.delete(blockKey);
        ctx.entityMap.set(gridKey(bc, br), blockEid);
        const bt = world.getComponent<TransformComponent>(blockEid, TRANSFORM_COMPONENT);
        if (bt) { const bp = gridToWorld(bc, br); bt.x = bp.x; bt.y = bp.y; }
      }
      ctx.grid[br][bc] = cell; ctx.grid[nr][nc] = CELL_EMPTY;
      gameAudio.playPush();
      moveEnemyTo(world, ctx, enemy, nc, nr); return;
    }
  }
}
