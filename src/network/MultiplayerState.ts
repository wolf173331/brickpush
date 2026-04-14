/**
 * MultiplayerState - 全局联机状态管理（单例）
 */

import { PeerConnection } from './PeerConnection';
import { LockstepEngine } from './LockstepEngine';

export interface MultiplayerStateType {
  isMultiplayer: boolean;
  localPlayerId: 0 | 1;
  peer: PeerConnection | null;
  lockstep: LockstepEngine | null;
  gameSeed: number;
  connected: boolean;
  cleanup: () => void;
  reset: () => void;
}

export const multiplayerState: MultiplayerStateType = {
  isMultiplayer: false,
  localPlayerId: 0,
  peer: null,
  lockstep: null,
  gameSeed: 0,
  connected: false,

  cleanup() {
    this.peer?.close();
    this.lockstep?.stop();
    this.peer = null;
    this.lockstep = null;
    this.connected = false;
    this.isMultiplayer = false;
  },

  reset() {
    this.cleanup();
    this.localPlayerId = 0;
    this.gameSeed = 0;
  },
};
