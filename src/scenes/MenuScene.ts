import { Scene, EntityBuilder, UIEntityBuilder, globalTheme } from 'agent-gamedev';
import type { IWorld, SceneTransitionData } from 'agent-gamedev';
import { GAME_WIDTH, GAME_HEIGHT, PALETTE, getCurrentLevelName, APP_VERSION, isNpcSquirrelEnabled, setNpcSquirrelEnabled } from '../constants';

const W = GAME_WIDTH;
const H = GAME_HEIGHT;

export class MenuScene extends Scene {
  readonly name = 'MenuScene';
  private squirrelCheckbox: HTMLElement | null = null;

  onEnter(world: IWorld, _data?: SceneTransitionData): void {
    globalTheme.setTheme('retro');
    const levelName = getCurrentLevelName();

    this.trackEntity(EntityBuilder.create(world, W, H).withBackground({ color: PALETTE.MENU_BG }).build());

    this.trackEntity(UIEntityBuilder.create(world, W, H)
      .withUITransform({ anchor: 'center', y: -180, width: 600, height: 80 })
      .withText({ text: '把心串串', fontSize: 56, color: PALETTE.TITLE_YELLOW, align: 'center' })
      .build());

    this.trackEntity(UIEntityBuilder.create(world, W, H)
      .withUITransform({ anchor: 'center', y: -110, width: 400, height: 40 })
      .withText({ text: 'HEART KABAB', fontSize: 24, color: PALETTE.SUBTITLE_WHITE, align: 'center' })
      .build());

    this.trackEntity(UIEntityBuilder.create(world, W, H)
      .withUITransform({ anchor: 'center', y: -50, width: 300, height: 36 })
      .withText({ text: levelName, fontSize: 22, color: PALETTE.HUD_TEXT, align: 'center' })
      .build());

    this.trackEntity(UIEntityBuilder.create(world, W, H)
      .withUITransform({ anchor: 'center', y: 18, width: 240, height: 56 })
      .withButton({ label: '开始游戏', onClick: 'scene:game', borderRadius: 8 })
      .build());

    // 双人游戏按钮（Supabase版）
    this.trackEntity(UIEntityBuilder.create(world, W, H)
      .withUITransform({ anchor: 'center', y: 82, width: 240, height: 50 })
      .withButton({ label: '🎮 双人游戏', onClick: 'scene:multiplayer', borderRadius: 8 })
      .build());
    
    // 帧同步双人游戏按钮（测试版）
    this.trackEntity(UIEntityBuilder.create(world, W, H)
      .withUITransform({ anchor: 'center', y: 146, width: 280, height: 50 })
      .withButton({ label: '⚡ P2P帧同步(测试)', onClick: 'scene:lockstep', borderRadius: 8 })
      .build());

    this.trackEntity(UIEntityBuilder.create(world, W, H)
      .withUITransform({ anchor: 'center', y: 210, width: 240, height: 50 })
      .withButton({ label: '查看排行榜', onClick: 'scene:leaderboard', borderRadius: 8 })
      .build());

    this.trackEntity(UIEntityBuilder.create(world, W, H)
      .withUITransform({ anchor: 'center', y: 210, width: 500, height: 28 })
      .withText({ text: '操作: WASD / 方向键 移动', fontSize: 18, color: PALETTE.SUBTITLE_WHITE, align: 'center' })
      .build());

    this.trackEntity(UIEntityBuilder.create(world, W, H)
      .withUITransform({ anchor: 'center', y: 250, width: 500, height: 28 })
      .withText({ text: '♥ 将心心方块横或竖串在一起即可通关!', fontSize: 16, color: PALETTE.HEART_RED, align: 'center' })
      .build());

    this.trackEntity(UIEntityBuilder.create(world, W, H)
      .withUITransform({ anchor: 'center', y: 290, width: 500, height: 28 })
      .withText({ text: '推方块到边缘继续推 → 碎裂 / 爆炸!', fontSize: 14, color: PALETTE.SUBTITLE_WHITE, align: 'center' })
      .build());

    this.trackEntity(UIEntityBuilder.create(world, W, H)
      .withUITransform({ anchor: 'bottom-right', x: -12, y: -8, width: 120, height: 20 })
      .withText({ text: `v${APP_VERSION}`, fontSize: 12, color: 0x333355, align: 'right' })
      .build());

    this.mountSquirrelCheckbox();
  }

  private mountSquirrelCheckbox(): void {
    if (typeof document === 'undefined') return;
    const container = document.getElementById('game-container');
    if (!container) return;

    const wrap = document.createElement('div');
    wrap.style.cssText = [
      'position:absolute', 'bottom:48px', 'left:50%', 'transform:translateX(-50%)',
      'display:flex', 'align-items:center', 'gap:10px', 'cursor:pointer',
      'user-select:none', 'z-index:10',
    ].join(';');

    const box = document.createElement('div');
    const checked = isNpcSquirrelEnabled();
    box.style.cssText = [
      'width:22px', 'height:22px', 'border:2px solid #6688aa', 'border-radius:4px',
      `background:${checked ? '#4488cc' : '#0a0a1a'}`,
      'display:flex', 'align-items:center', 'justify-content:center',
      'font-size:14px', 'color:#fff', 'transition:background 0.15s',
    ].join(';');
    box.textContent = checked ? '✓' : '';

    const label = document.createElement('span');
    label.textContent = '带上松鼠 🐿';
    label.style.cssText = 'color:#aaccee;font-family:monospace;font-size:15px;';

    wrap.appendChild(box);
    wrap.appendChild(label);
    container.appendChild(wrap);
    this.squirrelCheckbox = wrap;

    wrap.addEventListener('click', () => {
      const next = !isNpcSquirrelEnabled();
      setNpcSquirrelEnabled(next);
      box.style.background = next ? '#4488cc' : '#0a0a1a';
      box.textContent = next ? '✓' : '';
    });
  }

  onExit(_world: IWorld): void {
    if (this.squirrelCheckbox) {
      this.squirrelCheckbox.remove();
      this.squirrelCheckbox = null;
    }
  }
}
