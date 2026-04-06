/**
 * Node.js 测试脚本
 * 运行: node test-node.mjs
 */

import { 
  gridToWorld, 
  gridKey, 
  inBounds,
  GRID_COLS, 
  GRID_ROWS,
  TILE_SIZE,
  CELL_EMPTY,
  CELL_WALL,
  PLAYER_PUSH_DISTANCE
} from './src/constants/index.ts';

console.log('🎮 BrickPush Node.js 测试\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`❌ ${name}: ${err.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(msg || `Expected ${expected}, got ${actual}`);
  }
}

function assertTrue(value, msg) {
  if (value !== true) {
    throw new Error(msg || `Expected true, got ${value}`);
  }
}

// 测试 1: gridToWorld
test('gridToWorld 坐标转换', () => {
  const pos = gridToWorld(0, 0);
  assertTrue(pos.x > 0 && pos.y > 0, '坐标为正数');
  
  const pos2 = gridToWorld(1, 0);
  const pos3 = gridToWorld(0, 1);
  assertTrue(pos2.x > pos.x, '向右移动x增加');
  assertTrue(pos3.y > pos.y, '向下移动y增加');
});

// 测试 2: gridKey
test('gridKey 生成唯一键', () => {
  assertEqual(gridKey(1, 2), '1,2', '键格式正确');
  assertEqual(gridKey(1, 2), gridKey(1, 2), '相同坐标相同键');
  assertTrue(gridKey(1, 2) !== gridKey(2, 1), '不同坐标不同键');
});

// 测试 3: inBounds
test('inBounds 边界检查', () => {
  assertTrue(inBounds(0, 0), '(0,0)在范围内');
  assertTrue(inBounds(GRID_COLS - 1, GRID_ROWS - 1), '右下角在范围内');
  assertTrue(!inBounds(-1, 0), '负数不在范围');
  assertTrue(!inBounds(GRID_COLS, 0), '超界不在范围');
});

// 测试 4: 常量
test('游戏常量定义正确', () => {
  assertTrue(GRID_COLS > 0, '列数大于0');
  assertTrue(GRID_ROWS > 0, '行数大于0');
  assertTrue(CELL_EMPTY !== CELL_WALL, '空地与墙不同');
  assertTrue(PLAYER_PUSH_DISTANCE >= 1, '推动距离至少为1');
  assertTrue(TILE_SIZE > 0, '格子大小大于0');
});

// 总结
console.log('\n' + '='.repeat(40));
console.log(`📊 测试结果: ${passed}/${passed + failed} 通过`);
if (failed === 0) {
  console.log('🎉 所有测试通过！');
} else {
  console.log(`⚠️  ${failed} 个测试失败`);
  process.exit(1);
}
console.log('='.repeat(40));
