// Supabase V2 使用示例
// 测试Supabase连接和基本功能

import { createClient } from '@supabase/supabase-js'

// 你的Supabase项目配置
const supabaseUrl = 'https://your-project-id.supabase.co'
const supabaseAnonKey = 'your-anon-key'

// 创建Supabase客户端 (V2方式)
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
})

// 测试Supabase连接和功能
async function testSupabase() {
  try {
    console.log('🔧 测试Supabase V2连接...')
    
    // 1. 测试基础连接
    const { data: healthData, error: healthError } = await supabase.from('_health').select('*').limit(1)
    if (healthError && healthError.code !== 'PGRST116') {
      console.log('⚠️ 基础连接测试失败:', healthError.message)
    } else {
      console.log('✅ 基础连接成功')
    }
    
    // 2. 测试认证功能
    const { data: authData, error: authError } = await supabase.auth.getSession()
    if (authError) {
      console.log('⚠️ 认证测试失败:', authError.message)
    } else {
      console.log('✅ 认证功能正常')
    }
    
    // 3. 测试数据库操作（假设有leaderboard表）
    try {
      const { data, error } = await supabase
        .from('leaderboard')
        .select('*')
        .limit(5)
        .order('score', { ascending: false })
      
      if (error) {
        if (error.code === 'PGRST116' || error.message.includes('does not exist')) {
          console.log('📋 表不存在，需要创建leaderboard表')
          console.log('💡 建议SQL:')
          console.log(`
CREATE TABLE leaderboard (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  player_name TEXT NOT NULL,
  score INTEGER NOT NULL,
  level_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引
CREATE INDEX idx_leaderboard_score ON leaderboard(score DESC);
CREATE INDEX idx_leaderboard_created_at ON leaderboard(created_at DESC);
          `)
        } else {
          console.log('⚠️ 数据库查询失败:', error.message)
        }
      } else {
        console.log('✅ 数据库查询成功，找到', data.length, '条记录')
      }
    } catch (dbError) {
      console.log('⚠️ 数据库测试异常:', dbError)
    }
    
    // 4. 测试实时订阅
    console.log('🔄 测试实时订阅...')
    const channel = supabase.channel('test-channel')
      .on('broadcast', { event: 'test' }, (payload) => {
        console.log('📡 收到实时消息:', payload)
      })
      .subscribe((status) => {
        console.log('📡 实时订阅状态:', status)
      })
    
    // 5. 发送测试消息
    setTimeout(() => {
      channel.send({
        type: 'broadcast',
        event: 'test',
        payload: { message: 'Hello from BrickPush!' }
      })
    }, 1000)
    
    // 6. 测试存储功能
    try {
      const { data: storageData, error: storageError } = await supabase.storage.listBuckets()
      if (storageError) {
        console.log('⚠️ 存储测试失败:', storageError.message)
      } else {
        console.log('✅ 存储功能正常，找到', storageData.length, '个存储桶')
      }
    } catch (storageErr) {
      console.log('⚠️ 存储测试异常')
    }
    
    console.log('🎉 Supabase V2测试完成！')
    
  } catch (error) {
    console.error('❌ Supabase测试失败:', error)
  }
}

// 调用测试
testSupabase()

// 游戏排行榜集成示例
class SupabaseLeaderboard {
  constructor() {
    // 初始化Supabase连接
    this.supabase = createClient(supabaseUrl, supabaseAnonKey)
  }
  
  // 保存排行榜记录
  async saveScore(playerName: string, score: number, levelName: string) {
    try {
      const { data, error } = await this.supabase
        .from('leaderboard')
        .insert([
          {
            player_name: playerName,
            score: score,
            level_name: levelName
          }
        ])
        .select()
        
      if (error) throw error
      console.log('✅ 分数保存成功:', data)
      return data
    } catch (error) {
      console.error('❌ 保存分数失败:', error)
      // 回退到本地存储
      return this.saveToLocalStorage(playerName, score, levelName)
    }
  }
  
  // 获取排行榜
  async getLeaderboard(limit = 20) {
    try {
      const { data, error } = await this.supabase
        .from('leaderboard')
        .select('*')
        .order('score', { ascending: false })
        .limit(limit)
        
      if (error) throw error
      return data
    } catch (error) {
      console.error('❌ 获取排行榜失败:', error)
      // 回退到本地存储
      return this.getLocalLeaderboard()
    }
  }
  
  // 实时排行榜订阅
  subscribeToLeaderboard(callback: (entries: any[]) => void) {
    return this.supabase
      .channel('leaderboard-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'leaderboard'
        },
        (payload) => {
          console.log('📡 排行榜更新:', payload)
          // 重新获取排行榜
          this.getLeaderboard().then(callback)
        }
      )
      .subscribe()
  }
  
  // 本地存储回退
  private saveToLocalStorage(playerName: string, score: number, levelName: string) {
    const entries = this.getLocalLeaderboard()
    entries.push({
      player_name: playerName,
      score,
      level_name: levelName,
      created_at: new Date().toISOString()
    })
    
    // 按分数排序，保留前20名
    entries.sort((a, b) => b.score - a.score)
    const topEntries = entries.slice(0, 20)
    
    localStorage.setItem('brickpush:leaderboard', JSON.stringify(topEntries))
    return topEntries
  }
  
  private getLocalLeaderboard() {
    const stored = localStorage.getItem('brickpush:leaderboard')
    return stored ? JSON.parse(stored) : []
  }
}

// 导出工具
export { supabase, SupabaseLeaderboard }