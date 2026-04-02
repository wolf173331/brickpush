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

    this.trackEntity(
      UIEntityBuilder.create(world, W, H)
        .withUITransform({ anchor: 'center', y: -205, width: 620, height: 64 })
        .withText({
          text: 'RANKING BOARD',
          fontSize: 42,
          color: PALETTE.TITLE_YELLOW,
          align: 'center',
        })
        .build()
    );

    this.trackEntity(
      UIEntityBuilder.create(world, W, H)
        .withUITransform({ anchor: 'center', y: -162, width: 620, height: 28 })
        .withText({
          text: `TOP ${LEADERBOARD_MAX_ENTRIES}`,
          fontSize: 18,
          color: PALETTE.SUBTITLE_WHITE,
          align: 'center',
        })
        .build()
    );

    this.trackEntity(
      UIEntityBuilder.create(world, W, H)
        .withUITransform({ anchor: 'center', y: -120, width: 300, height: 26 })
        .withText({
          text: '01-10',
          fontSize: 18,
          color: PALETTE.SCORE_GOLD,
          align: 'center',
        })
        .build()
    );

    this.trackEntity(
      UIEntityBuilder.create(world, W, H)
        .withUITransform({ anchor: 'center', x: 220, y: -120, width: 300, height: 26 })
        .withText({
          text: '11-20',
          fontSize: 18,
          color: PALETTE.SCORE_GOLD,
          align: 'center',
        })
        .build()
    );

    const leaderboardLeftEntity = UIEntityBuilder.create(world, W, H)
      .withUITransform({ anchor: 'center', x: -220, y: 20, width: 320, height: 310 })
      .withText({
        text: this.formatLeaderboardColumn(loadLeaderboard(), 0),
        fontSize: 13,
        color: PALETTE.SUBTITLE_WHITE,
        align: 'center',
      })
      .build();
    this.trackEntity(leaderboardLeftEntity);
    this.leaderboardLeftEntity = leaderboardLeftEntity;

    const leaderboardRightEntity = UIEntityBuilder.create(world, W, H)
      .withUITransform({ anchor: 'center', x: 220, y: 20, width: 320, height: 310 })
      .withText({
        text: this.formatLeaderboardColumn(loadLeaderboard(), 10),
        fontSize: 13,
        color: PALETTE.SUBTITLE_WHITE,
        align: 'center',
      })
      .build();
    this.trackEntity(leaderboardRightEntity);
    this.leaderboardRightEntity = leaderboardRightEntity;

    this.trackEntity(
      UIEntityBuilder.create(world, W, H)
        .withUITransform({ anchor: 'center', y: 20, width: 20, height: 320 })
        .withText({
          text: '|\n|\n|\n|\n|\n|\n|\n|\n|\n|\n|\n|',
          fontSize: 18,
          color: PALETTE.HUD_TEXT,
          align: 'center',
        })
        .build()
    );

    this.trackEntity(
      UIEntityBuilder.create(world, W, H)
        .withUITransform({ anchor: 'center', y: 286, width: 260, height: 52 })
        .withButton({ label: '返回主界面', onClick: 'scene:menu', borderRadius: 8 })
        .build()
    );

    void this.refreshLeaderboard(world);
  }

  private formatLeaderboardColumn(entries: LeaderboardEntry[], startIndex: number): string {
    const slice = entries.slice(startIndex, startIndex + 10);

    if (entries.length === 0) {
      return [
        'RANK  NAME  SCORE',
        '----------------',
        'NO ENTRY',
      ].join('\n');
    }

    const lines = slice.map((entry, index) => {
      const rank = `${startIndex + index + 1}`.padStart(2, '0');
      const name = entry.name.padEnd(10, ' ').slice(0, 10);
      const score = `${entry.score}`.padStart(6, ' ');
      return `${rank}  ${name}  ${score}`;
    });

    return [
      'RANK  NAME  SCORE',
      '----------------',
      ...lines,
    ].join('\n');
  }

  private async refreshLeaderboard(world: IWorld): Promise<void> {
    const entries = await loadLeaderboardShared();
    if (this.leaderboardLeftEntity !== null) {
      const leftText = world.getComponent<UITextComponent>(this.leaderboardLeftEntity, UI_TEXT_COMPONENT);
      leftText?.setText(this.formatLeaderboardColumn(entries, 0));
    }
    if (this.leaderboardRightEntity !== null) {
      const rightText = world.getComponent<UITextComponent>(this.leaderboardRightEntity, UI_TEXT_COMPONENT);
      rightText?.setText(this.formatLeaderboardColumn(entries, 10));
    }
  }
}
