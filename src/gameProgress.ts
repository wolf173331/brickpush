export interface LeaderboardEntry {
  name: string;
  score: number;
  levelName: string;
  timestamp: number;
}

const LEADERBOARD_KEY = 'brickpush:leaderboard';
const MAX_LEADERBOARD_ENTRIES = 20;

export const LEADERBOARD_MAX_ENTRIES = MAX_LEADERBOARD_ENTRIES;
const DEFAULT_RUN_HP = 3;
// GitHub Pages是静态托管，不使用服务器API
// const LEADERBOARD_API = '/api/leaderboard';

let currentRunScore = 0;
let currentRunHp = DEFAULT_RUN_HP;

export function getRunScore(): number {
  return currentRunScore;
}

export function setRunScore(score: number): void {
  currentRunScore = Math.max(0, Math.floor(score));
}

export function resetRunScore(): void {
  currentRunScore = 0;
}

export function getRunHp(): number {
  return currentRunHp;
}

export function setRunHp(hp: number): void {
  currentRunHp = Math.max(0, Math.floor(hp));
}

export function resetRunHp(): void {
  currentRunHp = DEFAULT_RUN_HP;
}

export function sanitizeLeaderboardName(input: string): string {
  const cleaned = input.replace(/[^A-Za-z]/g, '').slice(0, 10).toUpperCase();
  return cleaned;
}

export function loadLeaderboard(): LeaderboardEntry[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];

  try {
    const raw = window.localStorage.getItem(LEADERBOARD_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LeaderboardEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry) =>
        typeof entry?.name === 'string' &&
        typeof entry?.score === 'number' &&
        typeof entry?.levelName === 'string' &&
        typeof entry?.timestamp === 'number'
    );
  } catch {
    return [];
  }
}

export function saveLeaderboardEntry(name: string, score: number, levelName: string): LeaderboardEntry[] {
  const safeName = sanitizeLeaderboardName(name);
  if (!safeName || typeof window === 'undefined' || !window.localStorage) {
    return loadLeaderboard();
  }

  const nextEntries = [
    ...loadLeaderboard(),
    {
      name: safeName,
      score: Math.max(0, Math.floor(score)),
      levelName,
      timestamp: Date.now(),
    },
  ]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.timestamp - b.timestamp;
    })
    .slice(0, MAX_LEADERBOARD_ENTRIES);

  window.localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(nextEntries));
  return nextEntries;
}

// function normalizeLeaderboardEntries(entries: unknown): LeaderboardEntry[] {
//   if (!Array.isArray(entries)) return [];
// 
//   return entries
//     .filter(
//       (entry) =>
//         typeof entry === 'object' &&
//         entry !== null &&
//         typeof (entry as LeaderboardEntry).name === 'string' &&
//         typeof (entry as LeaderboardEntry).score === 'number' &&
//         typeof (entry as LeaderboardEntry).levelName === 'string' &&
//         typeof (entry as LeaderboardEntry).timestamp === 'number'
//     )
//     .sort((a, b) => {
//       if (b.score !== a.score) return b.score - a.score;
//       return a.timestamp - b.timestamp;
//     })
//     .slice(0, MAX_LEADERBOARD_ENTRIES);
// }

export async function loadLeaderboardShared(): Promise<LeaderboardEntry[]> {
  try {
    // 尝试使用Supabase在线排行榜
    const { LeaderboardService } = await import('./supabaseClient')
    const service = LeaderboardService.getInstance()
    const entries = await service.getLeaderboard()
    
    // 转换为游戏格式
    return entries.map(entry => ({
      name: entry.name,
      score: entry.score,
      levelName: entry.levelName,
      timestamp: entry.timestamp
    }))
  } catch (error) {
    console.warn('在线排行榜失败，回退到本地存储:', error)
    return loadLeaderboard()
  }
}

export async function saveLeaderboardEntryShared(
  name: string,
  score: number,
  levelName: string
): Promise<LeaderboardEntry[]> {
  const safeName = sanitizeLeaderboardName(name);
  if (!safeName) {
    return loadLeaderboardShared();
  }

  try {
    // 尝试使用Supabase在线保存
    const { LeaderboardService } = await import('./supabaseClient')
    const service = LeaderboardService.getInstance()
    const entries = await service.saveScore(safeName, score, levelName)
    
    // 转换为游戏格式
    return entries.map(entry => ({
      name: entry.name,
      score: entry.score,
      levelName: entry.levelName,
      timestamp: entry.timestamp
    }))
  } catch (error) {
    console.warn('在线保存失败，回退到本地存储:', error)
    return saveLeaderboardEntry(safeName, score, levelName)
  }
}
