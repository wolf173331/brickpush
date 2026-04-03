import { Scene, EntityBuilder, UIEntityBuilder, globalTheme, UITextComponent, UI_TEXT_COMPONENT } from 'agent-gamedev';
import type { EntityId, IWorld, SceneTransitionData } from 'agent-gamedev';
import { GAME_WIDTH, GAME_HEIGHT, PALETTE } from '../constants';
import { type LeaderboardEntry, loadLeaderboard, loadLeaderboardShared, LEADERBOARD_MAX_ENTRIES } from '../gameProgress';

const W = GAME_WIDTH;
const H = GAME_HEIGHT;

export class LeaderboardScene extends Scene {
  readonly name = 'LeaderboardScene';
  private leaderboardLeftEntity: EntityId | null = null;
  private leaderboardRightEntity: EntityId | null = null;

  onEnter(world: IWorld, _data?: SceneTransitionData): void {
    globalTheme.setTheme('retro');

    this.trackEntity(
      EntityBuilder.create(world, W, H)
        .withBackground({ color: PALETTE.MENU_BG })
        .build()
    );

    // 标题
    this.trackEntity(
      UIEntityBuilder.create(world, W, H)
        .withUITransform({ anchor: 'center', y: -290, width: 620, height: 60 })
        .withText({ text: 'RANKING BOARD', fontSize: 40, color: PALETTE.TITLE_YELLOW, align: 'center' })
        .build()
    );

    this.trackEntity(
      UIEntityBuilder.create(world, W, H)
        .withUITransform({ anchor: 'center', y: -245, width: 620, height: 26 })
        .withText({ text: `TOP ${LEADERBOARD_MAX_ENTRIES}`, fontSize: 16, color: PALETTE.SUBTITLE_WHITE, align: 'center' })
        .build()
    );

    // 列标题
    this.trackEntity(
      UIEntityBuilder.create(world, W, H)
        .withUITransform({ anchor: 'center', x: -220, y: -210, width: 300, height: 24 })
        .withText({ text: '01 - 10', fontSize: 16, color: PALETTE.SCORE_GOLD, align: 'center' })
        .build()
    );

    this.trackEntity(
      UIEntityBuilder.create(world, W, H)
        .withUITransform({ anchor: 'center', x: 220, y: -210, width: 300, height: 24 })
        .withText({ text: '11 - 20', fontSize: 16, color: PALETTE.SCORE_GOLD, align: 'center' })
        .build()
    );

    // 分隔线
    this.trackEntity(
      UIEntityBuilder.create(world, W, H)
        .withUITransform({ anchor: 'center', y: -40, width: 2, height: 280 })
        .withText({ text: '|\n|\n|\n|\n|\n|\n|\n|\n|\n|\n|\n|', fontSize: 16, color: PALETTE.HUD_TEXT, align: 'center' })
        .build()
    );

    // 左列
    const leaderboardLeftEntity = UIEntityBuilder.create(world, W, H)
      .withUITransform({ anchor: 'center', x: -220, y: -40, width: 320, height: 280 })
      .withText({ text: this.formatColumn(loadLeaderboard(), 0), fontSize: 13, color: PALETTE.SUBTITLE_WHITE, align: 'center' })
      .build();
    this.trackEntity(leaderboardLeftEntity);
    this.leaderboardLeftEntity = leaderboardLeftEntity;

    // 右列
    const leaderboardRightEntity = UIEntityBuilder.create(world, W, H)
      .withUITransform({ anchor: 'center', x: 220, y: -40, width: 320, height: 280 })
      .withText({ text: this.formatColumn(loadLeaderboard(), 10), fontSize: 13, color: PALETTE.SUBTITLE_WHITE, align: 'center' })
      .build();
    this.trackEntity(leaderboardRightEntity);
    this.leaderboardRightEntity = leaderboardRightEntity;

    // 返回按钮
    this.trackEntity(
      UIEntityBuilder.create(world, W, H)
        .withUITransform({ anchor: 'center', y: 230, width: 260, height: 52 })
        .withButton({ label: '返回主界面', onClick: 'scene:menu', borderRadius: 8 })
        .build()
    );

    void this.refreshLeaderboard(world);
  }

  override onExit(_world: IWorld): void {
    // 清理工作由父类处理
  }

  private formatColumn(entries: LeaderboardEntry[], startIndex: number): string {
    const slice = entries.slice(startIndex, startIndex + 10);

    if (entries.length === 0) {
      return 'RANK  NAME        SCORE\n--------------------\nNO ENTRY';
    }

    const lines = slice.map((entry, i) => {
      const rank = `${startIndex + i + 1}`.padStart(2, '0');
      const name = entry.name.padEnd(10, ' ').slice(0, 10);
      const score = `${entry.score}`.padStart(7, ' ');
      return `${rank}  ${name}  ${score}`;
    });

    return ['RANK  NAME        SCORE', '---------------------', ...lines].join('\n');
  }

  private async refreshLeaderboard(world: IWorld): Promise<void> {
    // 优先从 Supabase 在线获取，失败则用本地
    const entries = await loadLeaderboardShared();
    if (this.leaderboardLeftEntity !== null) {
      const t = world.getComponent<UITextComponent>(this.leaderboardLeftEntity, UI_TEXT_COMPONENT);
      t?.setText(this.formatColumn(entries, 0));
    }
    if (this.leaderboardRightEntity !== null) {
      const t = world.getComponent<UITextComponent>(this.leaderboardRightEntity, UI_TEXT_COMPONENT);
      t?.setText(this.formatColumn(entries, 10));
    }
  }
}
