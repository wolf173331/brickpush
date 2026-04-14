/**
 * LockstepEngine - 帧同步核心引擎
 */

import type { PlayerAction } from './types';

export interface FrameInputs {
  frame: number;
  inputs: Map<0 | 1, PlayerAction[]>;
}

export class LockstepEngine {
  private currentFrame = -1;
  private readonly inputBuffer = new Map<number, Map<0 | 1, PlayerAction[]>>();
  private readonly localPlayerId: 0 | 1;
  private readonly inputDelay: number;
  private started = false;

  constructor(localPlayerId: 0 | 1, inputDelay = 2) {
    this.localPlayerId = localPlayerId;
    this.inputDelay = inputDelay;
  }

  start(initialFrame = 0): void {
    this.currentFrame = initialFrame - 1;
    this.inputBuffer.clear();
    this.started = true;
  }

  stop(): void {
    this.started = false;
  }

  get frame(): number {
    return this.currentFrame;
  }

  /** 记录本地输入，自动加上 inputDelay */
  recordLocalInput(actions: PlayerAction[]): { frame: number; actions: PlayerAction[] } {
    const targetFrame = this.currentFrame + 1 + this.inputDelay;
    this.setInput(targetFrame, this.localPlayerId, actions);
    return { frame: targetFrame, actions };
  }

  /** 收到远程输入 */
  receiveRemoteInput(frame: number, playerId: 0 | 1, actions: PlayerAction[]): void {
    this.setInput(frame, playerId, actions);
  }

  /** 检查下一帧是否可以推进（两边输入都已到） */
  canAdvance(): boolean {
    if (!this.started) return false;
    const nextFrame = this.currentFrame + 1;
    const frameInputs = this.inputBuffer.get(nextFrame);
    if (!frameInputs) return false;
    return frameInputs.has(0) && frameInputs.has(1);
  }

  /** 推进一帧，返回该帧的所有玩家输入 */
  advance(): FrameInputs | null {
    if (!this.canAdvance()) return null;
    this.currentFrame++;
    const frameInputs = this.inputBuffer.get(this.currentFrame)!;
    const result: FrameInputs = {
      frame: this.currentFrame,
      inputs: new Map(frameInputs),
    };
    // 清理已执行的帧以释放内存
    this.inputBuffer.delete(this.currentFrame);
    return result;
  }

  /** 预填充前几帧的空输入，用于游戏开始前的缓冲 */
  prefetchEmptyFrames(count: number): void {
    for (let i = 0; i < count; i++) {
      const f = this.currentFrame + 1 + i;
      if (!this.inputBuffer.has(f)) {
        this.inputBuffer.set(f, new Map());
      }
      this.inputBuffer.get(f)!.set(this.localPlayerId, [{ type: 'none' }]);
    }
  }

  private setInput(frame: number, playerId: 0 | 1, actions: PlayerAction[]): void {
    if (!this.inputBuffer.has(frame)) {
      this.inputBuffer.set(frame, new Map());
    }
    this.inputBuffer.get(frame)!.set(playerId, actions);
  }
}
