/** Team rules: 2–5 people per team, invite codes without ambiguous characters (0/O, 1/I/L). */
import { DataError } from '../errors';

export const MAX_TEAM_MEMBERS = 5;
export const MIN_TEAM_MEMBERS = 2;

/** No 0, O, 1, I, L. */
export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/** `XXXX-XX`, e.g. `4K7Q-29`. */
export function generateTeamCode(random: () => number = Math.random, taken: ReadonlySet<string> = new Set()): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    let s = '';
    for (let i = 0; i < 6; i++) s += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length) % CODE_ALPHABET.length];
    const code = `${s.slice(0, 4)}-${s.slice(4)}`;
    if (!taken.has(code)) return code;
  }
  throw new DataError('team.code_exhausted', 'Could not generate a unique code');
}

/** Upper-case, trim and accept codes typed without the dash or with spaces. */
export function normalizeCode(input: string): string {
  const raw = input.trim().toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (raw.length !== 6) return input.trim().toUpperCase();
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

export function isValidCode(code: string): boolean {
  return new RegExp(`^[${CODE_ALPHABET}]{4}-[${CODE_ALPHABET}]{2}$`).test(code);
}

export function clampTeamSize(n: number): number {
  return Math.max(MIN_TEAM_MEMBERS, Math.min(MAX_TEAM_MEMBERS, Math.round(n) || MAX_TEAM_MEMBERS));
}

/** Throws `team.full` / `team.already_member`. */
export function assertCanJoin(team: { members: { user_id: string }[]; max_members: number }, userId: string): void {
  if (team.members.some((m) => m.user_id === userId)) throw new DataError('team.already_member', 'You are already in this team', 409);
  const cap = Math.min(team.max_members, MAX_TEAM_MEMBERS);
  if (team.members.length >= cap) throw new DataError('team.full', `This team already has ${cap} members`, 409);
}
