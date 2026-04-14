/**
 * GameContext - 游戏运行时共享状态，传递给各子系统
 * 避免子系统直接依赖 GameScene 类
 */
import type { EntityId } from 'agent-gamedev';
import type { PlayerState, EnemyState, NpcState, BombState } from '../entity/types';

export interface GameContext {
  // 网格
  grid: number[][];
  entityMap: Map<string, EntityId>;
  itemDecorationMap: Map<string, EntityId[]>;
  safeZones: Set<string>;
  outerGrassZones: Set<string>;

  // 实体
  player: PlayerState | null;
  npc: NpcState | null;
  enemies: EnemyState[];
  bombs: BombState[];

  // 场景尺寸
  W: number;
  H: number;

  // 实体追踪
  trackEntity: (eid: EntityId) => void;

  // 伤害回调（避免循环依赖）
  onPlayerDamaged: () => void;
  onEnemyCrushed: (enemy: EnemyState) => void;
}
