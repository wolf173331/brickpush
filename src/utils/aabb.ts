/**
 * AABB (Axis-Aligned Bounding Box) collision utilities
 * 动作游戏风格的矩形碰撞检测
 */
import type { IWorld, EntityId } from 'agent-gamedev';
import { TransformComponent, TRANSFORM_COMPONENT } from 'agent-gamedev';

export interface AABBBounds {
  x: number;   // 左上角 x
  y: number;   // 左上角 y
  width: number;
  height: number;
}

/**
 * 根据 entity 的 TransformComponent 获取 AABB 包围盒
 * 以 transform.x/y 为中心点，计算左上角坐标
 */
export function getEntityBounds(
  world: IWorld,
  entity: EntityId,
  width: number,
  height: number
): AABBBounds | null {
  const transform = world.getComponent<TransformComponent>(entity, TRANSFORM_COMPONENT);
  if (!transform) return null;
  return {
    x: transform.x - width / 2,
    y: transform.y - height / 2,
    width,
    height,
  };
}

/**
 * 标准 AABB 碰撞检测
 */
export function checkAABBCollision(a: AABBBounds, b: AABBBounds): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

/**
 * 根据两个 entity 自动检测 AABB 碰撞
 */
export function checkEntityCollision(
  world: IWorld,
  e1: EntityId,
  e2: EntityId,
  size1: number,
  size2: number
): boolean {
  const b1 = getEntityBounds(world, e1, size1, size1);
  const b2 = getEntityBounds(world, e2, size2, size2);
  if (!b1 || !b2) return false;
  return checkAABBCollision(b1, b2);
}
