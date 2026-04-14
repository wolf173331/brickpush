/**
 * Network types for P2P lockstep multiplayer
 */

export type PlayerAction =
  | { type: 'move'; dc: number; dr: number }
  | { type: 'none' };

export interface InputMsg {
  type: 'input';
  frame: number;
  playerId: 0 | 1;
  actions: PlayerAction[];
}

export interface PingMsg {
  type: 'ping';
  timestamp: number;
}

export interface HandshakeMsg {
  type: 'handshake';
  playerId: 0 | 1;
  seed: number;
}

export type NetMessage = InputMsg | PingMsg | HandshakeMsg;
