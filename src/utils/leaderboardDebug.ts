/**
 * 排行榜调试工具
 * 在浏览器控制台使用这些函数来诊断问题
 */

import { LeaderboardService } from '../supabaseClient';

export async function debugLeaderboard(): Promise<void> {
  console.log('=== 排行榜诊断工具 ===\n');
  
  // 1. 检查环境变量
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  
  console.log('1. 环境变量检查:');
  console.log('   URL:', url ? (url.includes('your-project') ? '❌ 包含占位符' : '✅ 已设置') : '❌ 未设置');
  console.log('   Key:', key ? (key.includes('your-anon') ? '❌ 包含占位符' : '✅ 已设置') : '❌ 未设置');
  
  // 2. 测试服务
  console.log('\n2. 服务测试:');
  try {
    const service = LeaderboardService.getInstance();
    console.log('   服务实例: ✅ 创建成功');
    
    // 3. 获取数据
    console.log('\n3. 数据获取测试:');
    const entries = await service.getLeaderboard();
    console.log('   获取成功: ✅');
    console.log('   记录数:', entries.length);
    console.log('   前3条:', entries.slice(0, 3));
    
    // 4. 测试上传（使用测试数据）
    console.log('\n4. 上传测试:');
    console.log('   要测试上传，请运行:');
    console.log('   await testUpload("TEST", 100, "测试")');
    
  } catch (err) {
    console.error('   错误:', err);
  }
  
  console.log('\n=== 诊断完成 ===');
}

export async function testUpload(name: string, score: number, levelName: string): Promise<void> {
  console.log(`\n正在测试上传: ${name} - ${score}...`);
  try {
    const service = LeaderboardService.getInstance();
    const entries = await service.saveScore(name, score, levelName);
    console.log('✅ 上传成功！');
    console.log('最新排行榜:', entries.slice(0, 5));
  } catch (err) {
    console.error('❌ 上传失败:', err);
  }
}

// 挂载到全局，方便控制台调用
if (typeof window !== 'undefined') {
  (window as any).debugLeaderboard = debugLeaderboard;
  (window as any).testUpload = testUpload;
  console.log('[排行榜调试] 已加载，在控制台运行 debugLeaderboard() 开始诊断');
}
