import { Scene, EntityBuilder, UIEntityBuilder, globalTheme, UITextComponent, UI_TEXT_COMPONENT } from 'agent-gamedev';
import type { IWorld, SceneTransitionData, EntityId } from 'agent-gamedev';
import { GAME_WIDTH, GAME_HEIGHT, PALETTE, getCurrentLevelName } from '../constants';
import {
  type LeaderboardEntry,
  LEADERBOARD_MAX_ENTRIES,
  getRunScore,
  loadLeaderboard,
  sanitizeLeaderboardName,
  saveLeaderboardEntryShared,
} from '../gameProgress';

const W = GAME_WIDTH;
const H = GAME_HEIGHT;

export class GameOverScene extends Scene {
  readonly name = 'GameOverScene';
  private overlayEl: HTMLDivElement | null = null;
  private leaderboardEntity: EntityId | null = null;

  onEnter(world: IWorld, data?: SceneTransitionData): void {
    globalTheme.setTheme('retro');

    const sceneScore = (data as { score?: number })?.score ?? 0;
    const score = Math.max(sceneScore, getRunScore());
    const victoryType = (data as { victoryType?: string })?.victoryType ?? 'defeat';
    const levelName = (data as { levelName?: string })?.levelName ?? getCurrentLevelName();
    const canSubmitScore = Boolean((data as { canSubmitScore?: boolean })?.canSubmitScore);
    const isVictory = victoryType === 'hearts';
    const leaderboard = loadLeaderboard();

    // Background
    this.trackEntity(
      EntityBuilder.create(world, W, H)
        .withBackground({ color: 0x0a0a1a })
        .build()
    );

    // Title
    this.trackEntity(
      UIEntityBuilder.create(world, W, H)
        .withUITransform({ anchor: 'center', y: -180, width: 500, height: 70 })
        .withText({
          text: isVictory ? '关卡通关!' : 'GAME OVER',
          fontSize: 48,
          color: isVictory ? PALETTE.LEVEL_COMPLETE_GOLD : 0xff4444,
          align: 'center',
        })
        .build()
    );

    // Subtitle
    this.trackEntity(
      UIEntityBuilder.create(world, W, H)
        .withUITransform({ anchor: 'center', y: -120, width: 400, height: 36 })
        .withText({
          text: isVictory ? `${levelName} CLEAR` : levelName,
          fontSize: 22,
          color: PALETTE.SUBTITLE_WHITE,
          align: 'center',
        })
        .build()
    );

    // Victory / defeat description
    this.trackEntity(
      UIEntityBuilder.create(world, W, H)
        .withUITransform({ anchor: 'center', y: -70, width: 400, height: 36 })
        .withText({
          text: isVictory ? '♥ 心心集合通关!' : '时间耗尽或生命归零',
          fontSize: 20,
          color: isVictory ? PALETTE.HEART_RED : PALETTE.SUBTITLE_WHITE,
          align: 'center',
        })
        .build()
    );

    // Score
    this.trackEntity(
      UIEntityBuilder.create(world, W, H)
        .withUITransform({ anchor: 'center', y: -10, width: 400, height: 36 })
        .withText({
          text: `得分: ${score}`,
          fontSize: 28,
          color: PALETTE.SCORE_GOLD,
          align: 'center',
        })
        .build()
    );

    const leaderboardEntity = UIEntityBuilder.create(world, W, H)
      .withUITransform({ anchor: 'center', y: 52, width: 520, height: 160 })
      .withText({
        text: this.formatLeaderboardText(leaderboard),
        fontSize: 16,
        color: PALETTE.SUBTITLE_WHITE,
        align: 'center',
      })
      .build();
    this.trackEntity(leaderboardEntity);
    this.leaderboardEntity = leaderboardEntity;

    void this.refreshLeaderboard(world);

    // 只有胜利才能提交分数
    if (isVictory && canSubmitScore) {
      this.mountLeaderboardForm(world, score, levelName);
    }

    // Play again
    this.trackEntity(
      UIEntityBuilder.create(world, W, H)
        .withUITransform({ anchor: 'center', y: 170, width: 220, height: 50 })
        .withButton({ label: '再来一局', onClick: 'scene:game', borderRadius: 8 })
        .build()
    );

    this.trackEntity(
      UIEntityBuilder.create(world, W, H)
        .withUITransform({ anchor: 'center', x: -140, y: 240, width: 220, height: 50 })
        .withButton({ label: '街机排行榜', onClick: 'scene:leaderboard', borderRadius: 8 })
        .build()
    );

    // Back to menu
    this.trackEntity(
      UIEntityBuilder.create(world, W, H)
        .withUITransform({ anchor: 'center', x: 140, y: 240, width: 220, height: 50 })
        .withButton({ label: '返回菜单', onClick: 'scene:menu', borderRadius: 8 })
        .build()
    );
  }

  private formatLeaderboardText(entries: LeaderboardEntry[]): string {
    if (entries.length === 0) {
      return '排行榜\\n暂无记录';
    }

    return [
      `排行榜 TOP ${LEADERBOARD_MAX_ENTRIES}`,
      ...entries.slice(0, 10).map((entry, index) => `${`${index + 1}`.padStart(2, '0')} ${entry.name} ${entry.score}`),
    ].join('\\n');
  }

  private async refreshLeaderboard(world: IWorld): Promise<void> {
    const entries = loadLeaderboard(); // 直接使用本地存储
    if (this.leaderboardEntity === null) return;
    const uiText = world.getComponent<UITextComponent>(this.leaderboardEntity, UI_TEXT_COMPONENT);
    uiText?.setText(this.formatLeaderboardText(entries));
  }

  private mountLeaderboardForm(world: IWorld, score: number, levelName: string): void {
    if (typeof document === 'undefined') return;

    const container = document.getElementById('game-container');
    if (!container) return;

    const overlay = document.createElement('div');
    overlay.style.position = 'absolute';
    overlay.style.inset = '0';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.background = 'rgba(4, 4, 12, 0.72)';
    overlay.style.zIndex = '40';
    overlay.style.pointerEvents = 'auto';

    const panel = document.createElement('div');
    panel.style.display = 'flex';
    panel.style.flexDirection = 'column';
    panel.style.alignItems = 'center';
    panel.style.gap = '12px';
    panel.style.width = '360px';
    panel.style.maxWidth = 'calc(100% - 32px)';
    panel.style.padding = '18px 20px';
    panel.style.border = '2px solid #e0b84f';
    panel.style.borderRadius = '14px';
    panel.style.background = 'rgba(10, 10, 26, 0.96)';
    panel.style.boxShadow = '0 12px 32px rgba(0,0,0,0.45)';

    const title = document.createElement('div');
    title.textContent = '输入名字后按确定保存';
    title.style.color = '#ffe7a3';
    title.style.fontSize = '20px';
    title.style.fontWeight = '700';

    const subtitle = document.createElement('div');
    subtitle.textContent = '将成绩写入街机排行榜';
    subtitle.style.color = '#d7d7d7';
    subtitle.style.fontSize = '13px';

    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 10;
    input.placeholder = 'NAME';
    input.autocomplete = 'off';
    input.style.width = '140px';
    input.style.padding = '8px 10px';
    input.style.border = '1px solid #888';
    input.style.borderRadius = '8px';
    input.style.background = '#f7f2dd';
    input.style.color = '#222';
    input.style.fontSize = '16px';
    input.style.textTransform = 'uppercase';
    input.addEventListener('input', () => {
      input.value = sanitizeLeaderboardName(input.value);
    });

    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.gap = '10px';
    actions.style.justifyContent = 'center';
    actions.style.width = '100%';

    const confirmButton = document.createElement('button');
    confirmButton.textContent = '确定保存';
    confirmButton.style.padding = '10px 16px';
    confirmButton.style.border = 'none';
    confirmButton.style.borderRadius = '8px';
    confirmButton.style.background = '#d86e3a';
    confirmButton.style.color = '#fff8e6';
    confirmButton.style.fontWeight = '700';
    confirmButton.style.cursor = 'pointer';

    const laterButton = document.createElement('button');
    laterButton.textContent = '稍后再说';
    laterButton.style.padding = '10px 16px';
    laterButton.style.border = '1px solid #8086a2';
    laterButton.style.borderRadius = '8px';
    laterButton.style.background = '#1f2337';
    laterButton.style.color = '#e9edf8';
    laterButton.style.fontWeight = '700';
    laterButton.style.cursor = 'pointer';

    const hint = document.createElement('div');
    hint.textContent = '英文名 1-10 字符';
    hint.style.color = '#ddd';
    hint.style.fontSize = '12px';
    hint.style.textAlign = 'center';

    const closeOverlay = () => {
      if (this.overlayEl) {
        this.overlayEl.remove();
        this.overlayEl = null;
      }
    };

    const submit = async () => {
      const safeName = sanitizeLeaderboardName(input.value);
      if (!safeName) {
        hint.textContent = '请输入 1-10 个英文字母';
        hint.style.color = '#ff9a7a';
        return;
      }

      confirmButton.disabled = true;
      laterButton.disabled = true;
      confirmButton.textContent = '保存中...';

      try {
        const entries = await saveLeaderboardEntryShared(safeName, score, levelName);
        if (this.leaderboardEntity !== null) {
          const uiText = world.getComponent<UITextComponent>(this.leaderboardEntity, UI_TEXT_COMPONENT);
          uiText?.setText(this.formatLeaderboardText(entries));
        }
        hint.textContent = `已保存: ${safeName}`;
        hint.style.color = '#9fe08d';
        input.disabled = true;
        confirmButton.style.opacity = '0.6';
        confirmButton.style.cursor = 'default';
        confirmButton.textContent = '已保存';
        window.setTimeout(() => {
          closeOverlay();
        }, 350);
      } catch {
        confirmButton.disabled = false;
        laterButton.disabled = false;
        confirmButton.textContent = '确定保存';
        hint.textContent = '保存失败，请重试';
        hint.style.color = '#ff9a7a';
      }
    };

    confirmButton.addEventListener('click', submit);
    laterButton.addEventListener('click', closeOverlay);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        submit();
      }
    });

    actions.appendChild(confirmButton);
    actions.appendChild(laterButton);

    panel.appendChild(title);
    panel.appendChild(subtitle);
    panel.appendChild(input);
    panel.appendChild(hint);
    panel.appendChild(actions);
    overlay.appendChild(panel);
    container.appendChild(overlay);
    this.overlayEl = overlay;
    window.setTimeout(() => input.focus(), 0);
  }

  onExit(_world: IWorld): void {
    if (this.overlayEl) {
      this.overlayEl.remove();
      this.overlayEl = null;
    }
  }
}
