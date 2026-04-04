/**
 * WinCondition - controlla se le condizioni di vittoria sono soddisfatte
 */
import { GRID_ROWS, GRID_COLS, CELL_HEART_BLOCK, HEARTS_NEEDED_FOR_WIN } from '../config';

export function countHearts(grid: number[][]): number {
  let count = 0;
  for (let r = 0; r < GRID_ROWS; r++)
    for (let c = 0; c < GRID_COLS; c++)
      if (grid[r][c] === CELL_HEART_BLOCK) count++;
  return count;
}

export function checkHeartsConnected(grid: number[][]): boolean {
  const hearts: Array<{ c: number; r: number }> = [];
  for (let r = 0; r < GRID_ROWS; r++)
    for (let c = 0; c < GRID_COLS; c++)
      if (grid[r][c] === CELL_HEART_BLOCK) hearts.push({ c, r });

  if (hearts.length < HEARTS_NEEDED_FOR_WIN) return false;

  const byRow = new Map<number, Array<{ c: number; r: number }>>();
  const byCol = new Map<number, Array<{ c: number; r: number }>>();

  for (const h of hearts) {
    if (!byRow.has(h.r)) byRow.set(h.r, []);
    byRow.get(h.r)!.push(h);
    if (!byCol.has(h.c)) byCol.set(h.c, []);
    byCol.get(h.c)!.push(h);
  }

  for (const [, row] of byRow) {
    if (row.length >= HEARTS_NEEDED_FOR_WIN) {
      row.sort((a, b) => a.c - b.c);
      let streak = 1;
      for (let i = 1; i < row.length; i++) {
        streak = row[i].c === row[i-1].c + 1 ? streak + 1 : 1;
        if (streak >= HEARTS_NEEDED_FOR_WIN) return true;
      }
    }
  }

  for (const [, col] of byCol) {
    if (col.length >= HEARTS_NEEDED_FOR_WIN) {
      col.sort((a, b) => a.r - b.r);
      let streak = 1;
      for (let i = 1; i < col.length; i++) {
        streak = col[i].r === col[i-1].r + 1 ? streak + 1 : 1;
        if (streak >= HEARTS_NEEDED_FOR_WIN) return true;
      }
    }
  }

  return false;
}
