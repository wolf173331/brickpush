/**
 * EnemySpawner - algoritmo di posizionamento spawn nemici
 */
import { GRID_ROWS, GRID_COLS, CELL_EMPTY, ALL_DIRECTIONS, inBounds } from '../config';
import type { SpawnCandidate } from '../entity/types';

export interface SpawnContext {
  grid: number[][];
  playerCol: number;
  playerRow: number;
  levelIndex: number;
}

export function resolveEnemySpawnCells(
  ctx: SpawnContext,
  count: number
): Array<{ col: number; row: number }> {
  const candidates: SpawnCandidate[] = [];
  for (let r = 2; r < GRID_ROWS - 2; r++) {
    for (let c = 2; c < GRID_COLS - 2; c++) {
      if (ctx.grid[r][c] !== CELL_EMPTY) continue;
      const baseExits = countEnemySpawnExits(ctx.grid, [], c, r);
      if (baseExits <= 0) continue;
      candidates.push({
        col: c, row: r,
        bucket: getSpawnBucket(r),
        nearbyObstacles: countNearbyObstacles(ctx.grid, c, r),
      });
    }
  }

  const targetBuckets = getTargetSpawnBucketCounts(count, candidates);
  const targetVariants = getTargetBucketVariants(targetBuckets);

  for (const target of targetVariants) {
    const picked = tryBuildEnemySpawnSet(ctx, candidates, count, target);
    if (picked.length === count) return picked;
  }

  return candidates.slice(0, count).map(c => ({ col: c.col, row: c.row }));
}

function tryBuildEnemySpawnSet(
  ctx: SpawnContext,
  candidates: SpawnCandidate[],
  count: number,
  targetBuckets: [number, number, number]
): Array<{ col: number; row: number }> {
  const baseSeed = (ctx.levelIndex + 1) * 9973 + count * 37;

  for (let attempt = 0; attempt < 80; attempt++) {
    let state = (baseSeed + attempt * 7919) >>> 0;
    const nextRandom = (): number => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0x100000000;
    };

    const chosen: Array<{ col: number; row: number }> = [];
    const bucketCounts: [number, number, number] = [0, 0, 0];

    while (chosen.length < count) {
      const need = targetBuckets.map((t, i) => Math.max(0, t - bucketCounts[i])) as [number, number, number];
      const preferredBuckets = new Set(need.flatMap((v, i) => v > 0 ? [i] : []));
      const remaining = candidates.filter(c => !chosen.some(p => p.col === c.col && p.row === c.row));

      const ranked = rankEnemySpawnCandidates(ctx, remaining.filter(c => preferredBuckets.size === 0 || preferredBuckets.has(c.bucket)), chosen, need, nextRandom);
      const fallback = ranked.length > 0 ? ranked : rankEnemySpawnCandidates(ctx, remaining, chosen, need, nextRandom);
      if (fallback.length === 0) break;

      const pick = fallback[0];
      chosen.push({ col: pick.col, row: pick.row });
      bucketCounts[pick.bucket]++;
    }

    if (chosen.length === count && countTrappedEnemySpawns(ctx.grid, chosen) <= 2) {
      return chosen;
    }
  }
  return [];
}

function rankEnemySpawnCandidates(
  ctx: SpawnContext,
  candidates: SpawnCandidate[],
  chosen: Array<{ col: number; row: number }>,
  need: [number, number, number],
  nextRandom: () => number
): SpawnCandidate[] {
  return candidates
    .map(candidate => {
      const projected = [...chosen, { col: candidate.col, row: candidate.row }];
      const trapped = countTrappedEnemySpawns(ctx.grid, projected);
      if (trapped > 2) return null;

      const exits = countEnemySpawnExits(ctx.grid, projected, candidate.col, candidate.row);
      const minDistance = chosen.length === 0 ? 6
        : Math.min(...chosen.map(p => Math.abs(p.col - candidate.col) + Math.abs(p.row - candidate.row)));
      const distToPlayer = Math.abs(ctx.playerCol - candidate.col) + Math.abs(ctx.playerRow - candidate.row);

      const score =
        need[candidate.bucket] * 110 +
        Math.min(exits, 4) * 34 +
        Math.min(minDistance, 6) * 18 +
        Math.min(distToPlayer, 8) * 4 +
        Math.min(candidate.nearbyObstacles, 5) * 5 -
        Math.abs(candidate.row - 6) * 2 -
        trapped * 12 +
        (nextRandom() * 12 - 6);

      return { candidate, score };
    })
    .filter((e): e is { candidate: SpawnCandidate; score: number } => e !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(e => e.candidate);
}

function countEnemySpawnExits(grid: number[][], occupied: Array<{ col: number; row: number }>, col: number, row: number): number {
  let exits = 0;
  for (const dir of ALL_DIRECTIONS) {
    const nc = col + dir.dc, nr = row + dir.dr;
    if (!inBounds(nc, nr)) continue;
    if (grid[nr][nc] !== CELL_EMPTY) continue;
    if (!occupied.some(e => e.col === nc && e.row === nr)) exits++;
  }
  return exits;
}

function countTrappedEnemySpawns(grid: number[][], spawns: Array<{ col: number; row: number }>): number {
  return spawns.reduce((total, spawn) => {
    const occupied = spawns.filter(o => o !== spawn);
    return total + (countEnemySpawnExits(grid, occupied, spawn.col, spawn.row) <= 2 ? 1 : 0);
  }, 0);
}

function getSpawnBucket(row: number): number {
  if (row <= 4) return 0;
  if (row <= 7) return 1;
  return 2;
}

function countNearbyObstacles(grid: number[][], col: number, row: number): number {
  let total = 0;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dc === 0 && dr === 0) continue;
      const nc = col + dc, nr = row + dr;
      if (!inBounds(nc, nr)) continue;
      if (grid[nr][nc] !== CELL_EMPTY) total++;
    }
  }
  return total;
}

function getTargetSpawnBucketCounts(count: number, candidates: SpawnCandidate[]): [number, number, number] {
  const capacity: [number, number, number] = [0, 0, 0];
  for (const c of candidates) capacity[c.bucket]++;

  const target: [number, number, number] = [Math.floor(count / 3), Math.floor(count / 3), Math.floor(count / 3)];
  const remainder = count % 3;
  const order = [0, 2, 1];
  for (let i = 0; i < remainder; i++) target[order[i]]++;

  let overflow = 0;
  for (let i = 0; i < target.length; i++) {
    if (target[i] > capacity[i]) { overflow += target[i] - capacity[i]; target[i] = capacity[i]; }
  }
  while (overflow > 0) {
    const best = [0, 1, 2].reduce((b, c) => (capacity[c] - target[c]) > (capacity[b] - target[b]) ? c : b, 0);
    if (capacity[best] <= target[best]) break;
    target[best]++; overflow--;
  }
  return target;
}

function getTargetBucketVariants(target: [number, number, number]): Array<[number, number, number]> {
  const variants: Array<[number, number, number]> = [target];
  for (const [from, to] of [[0,1],[1,2],[0,2]] as [number,number][]) {
    if (target[from] <= 0) continue;
    variants.push(target.map((v, i) => i === from ? v - 1 : i === to ? v + 1 : v) as [number, number, number]);
  }
  return variants.filter((v, i, list) => {
    if (v.some(x => x < 0)) return false;
    return list.findIndex(o => o.every((x, j) => x === v[j])) === i;
  });
}
