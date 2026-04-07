/**
 * 确定性帧同步系统 (Lockstep)
 * 
 * 核心设计：
 * 1. 固定帧率 30fps（游戏逻辑）
 * 2. 输入延迟 3 帧（INPUT_DELAY）
 * 3. 只同步输入，不同步状态
 * 4. 双方帧号严格对齐
 * 5. 一方卡顿，双方等待
 * 
 * 录像格式：{ seed, frames: [{frame, inputs}] }
 */

export interface FrameInput {
  frame: number;
  p1: PlayerInput;
  p2: PlayerInput;
}

export interface PlayerInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  action?: boolean; // 用于推箱子确认
}

export interface ReplayData {
  seed: number;
  startTime: number;
  frames: FrameInput[];
}

export class LockstepSync {
  // 帧率设置
  static readonly FPS = 30;
  static readonly FRAME_TIME = 1000 / 30; // 33.33ms
  static readonly INPUT_DELAY = 3; // 输入延迟 3 帧
  
  // 当前帧号（严格对齐）
  private currentFrame = 0;
  
  // 输入缓冲区
  private inputBuffer: Map<number, FrameInput> = new Map();
  
  // 网络
  private peer: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private isHost = false;
  private connected = false;
  
  // 回调
  onFrame: ((frame: number, inputs: FrameInput) => void) | null = null;
  onConnected: (() => void) | null = null;
  onDisconnected: (() => void) | null = null;
  
  // 录像
  private recording = false;
  private replayData: ReplayData = { seed: 0, startTime: 0, frames: [] };
  
  // 本地输入（当前帧）
  private localInput: PlayerInput = { up: false, down: false, left: false, right: false };
  
  // 随机种子（确保双方一致）
  private randomSeed = 0;
  
  constructor(isHost: boolean, seed?: number) {
    this.isHost = isHost;
    this.randomSeed = seed ?? Math.floor(Math.random() * 100000);
    this.initWebRTC();
  }
  
  // ========================================================================
  // WebRTC 初始化
  // ========================================================================
  
  private async initWebRTC() {
    this.peer = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ]
    });
    
    if (this.isHost) {
      // 房主：创建 DataChannel
      this.dataChannel = this.peer.createDataChannel('game', {
        ordered: true,
        maxRetransmits: 10,
      });
      this.setupDataChannel();
    } else {
      // 客人：监听 DataChannel
      this.peer.ondatachannel = (e) => {
        this.dataChannel = e.channel;
        this.setupDataChannel();
      };
    }
    
    this.peer.onconnectionstatechange = () => {
      if (this.peer?.connectionState === 'connected') {
        this.connected = true;
        this.onConnected?.();
      } else if (this.peer?.connectionState === 'disconnected') {
        this.connected = false;
        this.onDisconnected?.();
      }
    };
  }
  
  private setupDataChannel() {
    if (!this.dataChannel) return;
    
    this.dataChannel.onopen = () => {
      console.log('[Lockstep] DataChannel 连接成功');
      this.connected = true;
      this.startGameLoop();
    };
    
    this.dataChannel.onmessage = (e) => {
      const data = JSON.parse(e.data);
      this.handleNetworkMessage(data);
    };
  }
  
  private handleNetworkMessage(data: any) {
    switch (data.type) {
      case 'input':
        // 收到对方输入
        this.receiveRemoteInput(data.frame, data.input);
        break;
      case 'start':
        // 开始游戏
        this.randomSeed = data.seed;
        break;
    }
  }
  
  // ========================================================================
  // 游戏循环（核心）
  // ========================================================================
  
  private lastFrameTime = 0;
  private accumulator = 0;
  
  private startGameLoop() {
    this.lastFrameTime = performance.now();
    this.recording = true;
    this.replayData = {
      seed: this.randomSeed,
      startTime: Date.now(),
      frames: []
    };
    requestAnimationFrame((t) => this.gameLoop(t));
  }
  
  private gameLoop(timestamp: number) {
    if (!this.connected) return;
    
    const dt = timestamp - this.lastFrameTime;
    this.lastFrameTime = timestamp;
    this.accumulator += dt;
    
    // 固定步长更新
    while (this.accumulator >= LockstepSync.FRAME_TIME) {
      this.accumulator -= LockstepSync.FRAME_TIME;
      this.stepFrame();
    }
    
    requestAnimationFrame((t) => this.gameLoop(t));
  }
  
  private stepFrame() {
    const frameToSimulate = this.currentFrame + LockstepSync.INPUT_DELAY;
    
    // 检查是否收到双方输入
    const localInputs = this.inputBuffer.get(frameToSimulate);
    const remoteInputs = this.inputBuffer.get(frameToSimulate);
    
    if (!localInputs || !this.hasRemoteInput(frameToSimulate)) {
      // 等待输入，暂停模拟
      console.log(`[Lockstep] 等待帧 ${frameToSimulate} 输入`);
      return;
    }
    
    // 构造完整输入
    const inputs: FrameInput = {
      frame: this.currentFrame,
      p1: this.isHost ? localInputs.p1 : remoteInputs!.p2,
      p2: this.isHost ? remoteInputs!.p2 : localInputs.p1,
    };
    
    // 执行游戏逻辑
    this.onFrame?.(this.currentFrame, inputs);
    
    // 记录录像
    if (this.recording) {
      this.replayData.frames.push({
        frame: this.currentFrame,
        p1: { ...inputs.p1 },
        p2: { ...inputs.p2 },
      });
    }
    
    // 清理旧输入
    this.inputBuffer.delete(this.currentFrame);
    
    this.currentFrame++;
  }
  
  private hasRemoteInput(frame: number): boolean {
    const data = this.inputBuffer.get(frame);
    return data ? (this.isHost ? !!data.p2 : !!data.p1) : false;
  }
  
  // ========================================================================
  // 输入处理
  // ========================================================================
  
  setLocalInput(input: PlayerInput) {
    this.localInput = input;
    
    // 发送给对端（提前发送未来的输入）
    for (let i = 0; i < LockstepSync.INPUT_DELAY + 2; i++) {
      const frame = this.currentFrame + LockstepSync.INPUT_DELAY + i;
      this.sendInput(frame, input);
    }
  }
  
  private sendInput(frame: number, input: PlayerInput) {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') return;
    
    this.dataChannel.send(JSON.stringify({
      type: 'input',
      frame,
      input,
    }));
  }
  
  private receiveRemoteInput(frame: number, input: PlayerInput) {
    const existing = this.inputBuffer.get(frame);
    if (existing) {
      if (this.isHost) {
        existing.p2 = input;
      } else {
        existing.p1 = input;
      }
    } else {
      this.inputBuffer.set(frame, {
        frame,
        p1: this.isHost ? this.localInput : input,
        p2: this.isHost ? input : this.localInput,
      });
    }
  }
  
  // ========================================================================
  // 录像功能
  // ========================================================================
  
  getReplayData(): ReplayData {
    return this.replayData;
  }
  
  downloadReplay(filename?: string) {
    const data = JSON.stringify(this.replayData, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename ?? `replay_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  
  // 加载录像并播放
  static loadReplay(replayData: ReplayData): LockstepSync {
    const sync = new LockstepSync(true, replayData.seed);
    sync.replayData = replayData;
    return sync;
  }
  
  // ========================================================================
  // 信令（用于建立 P2P 连接）
  // ========================================================================
  
  async createOffer(): Promise<RTCSessionDescriptionInit> {
    if (!this.peer) throw new Error('Peer not initialized');
    
    const offer = await this.peer.createOffer();
    await this.peer.setLocalDescription(offer);
    
    // 等待 ICE 收集完成
    await new Promise<void>((resolve) => {
      if (this.peer!.iceGatheringState === 'complete') {
        resolve();
        return;
      }
      const check = () => {
        if (this.peer!.iceGatheringState === 'complete') {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
    
    return this.peer.localDescription!;
  }
  
  async acceptOffer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    if (!this.peer) throw new Error('Peer not initialized');
    
    await this.peer.setRemoteDescription(offer);
    const answer = await this.peer.createAnswer();
    await this.peer.setLocalDescription(answer);
    
    return this.peer.localDescription!;
  }
  
  async acceptAnswer(answer: RTCSessionDescriptionInit) {
    if (!this.peer) throw new Error('Peer not initialized');
    await this.peer.setRemoteDescription(answer);
  }
  
  addIceCandidate(candidate: RTCIceCandidateInit) {
    if (!this.peer) return;
    this.peer.addIceCandidate(candidate);
  }
}
