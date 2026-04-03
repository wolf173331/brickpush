import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

function isConfigured(): boolean {
  return (
    typeof SUPABASE_URL === 'string' &&
    SUPABASE_URL.startsWith('https://') &&
    !SUPABASE_URL.includes('your-project-id') &&
    typeof SUPABASE_ANON_KEY === 'string' &&
    SUPABASE_ANON_KEY.length > 20 &&
    !SUPABASE_ANON_KEY.includes('your-anon-key')
  )
}

export const supabase = isConfigured()
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    })
  : null

export function isSupabaseAvailable(): boolean {
  return supabase !== null
}

// 测试连接：直接查 leaderboard 表
async function testConnection(): Promise<boolean> {
  if (!supabase) {
    console.warn('⚠️ Supabase 未配置，使用本地模式')
    return false
  }
  try {
    const { error } = await supabase.from('leaderboard').select('id').limit(1)
    if (error) {
      console.warn('⚠️ Supabase 连接失败:', error.message)
      return false
    }
    console.log('✅ Supabase 连接成功，在线排行榜已启用')
    return true
  } catch (err) {
    console.error('❌ Supabase 连接异常:', err)
    return false
  }
}

export interface LeaderboardEntry {
  name: string
  score: number
  levelName: string
  timestamp: number
}

const LS_KEY = 'brickpush:leaderboard'
const MAX_ENTRIES = 20

function localLoad(): LeaderboardEntry[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function localSave(name: string, score: number, levelName: string): LeaderboardEntry[] {
  const entries = [
    ...localLoad(),
    { name, score, levelName, timestamp: Date.now() },
  ]
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_ENTRIES)
  localStorage.setItem(LS_KEY, JSON.stringify(entries))
  return entries
}

export class LeaderboardService {
  private static instance: LeaderboardService
  private onlineMode = false
  // 用 Promise 确保 init 完成后再操作，避免 race condition
  private readonly ready: Promise<void>

  private constructor() {
    this.ready = testConnection().then((ok) => {
      this.onlineMode = ok
    })
  }

  static getInstance(): LeaderboardService {
    if (!LeaderboardService.instance) {
      LeaderboardService.instance = new LeaderboardService()
    }
    return LeaderboardService.instance
  }

  async saveScore(name: string, score: number, levelName: string): Promise<LeaderboardEntry[]> {
    await this.ready // 等待连接检测完成
    const safeName = name.replace(/[^A-Za-z]/g, '').slice(0, 10).toUpperCase()

    if (!this.onlineMode || !supabase) {
      return localSave(safeName, score, levelName)
    }

    try {
      const { error } = await supabase.from('leaderboard').insert([
        {
          player_name: safeName,
          score: Math.max(0, Math.floor(score)),
          level_name: levelName,
        },
      ])
      if (error) throw error

      // 同步本地缓存
      localSave(safeName, score, levelName)
      // 返回最新在线榜单
      return this.getLeaderboard()
    } catch (err) {
      console.warn('在线保存失败，回退本地:', err)
      return localSave(safeName, score, levelName)
    }
  }

  async getLeaderboard(limit = MAX_ENTRIES): Promise<LeaderboardEntry[]> {
    await this.ready
    if (!this.onlineMode || !supabase) {
      return localLoad()
    }

    try {
      const { data, error } = await supabase
        .from('leaderboard')
        .select('player_name, score, level_name, created_at')
        .order('score', { ascending: false })
        .limit(limit)
      if (error) throw error

      const entries: LeaderboardEntry[] = (data ?? []).map((row) => ({
        name: row.player_name,
        score: row.score,
        levelName: row.level_name,
        timestamp: new Date(row.created_at).getTime(),
      }))

      // 更新本地缓存
      localStorage.setItem(LS_KEY, JSON.stringify(entries))
      return entries
    } catch (err) {
      console.warn('在线获取失败，回退本地:', err)
      return localLoad()
    }
  }
}
