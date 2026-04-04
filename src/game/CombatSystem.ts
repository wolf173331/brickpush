/**
 * CombatSystem - gestisce combo, scoring, danni a giocatore e NPC
 */
import {
  COMBO_WINDOW, COMBO_BASE_KILL, COMBO_INCREMENT, COMBO_MAX,
  PLAYER_DAMAGE_COOLDOWN, NPC_STUN_DURATION,
  Z_SCORE_POPUP, PALETTE,
  gridToWorld, GAME_WIDTH, GAME_HEIGHT,
} from '../config';
import {
  EntityBuilder, globalTweens, TextComponent, TEXT_COMPONENT,
  TransformComponent, TRANSFORM_COMPONENT,
  SpriteComponent, SPRITE_COMPONENT,
  Easing,
} from 'agent-gamedev';
import type { IWorld } from 'agent-gamedev';
import type { PlayerState, NpcState } from '../entity/types';

const W = GAME_WIDTH;
const H = GAME_HEIGHT;

export interface ComboState {
  count: number;
  timer: number;
}

export function tickCombo(combo: ComboState, dt: number): void {
  if (combo.timer > 0) {
    combo.timer -= dt;
    if (combo.timer <= 0) combo.count = 0;
  }
}

export function killEnemyScore(
  world: IWorld,
  player: PlayerState,
  combo: ComboState,
  ec: number, er: number,
  trackEntity: (eid: number) => void
): void {
  combo.count++;
  combo.timer = COMBO_WINDOW;
  const score = Math.min(COMBO_BASE_KILL + (combo.count - 1) * COMBO_INCREMENT, COMBO_MAX);
  player.score += score;
  const color = combo.count >= 3 ? 0xff4400 : PALETTE.SCORE_GOLD;
  const label = combo.count >= 2 ? `COMBO×${combo.count}  +${score}` : `+${score}`;
  spawnScorePopup(world, ec, er, score, color, label, trackEntity);
}

export function spawnScorePopup(
  world: IWorld,
  c: number, r: number,
  value: number,
  color: number,
  label: string | undefined,
  trackEntity: (eid: number) => void
): void {
  const pos = gridToWorld(c, r);
  const text = label ?? `+${value}`;
  const fontSize = label ? 16 : 18;
  const eid = EntityBuilder.create(world, W, H)
    .withTransform({ x: pos.x, y: pos.y })
    .withText({ text, fontSize, color, align: 'center', zIndex: Z_SCORE_POPUP })
    .build();
  trackEntity(eid);

  const transform = world.getComponent<TransformComponent>(eid, TRANSFORM_COMPONENT);
  if (transform) {
    globalTweens.to(transform, { y: pos.y - 48 }, {
      duration: 0.9, easing: Easing.easeOutQuad,
      onComplete: () => { world.destroyEntity(eid); },
    });
  }
  const textComp = world.getComponent<TextComponent>(eid, TEXT_COMPONENT);
  if (textComp) {
    globalTweens.to(textComp, { alpha: 0 }, { duration: 0.9, easing: Easing.linear });
  }
}

export function damagePlayer(
  world: IWorld,
  player: PlayerState,
  onDeath: () => void
): void {
  if (player.isInvincible) return;

  player.hp -= 1;
  player.damageCooldown = PLAYER_DAMAGE_COOLDOWN;
  player.isInvincible = true;
  player.inputLockTimer = 0.3;

  const sprite = world.getComponent<SpriteComponent>(player.entity, SPRITE_COMPONENT);
  if (sprite) {
    sprite.alpha = 1.0;
    let flashes = 0;
    const flash = () => {
      flashes++;
      const bright = flashes % 2 === 1;
      sprite.alpha = bright ? 1.0 : 0.15;
      if (flashes < 6) {
        globalTweens.to(sprite, { alpha: bright ? 0.15 : 1.0 }, {
          duration: 0.07, easing: Easing.easeOutQuad, onComplete: flash,
        });
      } else {
        sprite.alpha = 0.45;
        globalTweens.to(sprite, { alpha: 1.0 }, {
          duration: PLAYER_DAMAGE_COOLDOWN - 0.5, easing: Easing.easeOutQuad,
        });
      }
    };
    flash();
  }

  if (player.hp <= 0) onDeath();
}

export function damageNpc(world: IWorld, npc: NpcState): void {
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
      if (flashes < 6) {
        globalTweens.to(sprite, { alpha: flashes % 2 === 1 ? 1.0 : 0.2 }, {
          duration: 0.07, easing: Easing.easeOutQuad, onComplete: flash,
        });
      } else {
        sprite.alpha = 0.5;
        globalTweens.to(sprite, { alpha: 1.0 }, { duration: PLAYER_DAMAGE_COOLDOWN - 0.5, easing: Easing.easeOutQuad });
      }
    };
    flash();
  }
}
