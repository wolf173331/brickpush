import { Scene, EntityBuilder, UIEntityBuilder, globalTheme, globalEventBus } from 'agent-gamedev';
import type { IWorld, SceneTransitionData } from 'agent-gamedev';
import { GAME_WIDTH, GAME_HEIGHT, PALETTE } from '../constants';
import { PeerConnection } from '../network/PeerConnection';
import { LockstepEngine } from '../network/LockstepEngine';
import { multiplayerState } from '../network/MultiplayerState';
import type { NetMessage } from '../network/types';

const W = GAME_WIDTH;
const H = GAME_HEIGHT;

const LS_OFFER = 'bp_local_offer';
const LS_ANSWER = 'bp_local_answer';

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
      .withUITransform({ anchor: 'center', y: -50, width: 260, height: 56 })
      .withButton({ label: '创建房间', onClick: 'lobby:create', borderRadius: 8 })
      .build());

    this.trackEntity(UIEntityBuilder.create(world, W, H)
      .withUITransform({ anchor: 'center', y: 20, width: 260, height: 56 })
      .withButton({ label: '加入房间', onClick: 'lobby:join', borderRadius: 8 })
      .build());

    this.trackEntity(UIEntityBuilder.create(world, W, H)
      .withUITransform({ anchor: 'center', y: 90, width: 300, height: 50 })
      .withButton({ label: '🖥️ 本机一键测试', onClick: 'lobby:local', borderRadius: 8 })
      .build());

    this.trackEntity(UIEntityBuilder.create(world, W, H)
      .withUITransform({ anchor: 'center', y: 160, width: 260, height: 50 })
      .withButton({ label: '返回菜单', onClick: 'scene:menu', borderRadius: 8 })
      .build());

    const createHandler = () => this.showCreateRoomUI(world);
    const joinHandler = () => this.showJoinRoomUI(world);
    const localHandler = () => this.showLocalTestUI(world);

    globalEventBus.on('lobby:create', createHandler);
    globalEventBus.on('lobby:join', joinHandler);
    globalEventBus.on('lobby:local', localHandler);
    this.touchHandlers.push({ evt: 'lobby:create', fn: createHandler });
    this.touchHandlers.push({ evt: 'lobby:join', fn: joinHandler });
    this.touchHandlers.push({ evt: 'lobby:local', fn: localHandler });
  }

  private touchHandlers: Array<{ evt: string; fn: () => void }> = [];

  // ------------------------------------------------------------------
  // 创建房间（手动模式）
  // ------------------------------------------------------------------
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
    textarea.style.cssText = 'width:100%;height:100px;background:#0f1120;color:#ddeeff;font-family:monospace;font-size:12px;padding:10px;border:1px solid #445566;border-radius:6px;resize:none;';

    const copyBtn = document.createElement('button');
    copyBtn.textContent = '📋 复制 Offer';
    copyBtn.style.cssText = 'padding:6px 14px;border:none;border-radius:6px;background:#2266aa;color:#fff;font-size:13px;cursor:pointer;';

    const answerInput = document.createElement('textarea');
    answerInput.placeholder = '在此粘贴对方的 Answer';
    answerInput.style.cssText = 'width:100%;height:70px;background:#0f1120;color:#ddeeff;font-family:monospace;font-size:12px;padding:10px;border:1px solid #445566;border-radius:6px;resize:none;';

    const pasteBtn = document.createElement('button');
    pasteBtn.textContent = '📋 从剪贴板粘贴 Answer';
    pasteBtn.style.cssText = 'padding:6px 14px;border:none;border-radius:6px;background:#2266aa;color:#fff;font-size:13px;cursor:pointer;';

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
    wrap.appendChild(copyBtn);
    wrap.appendChild(answerInput);
    wrap.appendChild(pasteBtn);
    wrap.appendChild(btnRow);
    wrap.appendChild(status);
    this.mountOverlay(wrap);

    const peer = new PeerConnection();
    multiplayerState.peer = peer;
    multiplayerState.localPlayerId = 0;

    peer.createOffer().then((offer) => {
      textarea.value = offer;
      status.textContent = 'Offer 已生成，等待对方 Answer...';
      // 同时存入 localStorage，方便同机测试
      try { localStorage.setItem(LS_OFFER, offer); } catch { /* ignore */ }
    }).catch((e) => {
      status.textContent = '生成失败: ' + String(e);
      status.style.color = '#ff7777';
    });

    copyBtn.onclick = () => {
      if (!textarea.value) return;
      navigator.clipboard.writeText(textarea.value).then(() => {
        copyBtn.textContent = '✅ 已复制';
        setTimeout(() => copyBtn.textContent = '📋 复制 Offer', 1500);
      }).catch(() => {
        textarea.select();
        document.execCommand('copy');
        copyBtn.textContent = '✅ 已复制';
        setTimeout(() => copyBtn.textContent = '📋 复制 Offer', 1500);
      });
    };

    pasteBtn.onclick = async () => {
      try {
        const text = await navigator.clipboard.readText();
        answerInput.value = text.trim();
        pasteBtn.textContent = '✅ 已粘贴';
        setTimeout(() => pasteBtn.textContent = '📋 从剪贴板粘贴 Answer', 1500);
      } catch {
        status.textContent = '无法读取剪贴板，请手动粘贴';
        status.style.color = '#ffaa44';
      }
    };

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

  // ------------------------------------------------------------------
  // 加入房间（手动模式）
  // ------------------------------------------------------------------
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
    offerInput.style.cssText = 'width:100%;height:70px;background:#0f1120;color:#ddeeff;font-family:monospace;font-size:12px;padding:10px;border:1px solid #445566;border-radius:6px;resize:none;';

    const pasteOfferBtn = document.createElement('button');
    pasteOfferBtn.textContent = '📋 从剪贴板粘贴 Offer';
    pasteOfferBtn.style.cssText = 'padding:6px 14px;border:none;border-radius:6px;background:#2266aa;color:#fff;font-size:13px;cursor:pointer;';

    const genBtn = document.createElement('button');
    genBtn.textContent = '生成 Answer';
    genBtn.style.cssText = 'padding:8px 18px;border:none;border-radius:6px;background:#4488cc;color:#fff;font-weight:700;cursor:pointer;';

    const answerText = document.createElement('textarea');
    answerText.readOnly = true;
    answerText.placeholder = 'Answer 将显示在这里';
    answerText.style.cssText = 'width:100%;height:70px;background:#0f1120;color:#ddeeff;font-family:monospace;font-size:12px;padding:10px;border:1px solid #445566;border-radius:6px;resize:none;';

    const copyAnswerBtn = document.createElement('button');
    copyAnswerBtn.textContent = '📋 复制 Answer';
    copyAnswerBtn.style.cssText = 'padding:6px 14px;border:none;border-radius:6px;background:#2266aa;color:#fff;font-size:13px;cursor:pointer;display:none;';

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
    wrap.appendChild(pasteOfferBtn);
    wrap.appendChild(genBtn);
    wrap.appendChild(answerText);
    wrap.appendChild(copyAnswerBtn);
    wrap.appendChild(btnRow);
    wrap.appendChild(status);
    this.mountOverlay(wrap);

    // 尝试自动填充 localStorage 中的 offer
    try {
      const savedOffer = localStorage.getItem(LS_OFFER);
      if (savedOffer) {
        offerInput.value = savedOffer;
        status.textContent = '已自动填入本机 Offer';
      }
    } catch { /* ignore */ }

    const peer = new PeerConnection();
    multiplayerState.peer = peer;
    multiplayerState.localPlayerId = 1;

    pasteOfferBtn.onclick = async () => {
      try {
        const text = await navigator.clipboard.readText();
        offerInput.value = text.trim();
        pasteOfferBtn.textContent = '✅ 已粘贴';
        setTimeout(() => pasteOfferBtn.textContent = '📋 从剪贴板粘贴 Offer', 1500);
      } catch {
        status.textContent = '无法读取剪贴板，请手动粘贴';
        status.style.color = '#ffaa44';
      }
    };

    genBtn.onclick = () => {
      const offer = offerInput.value.trim();
      if (!offer) { status.textContent = '请先粘贴 Offer'; status.style.color = '#ff7777'; return; }
      peer.acceptOffer(offer).then((answer) => {
        answerText.value = answer;
        copyAnswerBtn.style.display = 'inline-block';
        status.textContent = 'Answer 已生成，请复制给房主，等待连接...';
        status.style.color = '#88cc88';
        // 存入 localStorage，方便同机测试
        try { localStorage.setItem(LS_ANSWER, answer); } catch { /* ignore */ }
      }).catch((e) => {
        status.textContent = '生成失败: ' + String(e);
        status.style.color = '#ff7777';
      });
    };

    copyAnswerBtn.onclick = () => {
      if (!answerText.value) return;
      navigator.clipboard.writeText(answerText.value).then(() => {
        copyAnswerBtn.textContent = '✅ 已复制';
        setTimeout(() => copyAnswerBtn.textContent = '📋 复制 Answer', 1500);
      }).catch(() => {
        answerText.select();
        document.execCommand('copy');
        copyAnswerBtn.textContent = '✅ 已复制';
        setTimeout(() => copyAnswerBtn.textContent = '📋 复制 Answer', 1500);
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

  // ------------------------------------------------------------------
  // 本机一键测试（BroadcastChannel 自动信令交换）
  // ------------------------------------------------------------------
  private showLocalTestUI(world: IWorld): void {
    this.closeOverlay();
    const wrap = this.buildOverlay();

    const title = document.createElement('div');
    title.textContent = '🖥️ 本机快速测试';
    title.style.cssText = 'color:#ffe7a3;font-size:22px;font-weight:700;text-align:center;';

    const hint = document.createElement('div');
    hint.textContent = '请在另一个浏览器标签页中也点击"本机一键测试"，系统将自动完成配对';
    hint.style.cssText = 'color:#aaccee;font-size:14px;text-align:center;';

    const status = document.createElement('div');
    status.textContent = '正在寻找另一标签页...';
    status.style.cssText = 'color:#88cc88;font-size:14px;text-align:center;min-height:20px;';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = '取消';
    cancelBtn.style.cssText = 'padding:8px 18px;border:1px solid #8086a2;border-radius:6px;background:#1f2337;color:#e9edf8;font-weight:700;cursor:pointer;';

    wrap.appendChild(title);
    wrap.appendChild(hint);
    wrap.appendChild(status);
    wrap.appendChild(cancelBtn);
    this.mountOverlay(wrap);

    const peer = new PeerConnection();
    multiplayerState.peer = peer;

    let role: 'host' | 'joiner' | null = null;
    let connected = false;

    // BroadcastChannel 用于同浏览器标签页通信
    let bc: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      bc = new BroadcastChannel('brickpush-p2p-test');
    }

    // 先尝试作为房主创建 offer
    peer.createOffer().then((offer) => {
      if (role || connected) return;
      role = 'host';
      multiplayerState.localPlayerId = 0;
      status.textContent = '已创建房间，等待另一标签页加入...';
      bc?.postMessage({ type: 'offer', offer, ts: Date.now() });
      // 同时存入 localStorage 作为 fallback
      try { localStorage.setItem(LS_OFFER, offer); } catch { /* ignore */ }
    }).catch(() => {
      // ignore
    });

    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'offer' && !role && !connected) {
        // 收到 offer，成为加入方
        role = 'joiner';
        multiplayerState.localPlayerId = 1;
        status.textContent = '收到房间邀请，正在加入...';
        peer.acceptOffer(data.offer).then((answer) => {
          bc?.postMessage({ type: 'answer', answer, ts: Date.now() });
          try { localStorage.setItem(LS_ANSWER, answer); } catch { /* ignore */ }
          status.textContent = '已发送响应，等待连接...';
        }).catch((e) => {
          status.textContent = '加入失败: ' + String(e);
          status.style.color = '#ff7777';
        });
      }

      if (data.type === 'answer' && role === 'host' && !connected) {
        // 收到 answer，完成连接
        status.textContent = '收到响应，正在建立连接...';
        peer.acceptAnswer(data.answer).catch((e) => {
          status.textContent = '连接失败: ' + String(e);
          status.style.color = '#ff7777';
        });
      }
    };

    bc?.addEventListener('message', handleMessage);

    // fallback：localStorage 轮询（兼容不支持 BroadcastChannel 的浏览器）
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    if (!bc) {
      pollInterval = setInterval(() => {
        if (role || connected) return;
        try {
          const savedOffer = localStorage.getItem(LS_OFFER);
          const savedAnswer = localStorage.getItem(LS_ANSWER);
          if (savedOffer && !savedAnswer) {
            // 只有 offer 没有 answer，尝试作为加入方
            role = 'joiner';
            multiplayerState.localPlayerId = 1;
            peer.acceptOffer(savedOffer).then((answer) => {
              localStorage.setItem(LS_ANSWER, answer);
              status.textContent = '已发送响应，等待连接...';
            }).catch(() => { role = null; });
          }
        } catch { /* ignore */ }
      }, 500);
    }

    peer.onOpen(() => {
      if (connected) return;
      connected = true;
      bc?.close();
      if (pollInterval) clearInterval(pollInterval);
      this.onPeerConnected(world, peer);
    });

    peer.onClose(() => {
      if (!connected) {
        status.textContent = '连接已断开';
        status.style.color = '#ff7777';
      }
      multiplayerState.cleanup();
    });

    cancelBtn.onclick = () => {
      bc?.close();
      if (pollInterval) clearInterval(pollInterval);
      this.closeOverlay();
      multiplayerState.cleanup();
    };
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
