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

export interface LeaderboardEntry {
  name: string
  score: number
  levelName: string
  timestamp: number
}

const LS_KEY = 'brickpush:leaderboard'
const MAX_ENTRIES = 20

// ---- 本地存储 ----

export function localLoad(): LeaderboardEntry[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function localSave(name: string, score: number, levelName: string): LeaderboardEntry[] {
  const merged = mergeEntries([
    ...localLoad(),
    { name, score, levelName, timestamp: Date.now() },
  ])
  localStorage.setItem(LS_KEY, JSON.stringify(merged))
  return merged
}

/** 合并两个列表：去重（同名取最高分），按分数排序，保留前 MAX_ENTRIES */
export function mergeEntries(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  const map = new Map<string, LeaderboardEntry>()
  for (const e of entries) {
    const key = e.name.toUpperCase()
    const existing = map.get(key)
    if (!existing || e.score > existing.score) {
      map.set(key, e)
    }
  }
  return Array.from(map.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_ENTRIES)
}

// ---- Supabase ----

async function fetchOnline(limit = MAX_ENTRIES): Promise<LeaderboardEntry[]> {
  if (!supabase) return []
  try {
    const { data, error } = await supabase
      .from('leaderboard')
      .select('player_name, score, level_name, created_at')
      .order('score', { ascending: false })
      .limit(limit)
    if (error) throw error
    return (data ?? []).map(row => ({
      name: row.player_name,
      score: row.score,
      levelName: row.level_name,
      timestamp: new Date(row.created_at).getTime(),
    }))
  } catch (err) {
    console.warn('在线获取失败:', err)
    return []
  }
}

async function pushToOnline(name: string, score: number, levelName: string): Promise<void> {
  if (!supabase) return
  try {
    const { error } = await supabase.from('leaderboard').insert([{
      player_name: name,
      score: Math.max(0, Math.floor(score)),
      level_name: levelName,
    }])
    if (error) throw error
  } catch (err) {
    console.warn('在线上传失败:', err)
  }
}

// ---- LeaderboardService ----

export class LeaderboardService {
  private static instance: LeaderboardService

  static getInstance(): LeaderboardService {
    if (!LeaderboardService.instance) {
      LeaderboardService.instance = new LeaderboardService()
    }
    return LeaderboardService.instance
  }

  /**
   * 获取排行榜：在线+本地合并
   * 先立即返回本地数据，同时异步拉取在线数据合并后更新缓存
   */
  async getLeaderboard(): Promise<LeaderboardEntry[]> {
    const local = localLoad()

    if (!supabase) return local

    // 拉取在线数据，与本地合并
    const online = await fetchOnline()
    if (online.length === 0) return local

    const merged = mergeEntries([...local, ...online])
    // 更新本地缓存
    localStorage.setItem(LS_KEY, JSON.stringify(merged))
    return merged
  }

  /**
   * 保存分数：
   * 1. 立即写入本地
   * 2. 异步上传在线（不阻塞）
   * 3. 返回合并后的榜单
   */
  async saveScore(name: string, score: number, levelName: string): Promise<LeaderboardEntry[]> {
    const safeName = name.replace(/[^A-Za-z]/g, '').slice(0, 10).toUpperCase()

    // 立即写本地
    const local = localSave(safeName, score, levelName)

    // 异步上传在线，不等待
    if (supabase) {
      pushToOnline(safeName, score, levelName).then(() => {
        // 上传成功后静默更新本地缓存
        fetchOnline().then(online => {
          if (online.length > 0) {
            const merged = mergeEntries([...localLoad(), ...online])
            localStorage.setItem(LS_KEY, JSON.stringify(merged))
          }
        })
      })
    }

    return local
  }
}
