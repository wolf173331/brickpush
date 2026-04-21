/**
 * BrickPush 游戏测试套件
 * 
 * 运行方式：
 * 浏览器控制台: await runAllTests()
 */

// ==================== 测试框架 ====================

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

class TestRunner {
  private results: TestResult[] = [];
  private currentSuite = '';

  suite(name: string): void {
    this.currentSuite = name;
    console.log(`\n📦 ${name}`);
  }

  async test(name: string, fn: () => void | Promise<void>): Promise<void> {
    const fullName = this.currentSuite ? `${this.currentSuite} > ${name}` : name;
    const start = performance.now();
    
    try {
      await fn();
      const duration = performance.now() - start;
      this.results.push({ name: fullName, passed: true, duration });
      console.log(`  ✅ ${name} (${duration.toFixed(1)}ms)`);
    } catch (err) {
      const duration = performance.now() - start;
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.results.push({ name: fullName, passed: false, error: errorMsg, duration });
      console.log(`  ❌ ${name}: ${errorMsg}`);
    }
  }

  assertEqual(actual: unknown, expected: unknown, message?: string): void {
    if (actual !== expected) {
      throw new Error(message || `Expected ${expected}, got ${actual}`);
    }
  }

  assertTrue(value: unknown, message?: string): void {
    if (value !== true) {
      throw new Error(message || `Expected true, got ${value}`);
    }
  }

  assertFalse(value: unknown, message?: string): void {
    if (value !== false) {
      throw new Error(message || `Expected false, got ${value}`);
    }
  }

  assertNotNull(value: unknown, message?: string): void {
    if (value === null || value === undefined) {
      throw new Error(message || `Expected non-null value`);
    }
  }

  printSummary(): void {
    const total = this.results.length;
    const passed = this.results.filter(r => r.passed).length;
    const failed = total - passed;
    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);

    console.log('\n' + '='.repeat(50));
    console.log(`📊 测试结果: ${passed}/${total} 通过`);
    console.log(`⏱️  总耗时: ${totalDuration.toFixed(1)}ms`);
    
    if (failed > 0) {
      console.log('\n❌ 失败的测试:');
      this.results.filter(r => !r.passed).forEach(r => {
        console.log(`   - ${r.name}: ${r.error}`);
      });
    } else {
      console.log('\n🎉 所有测试通过！');
    }
    console.log('='.repeat(50));
  }
}

// ==================== 测试函数 ====================

async function runTests(): Promise<void> {
  const runner = new TestRunner();
  
  // 基础功能测试
  runner.suite('基础功能');
  
  await runner.test('gridToWorld 坐标转换', async () => {
    const { gridToWorld } = await import('../constants');
    const pos = gridToWorld(0, 0);
    runner.assertTrue(pos.x > 0 && pos.y > 0, '坐标为正数');
  });
  
  await runner.test('gridKey 生成唯一键', async () => {
    const { gridKey } = await import('../constants');
    runner.assertEqual(gridKey(1, 2), '1,2', '键格式正确');
    runner.assertEqual(gridKey(1, 2), gridKey(1, 2), '相同坐标相同键');
  });
  
  await runner.test('inBounds 边界检查', async () => {
    const { inBounds, GRID_COLS } = await import('../constants');
    runner.assertTrue(inBounds(0, 0), '(0,0)在范围内');
    runner.assertFalse(inBounds(-1, 0), '负数不在范围');
    runner.assertFalse(inBounds(GRID_COLS, 0), '超界不在范围');
  });
  
  await runner.test('sanitizeLeaderboardName 清理名字', async () => {
    const { sanitizeLeaderboardName } = await import('../gameProgress');
    runner.assertEqual(sanitizeLeaderboardName('abc'), 'ABC', '转大写');
    runner.assertEqual(sanitizeLeaderboardName('A1B2'), 'AB', '去数字');
    runner.assertEqual(sanitizeLeaderboardName('A B'), 'AB', '去空格');
  });

  // 本地排行榜测试
  runner.suite('本地排行榜');
  
  await runner.test('localSave 和 localLoad', async () => {
    const { localSave } = await import('../supabaseClient');
    // 先清理
    localStorage.removeItem('brickpush:leaderboard');
    
    const entries = localSave('TEST', 1000, 'ROUND-1');
    runner.assertEqual(entries.length, 1, '保存一条');
    runner.assertEqual(entries[0].name, 'TEST', '名字正确');
    runner.assertEqual(entries[0].score, 1000, '分数正确');
  });
  
  await runner.test('mergeEntries 合并排序', async () => {
    const { mergeEntries } = await import('../supabaseClient');
    const entries = [
      { name: 'A', score: 100, levelName: 'L1', timestamp: 1 },
      { name: 'B', score: 200, levelName: 'L1', timestamp: 2 },
    ];
    const merged = mergeEntries([...entries, { name: 'B', score: 300, levelName: 'L2', timestamp: 3 }]);
    runner.assertEqual(merged[0].score, 300, '最高分排第一');
    runner.assertEqual(merged.length, 2, '去重后2条');
  });

  // Supabase 测试
  runner.suite('Supabase 排行榜');
  
  await runner.test('配置检查', async () => {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    console.log('   URL:', url?.slice(0, 20) + '...' || '未设置');
    console.log('   Key:', key ? '已设置' : '未设置');
    runner.assertTrue(!!url && !url.includes('your-project'), 'URL已配置');
  });
  
  await runner.test('LeaderboardService 实例', async () => {
    const { LeaderboardService } = await import('../supabaseClient');
    const svc = LeaderboardService.getInstance();
    runner.assertNotNull(svc, '服务实例存在');
  });
  
  await runner.test('获取排行榜', async () => {
    const { LeaderboardService } = await import('../supabaseClient');
    const svc = LeaderboardService.getInstance();
    const entries = await svc.getLeaderboard();
    runner.assertTrue(Array.isArray(entries), '返回数组');
    console.log(`   获取到 ${entries.length} 条记录`);
  });

  runner.printSummary();
  return;
}

// 导出和挂载
export const runAllTests = runTests;

if (typeof window !== 'undefined') {
  (window as any).runAllTests = runTests;
  console.log('[测试] 已加载，运行 runAllTests() 开始测试');
}
