import { Scene, EntityBuilder, UIEntityBuilder, globalTheme, globalEventBus } from 'agent-gamedev';
import type { IWorld, SceneTransitionData } from 'agent-gamedev';
import { GAME_WIDTH, GAME_HEIGHT, PALETTE } from '../constants';
import { PeerConnection } from '../network/PeerConnection';
import { LockstepEngine } from '../network/LockstepEngine';
import { multiplayerState } from '../network/MultiplayerState';
import type { NetMessage } from '../network/types';

const W = GAME_WIDTH;
const H = GAME_HEIGHT;

export class LobbyScene extends Scene {
  readonly name = 'LobbyScene';
  private overlayEl: HTMLDivElement | null = null;

  onEnter(world: IWorld, _data?: SceneTransitionData): void {
    globalTheme.setTheme('retro');
    multiplayerState.reset();

    this.trackEntity(EntityBuilder.create(world, W, H).withBackground({ color: PALETTE.MENU_BG }).build());

    this.trackEntity(UIEntityBuilder.create(world, W, H)
      .withUITransform({ anchor: 'center', y: -200, width: 600, height: 80 })
      .withText({ text: '联机游戏', fontSize: 48, color: PALETTE.TITLE_YELLOW, align: 'center' })
      .build());

    this.trackEntity(UIEntityBuilder.create(world, W, H)
      .withUITransform({ anchor: 'center', y: -130, width: 700, height: 40 })
      .withText({ text: 'WebRTC P2P - 复制粘贴信令文本即可联机', fontSize: 18, color: PALETTE.SUBTITLE_WHITE, align: 'center' })
      .build());

    this.trackEntity(UIEntityBuilder.create(world, W, H)
      .withUITransform({ anchor: 'center', y: -40, width: 260, height: 56 })
      .withButton({ label: '创建房间', onClick: 'lobby:create', borderRadius: 8 })
      .build());

    this.trackEntity(UIEntityBuilder.create(world, W, H)
      .withUITransform({ anchor: 'center', y: 40, width: 260, height: 56 })
      .withButton({ label: '加入房间', onClick: 'lobby:join', borderRadius: 8 })
      .build());

    this.trackEntity(UIEntityBuilder.create(world, W, H)
      .withUITransform({ anchor: 'center', y: 120, width: 260, height: 50 })
      .withButton({ label: '返回菜单', onClick: 'scene:menu', borderRadius: 8 })
      .build());

    const createHandler = () => this.showCreateRoomUI(world);
    const joinHandler = () => this.showJoinRoomUI(world);

    globalEventBus.on('lobby:create', createHandler);
    globalEventBus.on('lobby:join', joinHandler);
    this.touchHandlers.push({ evt: 'lobby:create', fn: createHandler });
    this.touchHandlers.push({ evt: 'lobby:join', fn: joinHandler });
  }

  private touchHandlers: Array<{ evt: string; fn: () => void }> = [];

  private showCreateRoomUI(world: IWorld): void {
    this.closeOverlay();
    const wrap = this.buildOverlay();

    const title = document.createElement('div');
    title.textContent = '创建房间';
    title.style.cssText = 'color:#ffe7a3;font-size:22px;font-weight:700;text-align:center;';

    const hint = document.createElement('div');
    hint.textContent = '请将以下 Offer 文本复制给好友，然后粘贴对方的 Answer';
    hint.style.cssText = 'color:#aaccee;font-size:14px;text-align:center;';

    const textarea = document.createElement('textarea');
    textarea.readOnly = true;
    textarea.placeholder = '正在生成 Offer...';
    textarea.style.cssText = 'width:100%;height:120px;background:#0f1120;color:#ddeeff;font-family:monospace;font-size:12px;padding:10px;border:1px solid #445566;border-radius:6px;resize:none;';

    const answerInput = document.createElement('textarea');
    answerInput.placeholder = '在此粘贴对方的 Answer';
    answerInput.style.cssText = 'width:100%;height:80px;background:#0f1120;color:#ddeeff;font-family:monospace;font-size:12px;padding:10px;border:1px solid #445566;border-radius:6px;resize:none;';

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:10px;justify-content:center;';

    const connectBtn = document.createElement('button');
    connectBtn.textContent = '连接';
    connectBtn.style.cssText = 'padding:8px 18px;border:none;border-radius:6px;background:#4488cc;color:#fff;font-weight:700;cursor:pointer;';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = '取消';
    cancelBtn.style.cssText = 'padding:8px 18px;border:1px solid #8086a2;border-radius:6px;background:#1f2337;color:#e9edf8;font-weight:700;cursor:pointer;';

    btnRow.appendChild(connectBtn);
    btnRow.appendChild(cancelBtn);

    const status = document.createElement('div');
    status.style.cssText = 'color:#88cc88;font-size:13px;text-align:center;min-height:18px;';

    wrap.appendChild(title);
    wrap.appendChild(hint);
    wrap.appendChild(textarea);
    wrap.appendChild(answerInput);
    wrap.appendChild(btnRow);
    wrap.appendChild(status);
    this.mountOverlay(wrap);

    const peer = new PeerConnection();
    multiplayerState.peer = peer;
    multiplayerState.localPlayerId = 0;

    peer.createOffer().then((offer) => {
      textarea.value = offer;
      status.textContent = 'Offer 已生成，等待对方 Answer...';
    }).catch((e) => {
      status.textContent = '生成失败: ' + String(e);
      status.style.color = '#ff7777';
    });

    connectBtn.onclick = () => {
      const answer = answerInput.value.trim();
      if (!answer) { status.textContent = '请先粘贴 Answer'; status.style.color = '#ff7777'; return; }
      peer.acceptAnswer(answer).then(() => {
        status.textContent = '正在建立连接...';
        status.style.color = '#88cc88';
      }).catch((e) => {
        status.textContent = '连接失败: ' + String(e);
        status.style.color = '#ff7777';
      });
    };

    cancelBtn.onclick = () => this.closeOverlay();

    peer.onOpen(() => this.onPeerConnected(world, peer));
    peer.onClose(() => {
      status.textContent = '连接已断开';
      status.style.color = '#ff7777';
      multiplayerState.cleanup();
    });
  }

  private showJoinRoomUI(world: IWorld): void {
    this.closeOverlay();
    const wrap = this.buildOverlay();

    const title = document.createElement('div');
    title.textContent = '加入房间';
    title.style.cssText = 'color:#ffe7a3;font-size:22px;font-weight:700;text-align:center;';

    const hint1 = document.createElement('div');
    hint1.textContent = '粘贴房主的 Offer，生成 Answer 后发回给房主';
    hint1.style.cssText = 'color:#aaccee;font-size:14px;text-align:center;';

    const offerInput = document.createElement('textarea');
    offerInput.placeholder = '在此粘贴房主的 Offer';
    offerInput.style.cssText = 'width:100%;height:80px;background:#0f1120;color:#ddeeff;font-family:monospace;font-size:12px;padding:10px;border:1px solid #445566;border-radius:6px;resize:none;';

    const genBtn = document.createElement('button');
    genBtn.textContent = '生成 Answer';
    genBtn.style.cssText = 'padding:8px 18px;border:none;border-radius:6px;background:#4488cc;color:#fff;font-weight:700;cursor:pointer;';

    const answerText = document.createElement('textarea');
    answerText.readOnly = true;
    answerText.placeholder = 'Answer 将显示在这里';
    answerText.style.cssText = 'width:100%;height:80px;background:#0f1120;color:#ddeeff;font-family:monospace;font-size:12px;padding:10px;border:1px solid #445566;border-radius:6px;resize:none;';

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:10px;justify-content:center;';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = '取消';
    cancelBtn.style.cssText = 'padding:8px 18px;border:1px solid #8086a2;border-radius:6px;background:#1f2337;color:#e9edf8;font-weight:700;cursor:pointer;';

    btnRow.appendChild(cancelBtn);

    const status = document.createElement('div');
    status.style.cssText = 'color:#88cc88;font-size:13px;text-align:center;min-height:18px;';

    wrap.appendChild(title);
    wrap.appendChild(hint1);
    wrap.appendChild(offerInput);
    wrap.appendChild(genBtn);
    wrap.appendChild(answerText);
    wrap.appendChild(btnRow);
    wrap.appendChild(status);
    this.mountOverlay(wrap);

    const peer = new PeerConnection();
    multiplayerState.peer = peer;
    multiplayerState.localPlayerId = 1;

    genBtn.onclick = () => {
      const offer = offerInput.value.trim();
      if (!offer) { status.textContent = '请先粘贴 Offer'; status.style.color = '#ff7777'; return; }
      peer.acceptOffer(offer).then((answer) => {
        answerText.value = answer;
        status.textContent = 'Answer 已生成，请复制给房主，等待连接...';
        status.style.color = '#88cc88';
      }).catch((e) => {
        status.textContent = '生成失败: ' + String(e);
        status.style.color = '#ff7777';
      });
    };

    cancelBtn.onclick = () => this.closeOverlay();

    peer.onOpen(() => this.onPeerConnected(world, peer));
    peer.onClose(() => {
      status.textContent = '连接已断开';
      status.style.color = '#ff7777';
      multiplayerState.cleanup();
    });
  }

  private onPeerConnected(_world: IWorld, peer: PeerConnection): void {
    multiplayerState.connected = true;
    multiplayerState.isMultiplayer = true;
    multiplayerState.gameSeed = Math.floor(Math.random() * 1000000);

    const lockstep = new LockstepEngine(multiplayerState.localPlayerId);
    multiplayerState.lockstep = lockstep;

    // 发送握手
    const handshake = JSON.stringify({ type: 'handshake', playerId: multiplayerState.localPlayerId, seed: multiplayerState.gameSeed });
    peer.send(handshake);

    peer.onMessage((raw) => {
      try {
        const msg = JSON.parse(raw) as NetMessage;
        if (msg.type === 'handshake') {
          // 双方种子异或合并，保证相同
          multiplayerState.gameSeed = multiplayerState.gameSeed ^ msg.seed;
        } else if (msg.type === 'input') {
          lockstep.receiveRemoteInput(msg.frame, msg.playerId, msg.actions);
        }
      } catch {
        // ignore invalid msg
      }
    });

    // 等待一小会儿让 handshake 完成，然后进入游戏
    setTimeout(() => {
      if (!this.isActive) return;
      lockstep.start();
      globalEventBus.emit('scene:game-multiplayer');
    }, 300);
  }

  private buildOverlay(): HTMLDivElement {
    const panel = document.createElement('div');
    panel.style.cssText = [
      'display:flex', 'flex-direction:column', 'gap:12px',
      'width:520px', 'max-width:calc(100% - 32px)',
      'padding:18px 20px', 'border:2px solid #e0b84f',
      'border-radius:14px', 'background:rgba(10, 10, 26, 0.96)',
      'box-shadow:0 12px 32px rgba(0,0,0,0.45)',
    ].join(';');
    return panel;
  }

  private mountOverlay(panel: HTMLDivElement): void {
    if (typeof document === 'undefined') return;
    const container = document.getElementById('game-container');
    if (!container) return;

    const overlay = document.createElement('div');
    overlay.style.cssText = [
      'position:absolute', 'inset:0', 'display:flex',
      'align-items:center', 'justify-content:center',
      'background:rgba(4, 4, 12, 0.72)', 'z-index:40',
      'pointer-events:auto',
    ].join(';');

    overlay.appendChild(panel);
    container.appendChild(overlay);
    this.overlayEl = overlay;
  }

  private closeOverlay(): void {
    if (this.overlayEl) {
      this.overlayEl.remove();
      this.overlayEl = null;
    }
  }

  onExit(_world: IWorld): void {
    this.closeOverlay();
    for (const h of this.touchHandlers) {
      globalEventBus.off(h.evt, h.fn);
    }
    this.touchHandlers = [];
  }
}
