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
const LEADERBOARD_API = '/api/leaderboard';

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

function normalizeLeaderboardEntries(entries: unknown): LeaderboardEntry[] {
  if (!Array.isArray(entries)) return [];

  return entries
    .filter(
      (entry) =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as LeaderboardEntry).name === 'string' &&
        typeof (entry as LeaderboardEntry).score === 'number' &&
        typeof (entry as LeaderboardEntry).levelName === 'string' &&
        typeof (entry as LeaderboardEntry).timestamp === 'number'
    )
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.timestamp - b.timestamp;
    })
    .slice(0, MAX_LEADERBOARD_ENTRIES);
}

export async function loadLeaderboardShared(): Promise<LeaderboardEntry[]> {
  if (typeof window === 'undefined' || typeof fetch !== 'function') {
    return loadLeaderboard();
  }

  try {
    const response = await fetch(LEADERBOARD_API, { method: 'GET' });
    if (!response.ok) {
      throw new Error(`Leaderboard request failed: ${response.status}`);
    }

    const data = normalizeLeaderboardEntries(await response.json());
    if (window.localStorage) {
      window.localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(data));
    }
    return data;
  } catch {
    return loadLeaderboard();
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

  if (typeof window === 'undefined' || typeof fetch !== 'function') {
    return saveLeaderboardEntry(safeName, score, levelName);
  }

  try {
    const response = await fetch(LEADERBOARD_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: safeName,
        score: Math.max(0, Math.floor(score)),
        levelName,
      }),
    });

    if (!response.ok) {
      throw new Error(`Leaderboard save failed: ${response.status}`);
    }

    const data = normalizeLeaderboardEntries(await response.json());
    if (window.localStorage) {
      window.localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(data));
    }
    return data;
  } catch {
    return saveLeaderboardEntry(safeName, score, levelName);
  }
}
