import { Scene, EntityBuilder, UIEntityBuilder, globalTheme } from 'agent-gamedev';
import type { IWorld, SceneTransitionData } from 'agent-gamedev';
import { GAME_WIDTH, GAME_HEIGHT, PALETTE, getCurrentLevelName } from '../constants';

const W = GAME_WIDTH;
const H = GAME_HEIGHT;

export class MenuScene extends Scene {
  readonly name = 'MenuScene';

  onEnter(world: IWorld, _data?: SceneTransitionData): void {
    globalTheme.setTheme('retro');
    const levelName = getCurrentLevelName();

    // Dark arcade background
    this.trackEntity(
      EntityBuilder.create(world, W, H)
        .withBackground({ color: PALETTE.MENU_BG })
        .build()
    );

    // Title
    this.trackEntity(
      UIEntityBuilder.create(world, W, H)
        .withUITransform({ anchor: 'center', y: -180, width: 600, height: 80 })
        .withText({ text: '把心串串', fontSize: 56, color: PALETTE.TITLE_YELLOW, align: 'center' })
        .build()
    );

    // Subtitle
    this.trackEntity(
      UIEntityBuilder.create(world, W, H)
        .withUITransform({ anchor: 'center', y: -110, width: 400, height: 40 })
        .withText({ text: 'HEART KABAB', fontSize: 24, color: PALETTE.SUBTITLE_WHITE, align: 'center' })
        .build()
    );

    // Level indicator
    this.trackEntity(
      UIEntityBuilder.create(world, W, H)
        .withUITransform({ anchor: 'center', y: -50, width: 300, height: 36 })
        .withText({ text: levelName, fontSize: 22, color: PALETTE.HUD_TEXT, align: 'center' })
        .build()
    );

    // Start button
    this.trackEntity(
      UIEntityBuilder.create(world, W, H)
        .withUITransform({ anchor: 'center', y: 18, width: 240, height: 56 })
        .withButton({ label: '开始游戏', onClick: 'scene:game', borderRadius: 8 })
        .build()
    );

    // Leaderboard button
    this.trackEntity(
      UIEntityBuilder.create(world, W, H)
        .withUITransform({ anchor: 'center', y: 86, width: 240, height: 50 })
        .withButton({ label: '查看排行榜', onClick: 'scene:leaderboard', borderRadius: 8 })
        .build()
    );

    // Controls hint
    this.trackEntity(
      UIEntityBuilder.create(world, W, H)
        .withUITransform({ anchor: 'center', y: 150, width: 500, height: 28 })
        .withText({
          text: '操作: WASD / 方向键 移动',
          fontSize: 18,
          color: PALETTE.SUBTITLE_WHITE,
          align: 'center',
        })
        .build()
    );

    // Victory hint
    this.trackEntity(
      UIEntityBuilder.create(world, W, H)
        .withUITransform({ anchor: 'center', y: 190, width: 500, height: 28 })
        .withText({
          text: '♥ 将心心方块横或竖串在一起即可通关!',
          fontSize: 16,
          color: PALETTE.HEART_RED,
          align: 'center',
        })
        .build()
    );

    // Block mechanic hint
    this.trackEntity(
      UIEntityBuilder.create(world, W, H)
        .withUITransform({ anchor: 'center', y: 230, width: 500, height: 28 })
        .withText({
          text: '推方块到边缘继续推 → 碎裂 / 爆炸!',
          fontSize: 14,
          color: PALETTE.SUBTITLE_WHITE,
          align: 'center',
        })
        .build()
    );
  }

  onExit(_world: IWorld): void {
    // tracked entities are auto-cleaned
  }
}
