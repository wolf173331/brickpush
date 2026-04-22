import { Scene, EntityBuilder, UIEntityBuilder, globalTheme, globalEventBus } from 'agent-gamedev';
import type { IWorld, SceneTransitionData } from 'agent-gamedev';
import { GAME_WIDTH, GAME_HEIGHT, PALETTE } from '../constants';
import { PeerConnection } from '../network/PeerConnection';
import { LockstepEngine } from '../network/LockstepEngine';
import { multiplayerState } from '../network/MultiplayerState';
import type { NetMessage } from '../network/types';

const W = GAME_WIDTH;
const H = GAME_HEIGHT;

const LS_PREFIX = 'bp_sig_';

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function saveSignal(key: string, data: string): void {
  try { localStorage.setItem(LS_PREFIX + key, data); } catch { /* ignore */ }
}

function loadSignal(key: string): string | null {
  try { return localStorage.getItem(LS_PREFIX + key); } catch { return null; }
}

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
      .withText({ text: 'WebRTC P2P - 6位房间码即可联机', fontSize: 18, color: PALETTE.SUBTITLE_WHITE, align: 'center' })
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
  // 创建房间：6位房间码 + 完整文本备选
  // ------------------------------------------------------------------
  private showCreateRoomUI(world: IWorld): void {
    this.closeOverlay();
    const wrap = this.buildOverlay();

    const title = document.createElement('div');
    title.textContent = '创建房间';
    title.style.cssText = 'color:#ffe7a3;font-size:22px;font-weight:700;text-align:center;';

    const roomCodeDisplay = document.createElement('div');
    roomCodeDisplay.style.cssText = 'color:#00ffcc;font-size:36px;font-weight:700;text-align:center;font-family:monospace;letter-spacing:4px;';
    roomCodeDisplay.textContent = '------';

    const codeHint = document.createElement('div');
    codeHint.textContent = '把上面的 6 位房间码发给好友，对方输入即可加入';
    codeHint.style.cssText = 'color:#aaccee;font-size:13px;text-align:center;';

    const divider = document.createElement('div');
    divider.textContent = '──────── 跨设备请用完整文本 ────────';
    divider.style.cssText = 'color:#667788;font-size:12px;text-align:center;';

    const fullText = document.createElement('textarea');
    fullText.readOnly = true;
    fullText.placeholder = '正在生成...';
    fullText.style.cssText = 'width:100%;height:80px;background:#0f1120;color:#8899aa;font-family:monospace;font-size:11px;padding:8px;border:1px solid #445566;border-radius:6px;resize:none;';

    const copyBtn = document.createElement('button');
    copyBtn.textContent = '📋 复制完整文本';
    copyBtn.style.cssText = 'padding:6px 14px;border:none;border-radius:6px;background:#2266aa;color:#fff;font-size:13px;cursor:pointer;';

    const answerArea = document.createElement('textarea');
    answerArea.placeholder = '对方若用完整文本回复，请在此粘贴 Answer';
    answerArea.style.cssText = 'width:100%;height:60px;background:#0f1120;color:#ddeeff;font-family:monospace;font-size:12px;padding:10px;border:1px solid #445566;border-radius:6px;resize:none;';

    const connectBtn = document.createElement('button');
    connectBtn.textContent = '连接';
    connectBtn.style.cssText = 'padding:8px 18px;border:none;border-radius:6px;background:#4488cc;color:#fff;font-weight:700;cursor:pointer;';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = '取消';
    cancelBtn.style.cssText = 'padding:8px 18px;border:1px solid #8086a2;border-radius:6px;background:#1f2337;color:#e9edf8;font-weight:700;cursor:pointer;';

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:10px;justify-content:center;';
    btnRow.appendChild(connectBtn);
    btnRow.appendChild(cancelBtn);

    const status = document.createElement('div');
    status.style.cssText = 'color:#88cc88;font-size:13px;text-align:center;min-height:18px;';

    wrap.appendChild(title);
    wrap.appendChild(roomCodeDisplay);
    wrap.appendChild(codeHint);
    wrap.appendChild(divider);
    wrap.appendChild(fullText);
    wrap.appendChild(copyBtn);
    wrap.appendChild(answerArea);
    wrap.appendChild(btnRow);
    wrap.appendChild(status);
    this.mountOverlay(wrap);

    const peer = new PeerConnection();
    multiplayerState.peer = peer;
    multiplayerState.localPlayerId = 0;

    const roomCode = generateRoomCode();
    let answered = false;

    peer.createOffer().then((offer) => {
      roomCodeDisplay.textContent = roomCode;
      saveSignal(roomCode, offer);
      fullText.value = offer;
      status.textContent = '房间已创建，等待对方加入...';

      // 轮询检测对方是否通过房间码回复了 answer
      const poll = setInterval(() => {
        if (answered) { clearInterval(poll); return; }
        const ans = loadSignal(roomCode + '_ans');
        if (ans) {
          answered = true;
          clearInterval(poll);
          status.textContent = '检测到对方响应，正在连接...';
          peer.acceptAnswer(ans).catch((e) => {
            status.textContent = '连接失败: ' + String(e);
            status.style.color = '#ff7777';
          });
        }
      }, 400);
    }).catch((e) => {
      status.textContent = '生成失败: ' + String(e);
      status.style.color = '#ff7777';
    });

    copyBtn.onclick = () => {
      if (!fullText.value) return;
      navigator.clipboard.writeText(fullText.value).then(() => {
        copyBtn.textContent = '✅ 已复制';
        setTimeout(() => copyBtn.textContent = '📋 复制完整文本', 1500);
      }).catch(() => {
        fullText.select();
        document.execCommand('copy');
        copyBtn.textContent = '✅ 已复制';
        setTimeout(() => copyBtn.textContent = '📋 复制完整文本', 1500);
      });
    };

    connectBtn.onclick = () => {
      const ans = answerArea.value.trim();
      if (!ans) { status.textContent = '请先粘贴 Answer 或等待对方通过房间码加入'; status.style.color = '#ff7777'; return; }
      answered = true;
      peer.acceptAnswer(ans).then(() => {
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
  // 加入房间：输入6位房间码 或 粘贴完整文本
  // ------------------------------------------------------------------
  private showJoinRoomUI(world: IWorld): void {
    this.closeOverlay();
    const wrap = this.buildOverlay();

    const title = document.createElement('div');
    title.textContent = '加入房间';
    title.style.cssText = 'color:#ffe7a3;font-size:22px;font-weight:700;text-align:center;';

    const codeRow = document.createElement('div');
    codeRow.style.cssText = 'display:flex;gap:8px;justify-content:center;align-items:center;';

    const codeInput = document.createElement('input');
    codeInput.placeholder = '房间码';
    codeInput.maxLength = 6;
    codeInput.style.cssText = 'width:140px;height:40px;background:#0f1120;color:#00ffcc;font-family:monospace;font-size:22px;font-weight:700;text-align:center;padding:0 8px;border:2px solid #445566;border-radius:6px;letter-spacing:3px;text-transform:uppercase;';

    const joinByCodeBtn = document.createElement('button');
    joinByCodeBtn.textContent = '加入';
    joinByCodeBtn.style.cssText = 'padding:8px 18px;border:none;border-radius:6px;background:#4488cc;color:#fff;font-weight:700;cursor:pointer;';

    codeRow.appendChild(codeInput);
    codeRow.appendChild(joinByCodeBtn);

    const codeHint = document.createElement('div');
    codeHint.textContent = '输入房主给的 6 位房间码，自动加入';
    codeHint.style.cssText = 'color:#aaccee;font-size:13px;text-align:center;';

    const divider = document.createElement('div');
    divider.textContent = '──────── 或粘贴完整文本 ────────';
    divider.style.cssText = 'color:#667788;font-size:12px;text-align:center;';

    const offerInput = document.createElement('textarea');
    offerInput.placeholder = '在此粘贴房主的完整 Offer';
    offerInput.style.cssText = 'width:100%;height:70px;background:#0f1120;color:#ddeeff;font-family:monospace;font-size:12px;padding:10px;border:1px solid #445566;border-radius:6px;resize:none;';

    const genBtn = document.createElement('button');
    genBtn.textContent = '生成响应';
    genBtn.style.cssText = 'padding:8px 18px;border:none;border-radius:6px;background:#4488cc;color:#fff;font-weight:700;cursor:pointer;';

    const answerText = document.createElement('textarea');
    answerText.readOnly = true;
    answerText.placeholder = 'Answer 将显示在这里';
    answerText.style.cssText = 'width:100%;height:60px;background:#0f1120;color:#8899aa;font-family:monospace;font-size:11px;padding:8px;border:1px solid #445566;border-radius:6px;resize:none;';

    const copyAnswerBtn = document.createElement('button');
    copyAnswerBtn.textContent = '📋 复制 Answer';
    copyAnswerBtn.style.cssText = 'padding:6px 14px;border:none;border-radius:6px;background:#2266aa;color:#fff;font-size:13px;cursor:pointer;display:none;';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = '取消';
    cancelBtn.style.cssText = 'padding:8px 18px;border:1px solid #8086a2;border-radius:6px;background:#1f2337;color:#e9edf8;font-weight:700;cursor:pointer;';

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:10px;justify-content:center;';
    btnRow.appendChild(cancelBtn);

    const status = document.createElement('div');
    status.style.cssText = 'color:#88cc88;font-size:13px;text-align:center;min-height:18px;';

    wrap.appendChild(title);
    wrap.appendChild(codeRow);
    wrap.appendChild(codeHint);
    wrap.appendChild(divider);
    wrap.appendChild(offerInput);
    wrap.appendChild(genBtn);
    wrap.appendChild(answerText);
    wrap.appendChild(copyAnswerBtn);
    wrap.appendChild(btnRow);
    wrap.appendChild(status);
    this.mountOverlay(wrap);

    const peer = new PeerConnection();
    multiplayerState.peer = peer;
    multiplayerState.localPlayerId = 1;

    // 房间码加入
    joinByCodeBtn.onclick = () => {
      const code = codeInput.value.trim().toUpperCase();
      if (code.length !== 6) { status.textContent = '请输入 6 位房间码'; status.style.color = '#ff7777'; return; }
      const offer = loadSignal(code);
      if (!offer) { status.textContent = '未找到该房间码，请确认房主已创建'; status.style.color = '#ff7777'; return; }

      status.textContent = '正在加入...';
      peer.acceptOffer(offer).then((answer) => {
        saveSignal(code + '_ans', answer);
        answerText.value = answer;
        copyAnswerBtn.style.display = 'inline-block';
        status.textContent = '已加入！若房主用房间码，对方会自动连接。跨设备请把下方 Answer 复制给房主。';
        status.style.color = '#88cc88';
      }).catch((e) => {
        status.textContent = '加入失败: ' + String(e);
        status.style.color = '#ff7777';
      });
    };

    // 完整文本模式
    genBtn.onclick = () => {
      const offer = offerInput.value.trim();
      if (!offer) { status.textContent = '请先粘贴 Offer'; status.style.color = '#ff7777'; return; }
      peer.acceptOffer(offer).then((answer) => {
        answerText.value = answer;
        copyAnswerBtn.style.display = 'inline-block';
        status.textContent = 'Answer 已生成，请复制给房主';
        status.style.color = '#88cc88';
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

    let bc: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      bc = new BroadcastChannel('brickpush-p2p-test');
    }

    peer.createOffer().then((offer) => {
      if (role || connected) return;
      role = 'host';
      multiplayerState.localPlayerId = 0;
      status.textContent = '已创建房间，等待另一标签页加入...';
      bc?.postMessage({ type: 'offer', offer, ts: Date.now() });
    }).catch(() => { /* ignore */ });

    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'offer' && !role && !connected) {
        role = 'joiner';
        multiplayerState.localPlayerId = 1;
        status.textContent = '收到房间邀请，正在加入...';
        peer.acceptOffer(data.offer).then((answer) => {
          bc?.postMessage({ type: 'answer', answer, ts: Date.now() });
          status.textContent = '已发送响应，等待连接...';
        }).catch((e) => {
          status.textContent = '加入失败: ' + String(e);
          status.style.color = '#ff7777';
        });
      }

      if (data.type === 'answer' && role === 'host' && !connected) {
        status.textContent = '收到响应，正在建立连接...';
        peer.acceptAnswer(data.answer).catch((e) => {
          status.textContent = '连接失败: ' + String(e);
          status.style.color = '#ff7777';
        });
      }
    };

    bc?.addEventListener('message', handleMessage);

    peer.onOpen(() => {
      if (connected) return;
      connected = true;
      bc?.close();
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

    const handshake = JSON.stringify({ type: 'handshake', playerId: multiplayerState.localPlayerId, seed: multiplayerState.gameSeed });
    peer.send(handshake);

    peer.onMessage((raw) => {
      try {
        const msg = JSON.parse(raw) as NetMessage;
        if (msg.type === 'handshake') {
          multiplayerState.gameSeed = multiplayerState.gameSeed ^ msg.seed;
        } else if (msg.type === 'input') {
          lockstep.receiveRemoteInput(msg.frame, msg.playerId, msg.actions);
        }
      } catch {
        // ignore
      }
    });

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
