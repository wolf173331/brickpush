/**
 * BlockSystem - 方块推动、破坏、道具、炸弹逻辑
 */
import {
  EntityBuilder, globalTweens,
  TransformComponent, TRANSFORM_COMPONENT,
  SpriteComponent, SPRITE_COMPONENT,
  Easing,
} from 'agent-gamedev';
import type { IWorld } from 'agent-gamedev';
import {
  GAME_WIDTH, GAME_HEIGHT, TILE_SIZE,
  CELL_EMPTY, CELL_WALL, CELL_BLOCK, CELL_STAR_BLOCK, CELL_HEART_BLOCK,
  CELL_BOMB, CELL_ITEM, CELL_SAFE,
  PLAYER_MOVE_COOLDOWN, PLAYER_MOVE_TWEEN_DURATION,
  BOMB_EXPLOSION_RANGE,
  SCORE_BLOCK_BREAK, SCORE_STAR_BREAK, SCORE_YELLOW_ITEM, SCORE_BLUE_ITEM,
  PLAYER_MAX_PUSH_DISTANCE,
  PALETTE, ASSETS,
  Z_ITEM, Z_SCORE_POPUP,
  gridKey, gridToWorld, inBounds,
} from '../config';
import type { PlayerState, EnemyState, BombState } from '../entity/types';
import { gameAudio } from '../audio';
import { spawnScorePopup as _spawnScorePopup } from './CombatSystem';
import type { ComboState } from './CombatSystem';
import { killEnemyScore as _killEnemyScore } from './CombatSystem';

const W = GAME_WIDTH;
const H = GAME_HEIGHT;

export interface BlockContext {
  grid: number[][];
  entityMap: Map<string, number>;
  itemDecorationMap: Map<string, number[]>;
  safeZones: Set<string>;
  outerGrassZones: Set<string>;
  bombs: BombState[];
  enemies: EnemyState[];
  player: PlayerState | null;
  isActive: boolean;
  phase: string;
  trackEntity: (eid: number) => void;
  findEnemyAt: (c: number, r: number) => EnemyState | null;
  destroyEnemy: (world: IWorld, enemy: EnemyState) => void;
  damagePlayer: (world: IWorld) => void;
  combo: ComboState;
}

export function isPushable(cell: number): boolean {
  return cell === CELL_BLOCK || cell === CELL_STAR_BLOCK
    || cell === CELL_HEART_BLOCK || cell === CELL_BOMB;
}

export function calculatePushPath(
  ctx: BlockContext,
  startC: number, startR: number,
  dc: number, dr: number,
  maxDistance: number
): { finalC: number; finalR: number; distance: number } {
  let finalC = startC, finalR = startR, distance = 0;
  for (let i = 1; i <= maxDistance; i++) {
    const testC = startC + dc * i, testR = startR + dr * i;
    if (!inBounds(testC, testR)) break;
    const cell = ctx.grid[testR][testC];
    const canOccupySafe = cell === CELL_SAFE && !ctx.outerGrassZones.has(gridKey(testC, testR));
    if (cell === CELL_EMPTY || cell === CELL_ITEM || canOccupySafe) {
      finalC = testC; finalR = testR; distance = i;
    } else if (cell === CELL_WALL || isPushable(cell)) {
      break;
    } else if (ctx.findEnemyAt(testC, testR)) {
      finalC = testC; finalR = testR; distance = i; continue;
    } else { break; }
  }
  return { finalC, finalR, distance };
}

export function calculateBombSlidePath(
  ctx: BlockContext,
  startC: number, startR: number,
  dc: number, dr: number,
): { finalC: number; finalR: number; distance: number; hitEnemy: boolean } {
  let finalC = startC, finalR = startR, distance = 0;
  for (let i = 1; ; i++) {
    const testC = startC + dc * i, testR = startR + dr * i;
    if (!inBounds(testC, testR)) break;
    if (ctx.findEnemyAt(testC, testR)) {
      return { finalC: testC, finalR: testR, distance: i, hitEnemy: true };
    }
    const cell = ctx.grid[testR][testC];
    const canOccupySafe = cell === CELL_SAFE && !ctx.outerGrassZones.has(gridKey(testC, testR));
    if (cell === CELL_EMPTY || cell === CELL_ITEM || canOccupySafe) {
      finalC = testC; finalR = testR; distance = i; continue;
    }
    break;
  }
  return { finalC, finalR, distance, hitEnemy: false };
}

export function destroyBlockAt(world: IWorld, ctx: BlockContext, c: number, r: number): void {
  if (ctx.grid[r][c] === CELL_HEART_BLOCK) return;
  const key = gridKey(c, r);
  const ent = ctx.entityMap.get(key);
  if (ent !== undefined) { world.destroyEntity(ent); ctx.entityMap.delete(key); }
  ctx.grid[r][c] = ctx.safeZones.has(key) ? CELL_SAFE : CELL_EMPTY;
  const bIdx = ctx.bombs.findIndex(b => b.col === c && b.row === r);
  if (bIdx >= 0) ctx.bombs.splice(bIdx, 1);
}

export function destroyWallAt(world: IWorld, ctx: BlockContext, c: number, r: number): void {
  const key = gridKey(c, r);
  const ent = ctx.entityMap.get(key);
  if (ent !== undefined) { world.destroyEntity(ent); ctx.entityMap.delete(key); }
  ctx.grid[r][c] = CELL_EMPTY;
}

export function spawnBreakEffect(world: IWorld, ctx: BlockContext, c: number, r: number, color: number): void {
  const pos = gridToWorld(c, r);
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI * 2 * i) / 6;
    const dist = TILE_SIZE * 0.8;
    const tx = pos.x + Math.cos(angle) * dist;
    const ty = pos.y + Math.sin(angle) * dist;
    const fragSize = 8 + Math.random() * 6;
    const eid = EntityBuilder.create(world, W, H)
      .withTransform({ x: pos.x, y: pos.y })
      .withSprite({ color, width: fragSize, height: fragSize, zIndex: Z_SCORE_POPUP })
      .build();
    ctx.trackEntity(eid);
    const transform = world.getComponent<TransformComponent>(eid, TRANSFORM_COMPONENT);
    const sprite = world.getComponent<SpriteComponent>(eid, SPRITE_COMPONENT);
    if (transform) globalTweens.to(transform, { x: tx, y: ty }, { duration: 0.4, easing: Easing.easeOutQuad, onComplete: () => world.destroyEntity(eid) });
    if (sprite) globalTweens.to(sprite, { alpha: 0 }, { duration: 0.4, easing: Easing.easeOutQuad });
  }
}

export function spawnItemAt(world: IWorld, ctx: BlockContext, c: number, r: number, tex: string): void {
  const key = gridKey(c, r);
  if (ctx.grid[r][c] !== CELL_EMPTY && !ctx.safeZones.has(key)) return;
  const pos = gridToWorld(c, r);
  const eid = EntityBuilder.create(world, W, H)
    .withTransform({ x: pos.x, y: pos.y })
    .withSprite({ textureId: tex, width: TILE_SIZE, height: TILE_SIZE, zIndex: Z_ITEM })
    .build();
  ctx.trackEntity(eid);
  ctx.entityMap.set(key, eid);
  ctx.grid[r][c] = CELL_ITEM;
  if (tex === ASSETS.PUSH_POWERUP) {
    const textEid = EntityBuilder.create(world, W, H)
      .withTransform({ x: pos.x, y: pos.y })
      .withText({ text: 'P', fontSize: 24, color: 0xffffff, align: 'center', zIndex: Z_ITEM + 1 })
      .build();
    ctx.trackEntity(textEid);
    ctx.itemDecorationMap.set(key, [textEid]);
  }
}

export function clearItemAt(world: IWorld, ctx: BlockContext, c: number, r: number): void {
  const key = gridKey(c, r);
  const ent = ctx.entityMap.get(key);
  if (ent !== undefined) { world.destroyEntity(ent); ctx.entityMap.delete(key); }
  const decs = ctx.itemDecorationMap.get(key);
  if (decs) { decs.forEach(e => world.destroyEntity(e)); ctx.itemDecorationMap.delete(key); }
  if (ctx.grid[r][c] === CELL_ITEM) ctx.grid[r][c] = ctx.safeZones.has(key) ? CELL_SAFE : CELL_EMPTY;
}

export function pushBlock(
  world: IWorld, ctx: BlockContext,
  fromC: number, fromR: number, toC: number, toR: number, cellType: number
): number {
  gameAudio.playPush();
  const key = gridKey(fromC, fromR);
  const blockEntity = ctx.entityMap.get(key);
  if (ctx.grid[toR][toC] === CELL_ITEM) clearItemAt(world, ctx, toC, toR);
  ctx.grid[fromR][fromC] = ctx.safeZones.has(key) ? CELL_SAFE : CELL_EMPTY;
  ctx.grid[toR][toC] = cellType;
  ctx.entityMap.delete(key);
  if (blockEntity !== undefined) ctx.entityMap.set(gridKey(toC, toR), blockEntity);
  for (const b of ctx.bombs) {
    if (b.col === fromC && b.row === fromR) { b.col = toC; b.row = toR; break; }
  }
  if (blockEntity !== undefined) {
    const target = gridToWorld(toC, toR);
    const transform = world.getComponent<TransformComponent>(blockEntity, TRANSFORM_COMPONENT);
    if (transform) {
      const distance = Math.max(Math.abs(toC - fromC), Math.abs(toR - fromR));
      const duration = PLAYER_MOVE_TWEEN_DURATION * (0.5 + distance * 0.3);
      const sprite = world.getComponent<SpriteComponent>(blockEntity, SPRITE_COMPONENT);
      if (sprite) {
        const ox = target.x + (fromC - toC) * TILE_SIZE * 0.3;
        const oy = target.y + (fromR - toR) * TILE_SIZE * 0.3;
        transform.x = ox; transform.y = oy;
        globalTweens.to(transform, { x: target.x, y: target.y }, { duration, easing: Easing.easeOutCubic });
      }
      return duration;
    }
  }
  return PLAYER_MOVE_TWEEN_DURATION;
}

export function explodeSingleBomb(world: IWorld, ctx: BlockContext, p: PlayerState, bc: number, br: number): void {
  const bIdx = ctx.bombs.findIndex(b => b.col === bc && b.row === br && !b.exploded);
  if (bIdx < 0) return;
  ctx.bombs[bIdx].exploded = true;
  gameAudio.playExplosion();
  destroyBlockAt(world, ctx, bc, br);
  if (ctx.player && Math.abs(ctx.player.col - bc) <= BOMB_EXPLOSION_RANGE && Math.abs(ctx.player.row - br) <= BOMB_EXPLOSION_RANGE) {
    ctx.damagePlayer(world);
  }
  for (let dr = -BOMB_EXPLOSION_RANGE; dr <= BOMB_EXPLOSION_RANGE; dr++) {
    for (let dc = -BOMB_EXPLOSION_RANGE; dc <= BOMB_EXPLOSION_RANGE; dc++) {
      const ec = bc + dc, er = br + dr;
      if (!inBounds(ec, er) || (ec === bc && er === br)) continue;
      if (ctx.grid[er][ec] === CELL_WALL) { destroyWallAt(world, ctx, ec, er); spawnBreakEffect(world, ctx, ec, er, 0x222222); continue; }
      const cell = ctx.grid[er][ec];
      if (cell === CELL_BLOCK || cell === CELL_STAR_BLOCK) destroyBlockAt(world, ctx, ec, er);
      if (cell === CELL_BOMB) explodeSingleBomb(world, ctx, p, ec, er);
      const enemy = ctx.findEnemyAt(ec, er);
      if (enemy) { _killEnemyScore(world, p, ctx.combo, ec, er, ctx.trackEntity); ctx.destroyEnemy(world, enemy); }
    }
  }
  spawnExplosionFlash(world, ctx, bc, br);
}

export function spawnExplosionFlash(world: IWorld, ctx: BlockContext, c: number, r: number): void {
  const pos = gridToWorld(c, r);
  const size = TILE_SIZE * (BOMB_EXPLOSION_RANGE * 2 + 1);
  const eid = EntityBuilder.create(world, W, H)
    .withTransform({ x: pos.x, y: pos.y })
    .withSprite({ color: 0xff6600, width: size, height: size, zIndex: Z_SCORE_POPUP - 1 })
    .build();
  ctx.trackEntity(eid);
  const sprite = world.getComponent<SpriteComponent>(eid, SPRITE_COMPONENT);
  if (sprite) globalTweens.to(sprite, { alpha: 0 }, { duration: 0.5, easing: Easing.easeOutQuad, onComplete: () => world.destroyEntity(eid) });
}

export function pushBombUntilCollision(
  world: IWorld, ctx: BlockContext, p: PlayerState,
  bombC: number, bombR: number, dc: number, dr: number,
  movePlayerTo: (world: IWorld, p: PlayerState, tc: number, tr: number) => void
): void {
  const { finalC, finalR, distance, hitEnemy } = calculateBombSlidePath(ctx, bombC, bombR, dc, dr);
  if (distance === 0) { explodeSingleBomb(world, ctx, p, bombC, bombR); p.cooldown = PLAYER_MOVE_COOLDOWN; return; }
  if (hitEnemy) {
    movePlayerTo(world, p, bombC, bombR);
    const bombKey = gridKey(bombC, bombR);
    const bombEid = ctx.entityMap.get(bombKey);
    if (bombEid !== undefined) {
      ctx.entityMap.delete(bombKey);
      ctx.entityMap.set(gridKey(finalC, finalR), bombEid);
      const bt = world.getComponent<TransformComponent>(bombEid, TRANSFORM_COMPONENT);
      if (bt) { const bp = gridToWorld(finalC, finalR); bt.x = bp.x; bt.y = bp.y; }
    }
    const bomb = ctx.bombs.find(b => b.col === bombC && b.row === bombR);
    if (bomb) { bomb.col = finalC; bomb.row = finalR; }
    ctx.grid[bombR][bombC] = CELL_EMPTY;
    ctx.grid[finalR][finalC] = CELL_BOMB;
    explodeSingleBomb(world, ctx, p, finalC, finalR);
    return;
  }
  const duration = pushBlock(world, ctx, bombC, bombR, finalC, finalR, CELL_BOMB);
  movePlayerTo(world, p, bombC, bombR);
  setTimeout(() => {
    if (!ctx.isActive || ctx.phase === 'complete') return;
    explodeSingleBomb(world, ctx, p, finalC, finalR);
  }, Math.max(0, Math.round(duration * 1000)));
}

export function handleEdgePush(
  world: IWorld, ctx: BlockContext, p: PlayerState,
  blockC: number, blockR: number, cellType: number,
  movePlayerTo: (world: IWorld, p: PlayerState, tc: number, tr: number) => void,
  spawnScorePopupFn: (world: IWorld, c: number, r: number, v: number, color: number) => void
): void {
  const key = gridKey(blockC, blockR);
  const blockEntity = ctx.entityMap.get(key);
  if (cellType === CELL_BLOCK) {
    gameAudio.playPush();
    p.score += SCORE_BLOCK_BREAK;
    spawnScorePopupFn(world, blockC, blockR, SCORE_BLOCK_BREAK, PALETTE.BREAK_WHITE);
    destroyBlockAt(world, ctx, blockC, blockR);
    spawnBreakEffect(world, ctx, blockC, blockR, 0x44bbaa);
    movePlayerTo(world, p, blockC, blockR);
    return;
  }
  if (cellType === CELL_STAR_BLOCK) {
    gameAudio.playPush();
    p.score += SCORE_STAR_BREAK;
    spawnScorePopupFn(world, blockC, blockR, SCORE_STAR_BREAK, PALETTE.SCORE_GOLD);
    destroyBlockAt(world, ctx, blockC, blockR);
    spawnBreakEffect(world, ctx, blockC, blockR, 0xffd700);
    spawnItemAt(world, ctx, blockC, blockR, ASSETS.PUSH_POWERUP);
    p.cooldown = PLAYER_MOVE_COOLDOWN;
    return;
  }
  if (cellType === CELL_BOMB) {
    gameAudio.playPush();
    explodeSingleBomb(world, ctx, p, blockC, blockR);
    if (ctx.grid[blockR][blockC] === CELL_EMPTY) movePlayerTo(world, p, blockC, blockR);
    else p.cooldown = PLAYER_MOVE_COOLDOWN;
    return;
  }
  if (cellType === CELL_HEART_BLOCK) {
    gameAudio.playPush();
    p.cooldown = PLAYER_MOVE_COOLDOWN;
    if (blockEntity !== undefined) {
      const transform = world.getComponent<TransformComponent>(blockEntity, TRANSFORM_COMPONENT);
      if (transform) {
        globalTweens.to(transform, { scaleX: 1.1, scaleY: 1.1 }, {
          duration: 0.06, easing: Easing.easeOutQuad, yoyo: true, repeat: 1,
          onComplete: () => { transform.scaleX = 1.0; transform.scaleY = 1.0; },
        });
      }
    }
  }
}

export function collectItem(
  world: IWorld, ctx: BlockContext, p: PlayerState, c: number, r: number,
  spawnScorePopupFn: (world: IWorld, c: number, r: number, v: number, color: number) => void,
  spawnPowerupTextFn: (world: IWorld, c: number, r: number, text: string, color: number) => void
): void {
  const key = gridKey(c, r);
  const itemEntity = ctx.entityMap.get(key);
  if (itemEntity !== undefined) {
    const sprite = world.getComponent<SpriteComponent>(itemEntity, SPRITE_COMPONENT);
    let scoreVal = SCORE_YELLOW_ITEM;
    if (sprite) {
      if (sprite.textureId === ASSETS.ITEM_BLUE) scoreVal = SCORE_BLUE_ITEM;
      if (sprite.textureId === ASSETS.PUSH_POWERUP) {
        p.pushDistance = Math.min(p.pushDistance + 1, PLAYER_MAX_PUSH_DISTANCE);
        p.canBreakWalls = true;
        spawnPowerupTextFn(world, c, r, '推力+1 / 可碎墙!', 0xff8800);
        gameAudio.playCoin();
        clearItemAt(world, ctx, c, r);
        return;
      }
    }
    p.score += scoreVal;
    p.collectibles += 1;
    gameAudio.playCoin();
    spawnScorePopupFn(world, c, r, scoreVal, PALETTE.SCORE_GOLD);
  }
  clearItemAt(world, ctx, c, r);
}
