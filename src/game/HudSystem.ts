/**
 * HudSystem - creazione e aggiornamento dell'HUD di gioco
 */
import {
  EntityBuilder, UIEntityBuilder,
  UITextComponent, UI_TEXT_COMPONENT,
  TextComponent, TEXT_COMPONENT,
  TransformComponent, TRANSFORM_COMPONENT,
} from 'agent-gamedev';
import type { IWorld, EntityId } from 'agent-gamedev';
import {
  GAME_WIDTH, GAME_HEIGHT,
  PLAYER_MAX_HP, PLAYER_PUSH_DISTANCE,
  TIME_WARNING_THRESHOLD,
  PALETTE, Z_UI,
  HUD_TOP_Y, HUD_PADDING_X,
  LEVELS, getLevelTimeLimit,
} from '../config';
import type { PlayerState } from '../entity/types';
import { countHearts, checkHeartsConnected } from './WinCondition';

const W = GAME_WIDTH;
const H = GAME_HEIGHT;

export interface HudEntities {
  hpEntity: EntityId;
  scoreDisplayEntity: EntityId;
  timeDisplayEntity: EntityId;
  levelDisplayEntity: EntityId;
  heartStatusEntity: EntityId;
  enemyCountEntity: EntityId;
  scoreEntity: EntityId;
  collectEntity: EntityId;
  readyEntity: EntityId;
}

export function createHUD(
  world: IWorld,
  levelIndex: number,
  initHp: number,
  trackEntity: (eid: EntityId) => void
): HudEntities {
  trackEntity(
    EntityBuilder.create(world, W, H)
      .withTransform({ x: W / 2, y: HUD_TOP_Y + 10, screenSpace: true })
      .withSprite({ color: PALETTE.HUD_BG, width: W, height: 52, zIndex: Z_UI })
      .build()
  );

  const initHearts = '♥'.repeat(Math.max(0, initHp));
  const initEmpty  = '♡'.repeat(Math.max(0, PLAYER_MAX_HP - initHp));
  const hpEntity = UIEntityBuilder.create(world, W, H)
    .withUITransform({ anchor: 'top-left', x: HUD_PADDING_X, y: 6, width: 160, height: 36 })
    .withText({ text: `HP: ${initHearts}${initEmpty}`, fontSize: 22, color: 0xff6666, align: 'left' })
    .build();
  trackEntity(hpEntity);

  const scoreDisplayEntity = UIEntityBuilder.create(world, W, H)
    .withUITransform({ anchor: 'top-center', y: 6, width: 280, height: 36 })
    .withText({ text: '得分: 0', fontSize: 24, color: PALETTE.SCORE_GOLD, align: 'center' })
    .build();
  trackEntity(scoreDisplayEntity);

  const initTime = getLevelTimeLimit(levelIndex, Math.max(LEVELS.length, 1));
  const timeDisplayEntity = UIEntityBuilder.create(world, W, H)
    .withUITransform({ anchor: 'top-right', x: -HUD_PADDING_X, y: 4, width: 130, height: 40 })
    .withText({ text: `⏱ ${initTime}`, fontSize: 26, color: PALETTE.SCORE_CYAN, align: 'right' })
    .build();
  trackEntity(timeDisplayEntity);

  const levelDisplayEntity = UIEntityBuilder.create(world, W, H)
    .withUITransform({ anchor: 'top-right', x: -HUD_PADDING_X, y: 46, width: 130, height: 26 })
    .withText({ text: `关卡: ${levelIndex + 1}`, fontSize: 16, color: PALETTE.SCORE_CYAN, align: 'right' })
    .build();
  trackEntity(levelDisplayEntity);

  const heartStatusEntity = UIEntityBuilder.create(world, W, H)
    .withUITransform({ anchor: 'top-right', x: -5, y: 90, width: 110, height: 80 })
    .withText({ text: '将♥\n连成一线!', fontSize: 16, color: PALETTE.HEART_RED, align: 'center' })
    .build();
  trackEntity(heartStatusEntity);

  // Placeholder entities (not visible, kept for compatibility)
  const enemyCountEntity = 0 as EntityId;
  const scoreEntity = 0 as EntityId;
  const collectEntity = 0 as EntityId;
  const readyEntity = 0 as EntityId;

  return { hpEntity, scoreDisplayEntity, timeDisplayEntity, levelDisplayEntity, heartStatusEntity, enemyCountEntity, scoreEntity, collectEntity, readyEntity };
}

export function createReadyOverlay(world: IWorld, trackEntity: (eid: EntityId) => void): EntityId {
  const eid = UIEntityBuilder.create(world, W, H)
    .withUITransform({ anchor: 'center', width: 400, height: 80 })
    .withText({ text: 'READY', fontSize: 52, color: PALETTE.READY_TEXT, align: 'center' })
    .build();
  trackEntity(eid);
  return eid;
}

export function updateHUD(
  world: IWorld,
  hud: HudEntities,
  player: PlayerState | null,
  enemies: unknown[],
  timeLeft: number,
  levelIndex: number,
  grid: number[][]
): void {
  if (player) {
    setUIText(world, hud.scoreDisplayEntity, `得分: ${player.score}`);

    const hearts = '♥'.repeat(Math.max(0, player.hp));
    const emptyHearts = '♡'.repeat(Math.max(0, PLAYER_MAX_HP - player.hp));
    const hpColor = player.hp <= 1 ? 0xff4444 : (player.hp === 2 ? 0xffaa44 : 0x44ff44);
    setUIText(world, hud.hpEntity, `HP: ${hearts}${emptyHearts}`);
    const uiHp = world.getComponent<UITextComponent>(hud.hpEntity, UI_TEXT_COMPONENT);
    if (uiHp) uiHp.color = hpColor;

    if (player.pushDistance > PLAYER_PUSH_DISTANCE) {
      // future: show push distance indicator
    }
  }

  const timeSeconds = Math.max(0, Math.floor(timeLeft));
  const isWarning = timeSeconds <= TIME_WARNING_THRESHOLD;
  const timeColor = isWarning ? 0xff2222 : (timeSeconds <= 30 ? 0xffaa00 : PALETTE.SCORE_CYAN);
  setUIText(world, hud.timeDisplayEntity, `⏱ ${timeSeconds}`);
  const uiTime = world.getComponent<UITextComponent>(hud.timeDisplayEntity, UI_TEXT_COMPONENT);
  if (uiTime) uiTime.color = timeColor;

  const timeTransform = world.getComponent<TransformComponent>(hud.timeDisplayEntity, TRANSFORM_COMPONENT);
  if (timeTransform) {
    if (isWarning) {
      const pulse = 1 + 0.18 * Math.abs(Math.sin(timeLeft * Math.PI));
      timeTransform.scaleX = pulse;
      timeTransform.scaleY = pulse;
    } else {
      timeTransform.scaleX = 1;
      timeTransform.scaleY = 1;
    }
  }

  const heartCount = countHearts(grid);
  const connected = checkHeartsConnected(grid);
  setUIText(world, hud.heartStatusEntity, connected ? '♥ 已集合!' : `♥×${heartCount} \n连成一线\n通关!`);
  setUIText(world, hud.levelDisplayEntity, `关卡: ${levelIndex + 1}`);

  void enemies; // used for future enemy count display
}

export function setUIText(world: IWorld, entity: EntityId, text: string): void {
  if (!entity) return;
  const uiText = world.getComponent<UITextComponent>(entity, UI_TEXT_COMPONENT);
  if (uiText) { uiText.setText(text); return; }
  const tc = world.getComponent<TextComponent>(entity, TEXT_COMPONENT);
  if (tc) tc.text = text;
}
