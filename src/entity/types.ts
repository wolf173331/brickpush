import type { EntityId } from 'agent-gamedev';

export interface PlayerState {
  col: number;
  row: number;
  entity: EntityId;
  moving: boolean;
  cooldown: number;
  score: number;
  collectibles: number;
  hp: number;
  damageCooldown: number;
  isInvincible: boolean;
  pushDistance: number;
  canBreakWalls: boolean;
  inputLockTimer: number;
}

export interface EnemyState {
  col: number;
  row: number;
  entity: EntityId;
  type: number;
  active: boolean;
  moveCooldown: number;
  stunTimer: number;
  activateTimer: number;
  dying: boolean;
}

export interface NpcState {
  col: number;
  row: number;
  entity: EntityId;
  hp: number;
  cooldown: number;
  stunTimer: number;
  moving: boolean;
  damageCooldown: number;
  isInvincible: boolean;
}

export interface BombState {
  col: number;
  row: number;
  entity: EntityId;
  exploded: boolean;
}

export interface SpawnCandidate {
  col: number;
  row: number;
  bucket: number;
  nearbyObstacles: number;
}

export type GamePhase = 'ready' | 'playing' | 'complete';
export type VictoryType = 'hearts' | 'enemies' | 'none';
