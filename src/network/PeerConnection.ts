/**
 * PeerConnection - 极简 WebRTC P2P 封装
 * 使用手动复制粘贴 SDP 的方式做 signaling
 */

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export class PeerConnection {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private onMsgCb: ((data: string) => void) | null = null;
  private onOpenCb: (() => void) | null = null;
  private onCloseCb: (() => void) | null = null;

  /** 创建房间（发起方） */
  async createOffer(): Promise<string> {
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.setupPc();

    this.dc = this.pc.createDataChannel('game', {
      ordered: true,
    });
    this.setupDc();

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    await this.waitForIceComplete();
    const desc = this.pc.localDescription;
    if (!desc) throw new Error('Failed to create offer');
    return btoa(JSON.stringify(desc));
  }

  /** 加入房间（接收方）：接受 offer，生成 answer */
  async acceptOffer(offerBase64: string): Promise<string> {
    const offer: RTCSessionDescriptionInit = JSON.parse(atob(offerBase64));
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.setupPc();

    this.pc.ondatachannel = (event) => {
      this.dc = event.channel;
      this.setupDc();
    };

    await this.pc.setRemoteDescription(offer);
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);

    await this.waitForIceComplete();
    const desc = this.pc.localDescription;
    if (!desc) throw new Error('Failed to create answer');
    return btoa(JSON.stringify(desc));
  }

  /** 创建房间方：接受 answer，完成连接 */
  async acceptAnswer(answerBase64: string): Promise<void> {
    if (!this.pc) throw new Error('No peer connection');
    const answer: RTCSessionDescriptionInit = JSON.parse(atob(answerBase64));
    await this.pc.setRemoteDescription(answer);
  }

  send(data: string): void {
    if (this.dc && this.dc.readyState === 'open') {
      this.dc.send(data);
    }
  }

  onMessage(cb: (data: string) => void): void {
    this.onMsgCb = cb;
  }

  onOpen(cb: () => void): void {
    this.onOpenCb = cb;
  }

  onClose(cb: () => void): void {
    this.onCloseCb = cb;
  }

  close(): void {
    try {
      this.dc?.close();
      this.pc?.close();
    } catch {
      // ignore
    }
    this.dc = null;
    this.pc = null;
  }

  get isOpen(): boolean {
    return this.dc?.readyState === 'open';
  }

  private setupPc(): void {
    if (!this.pc) return;
    this.pc.oniceconnectionstatechange = () => {
      const state = this.pc?.iceConnectionState;
      if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        this.onCloseCb?.();
      }
    };
  }

  private setupDc(): void {
    if (!this.dc) return;
    this.dc.onopen = () => this.onOpenCb?.();
    this.dc.onclose = () => this.onCloseCb?.();
    this.dc.onmessage = (event) => this.onMsgCb?.(event.data);
  }

  private waitForIceComplete(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.pc) return resolve();
      const pc = this.pc;
      const check = () => {
        if (pc.iceGatheringState === 'complete') {
          resolve();
        } else {
          setTimeout(check, 50);
        }
      };
      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === 'complete') resolve();
      };
      setTimeout(check, 100);
      // fallback: 最多等 3 秒
      setTimeout(() => resolve(), 3000);
    });
  }
}
