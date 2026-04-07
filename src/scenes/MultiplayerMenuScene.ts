import { Scene, EntityBuilder, UIEntityBuilder, globalTheme } from 'agent-gamedev';
import type { IWorld, SceneTransitionData } from 'agent-gamedev';
import { GAME_WIDTH, GAME_HEIGHT, PALETTE, setCurrentLevelIndex } from '../constants';
import { resetRunHp, resetRunScore, resetPlayerColor } from '../gameProgress';
import { NetworkManager } from '../network/NetworkManager';
import { globalEventBus } from 'agent-gamedev';

const W = GAME_WIDTH;
const H = GAME_HEIGHT;

export class MultiplayerMenuScene extends Scene {
  readonly name = 'MultiplayerMenuScene';

  onEnter(world: IWorld, _data?: SceneTransitionData): void {
    globalTheme.setTheme('retro');

    this.trackEntity(
      EntityBuilder.create(world, W, H).withBackground({ color: PALETTE.MENU_BG }).build()
    );

    // 标题
    this.trackEntity(
      UIEntityBuilder.create(world, W, H)
        .withUITransform({ anchor: 'center', y: -200, width: 600, height: 60 })
        .withText({ text: '双人联机', fontSize: 40, color: PALETTE.TITLE_YELLOW, align: 'center' })
        .build()
    );

    // 创建房间按钮
    this.trackEntity(
      UIEntityBuilder.create(world, W, H)
        .withUITransform({ anchor: 'center', y: -80, width: 280, height: 56 })
        .withButton({ 
          label: '创建房间', 
          onClick: 'multiplayer:create', 
          borderRadius: 8 
        })
        .build()
    );

    // 输入框提示
    this.trackEntity(
      UIEntityBuilder.create(world, W, H)
        .withUITransform({ anchor: 'center', y: 0, width: 400, height: 30 })
        .withText({ text: '或输入房间号加入:', fontSize: 18, color: PALETTE.SUBTITLE_WHITE, align: 'center' })
        .build()
    );

    // 返回按钮
    this.trackEntity(
      UIEntityBuilder.create(world, W, H)
        .withUITransform({ anchor: 'center', y: 200, width: 200, height: 50 })
        .withButton({ label: '返回', onClick: 'scene:menu', borderRadius: 8 })
        .build()
    );

    // 创建房间输入界面
    this.createRoomUI(world);
  }

  private createRoomUI(_world: IWorld): void {
    if (typeof document === 'undefined') return;

    const container = document.getElementById('game-container');
    if (!container) return;

    // 移除已存在的
    const existing = document.getElementById('mp-ui');
    if (existing) existing.remove();

    const ui = document.createElement('div');
    ui.id = 'mp-ui';
    ui.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, 0);
      margin-top: 20px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      z-index: 100;
    `;

    // 房间号输入
    const input = document.createElement('input');
    input.id = 'room-input';
    input.type = 'text';
    input.placeholder = '输入6位房间号';
    input.maxLength = 6;
    input.style.cssText = `
      width: 140px;
      padding: 8px;
      font-size: 18px;
      text-align: center;
      text-transform: uppercase;
      border: 2px solid #4488cc;
      border-radius: 6px;
      background: rgba(10,10,26,0.9);
      color: #fff;
    `;

    // 加入按钮
    const joinBtn = document.createElement('button');
    joinBtn.textContent = '加入房间';
    joinBtn.style.cssText = `
      padding: 8px 20px;
      background: #4488cc;
      color: #fff;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
    `;

    // 状态文本
    const status = document.createElement('div');
    status.id = 'mp-status';
    status.style.cssText = 'color: #aaa; font-size: 12px; margin-top: 10px;';
    status.textContent = '点击"创建房间"或输入房间号加入';

    joinBtn.onclick = async () => {
      const roomId = input.value.trim().toUpperCase();
      if (roomId.length !== 6) {
        status.textContent = '请输入6位房间号';
        status.style.color = '#ff6666';
        return;
      }

      status.textContent = '加入中...';
      status.style.color = '#ffff88';

      const success = await NetworkManager.getInstance().joinRoom(roomId);
      if (success) {
        status.textContent = `已加入 ${roomId}，等待开始...`;
        status.style.color = '#88ff88';
        
        NetworkManager.getInstance().onGameStart = () => {
          this.startGame();
        };
      } else {
        status.textContent = '加入失败，房间不存在';
        status.style.color = '#ff6666';
      }
    };

    ui.appendChild(input);
    ui.appendChild(joinBtn);
    ui.appendChild(status);
    container.appendChild(ui);

    // 创建房间按钮事件（通过全局事件）
    globalEventBus.once('multiplayer:create', async () => {
      const statusEl = document.getElementById('mp-status');
      if (statusEl) {
        statusEl.textContent = '创建房间中...';
        statusEl.style.color = '#ffff88';
      }

      const roomId = await NetworkManager.getInstance().createRoom();
      if (roomId) {
        if (statusEl) {
          statusEl.textContent = `房间号: ${roomId}，等待玩家...`;
          statusEl.style.color = '#88ff88';
        }

        NetworkManager.getInstance().onPlayerJoin = () => {
          if (statusEl) statusEl.textContent = '玩家已加入，2秒后开始...';
          setTimeout(() => {
            NetworkManager.getInstance().startGame();
            this.startGame(); // 房主也直接开始
          }, 2000);
        };
      }
    });
  }

  private startGame(): void {
    const ui = document.getElementById('mp-ui');
    if (ui) ui.remove();

    setCurrentLevelIndex(0);
    resetRunScore();
    resetRunHp();
    resetPlayerColor();

    globalEventBus.emit('scene:netgame');
  }

  onExit(_world: IWorld): void {
    const ui = document.getElementById('mp-ui');
    if (ui) ui.remove();
  }
}
