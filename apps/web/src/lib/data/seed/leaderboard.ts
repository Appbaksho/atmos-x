/**
 * Leaderboard merge: seed board rows + live rows (the local user, their teams/org, and in normal mode
 * Nadia's story). Live rows replace seed rows with the same id or are inserted, then everything is
 * re-ranked, so logging an action moves you up the board.
 *
 * Ranks use competition ranking (1 + rows with strictly more points). Rows below the explicit seed
 * list get an estimated rank from the board's `tail` curve (the wider city/country population).
 */
import type { LeaderboardRow } from '../types';
import type { SeedBoard } from './types';

export type LiveRow = Omit<LeaderboardRow, 'rank'>;

/** Linear interpolation over [points, rank] pairs sorted by descending points. */
export function estimateRank(tail: readonly [number, number][], points: number): number | null {
  if (!tail.length) return null;
  if (points >= tail[0][0]) return tail[0][1];
  for (let i = 0; i < tail.length - 1; i++) {
    const [p0, r0] = tail[i];
    const [p1, r1] = tail[i + 1];
    if (points <= p0 && points >= p1) {
      const t = p0 === p1 ? 0 : (p0 - points) / (p0 - p1);
      return Math.round(r0 + t * (r1 - r0));
    }
  }
  return tail[tail.length - 1][1];
}

export function mergeBoard(
  board: SeedBoard,
  live: readonly LiveRow[],
  opts: { top?: number } = {},
): { rows: LeaderboardRow[]; me: LeaderboardRow | null } {
  const top = opts.top ?? 10;
  const liveIds = new Set(live.map((r) => r.id));
  const floor = board.rows.length ? board.rows[board.rows.length - 1].points : 0;
  const merged: LiveRow[] = [
    ...board.rows.filter((r) => !liveIds.has(r.id)).map((r) => ({ ...r, is_me: false })),
    ...live,
  ].sort((a, b) => b.points - a.points || Number(b.is_me) - Number(a.is_me) || a.name.localeCompare(b.name));

  const ranked: LeaderboardRow[] = merged.map((r) => {
    const position = 1 + merged.filter((o) => o.points > r.points).length;
    const est = r.points < floor ? estimateRank(board.tail, r.points) : null;
    return { ...r, rank: est === null ? position : Math.max(position, est) };
  });

  const me = ranked.find((r) => r.is_me) ?? null;
  return { rows: ranked.slice(0, top), me };
}
