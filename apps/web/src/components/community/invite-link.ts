/**
 * Invite links: `<origin>/join/<code>?t=<payload>`. The payload is a small base64url JSON preview of
 * the team, so /join can describe a team that was created on another device (teams are stored per
 * device in v0). Seed teams resolve by code alone; the payload is only a preview.
 */
import type { Team } from '@/lib/data/types';

export type InvitePayload = {
  /** team id */
  i: string;
  /** name */
  n: string;
  /** max members */
  m: number;
  /** members now */
  c: number;
  /** org name */
  o?: string | null;
  /** emoji */
  e?: string;
  /** inviter display name */
  by?: string;
};

function b64urlEncode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeInvite(team: Pick<Team, 'id' | 'name' | 'max_members' | 'members' | 'org_name' | 'emoji'>, by?: string | null): string {
  const p: InvitePayload = { i: team.id, n: team.name.slice(0, 60), m: team.max_members, c: team.members.length };
  if (team.org_name) p.o = team.org_name.slice(0, 60);
  if (team.emoji) p.e = team.emoji;
  if (by) p.by = by.slice(0, 40);
  return b64urlEncode(JSON.stringify(p));
}

export function decodeInvite(raw: string | null | undefined): InvitePayload | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(b64urlDecode(raw)) as Partial<InvitePayload>;
    if (typeof v.n !== 'string' || typeof v.m !== 'number') return null;
    return { i: String(v.i ?? ''), n: v.n.slice(0, 60), m: Math.max(2, Math.min(5, v.m)), c: Math.max(0, Math.min(5, Number(v.c) || 0)), o: v.o ?? null, e: v.e, by: v.by };
  } catch {
    return null;
  }
}

/** Full invite URL with the preview payload. */
export function inviteUrl(baseUrl: string, team: Parameters<typeof encodeInvite>[0], by?: string | null): string {
  return `${baseUrl}?t=${encodeInvite(team, by)}`;
}

/** Normalise user-typed codes: "4k7q29" → "4K7Q-29". */
export function formatCode(raw: string): string {
  const s = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return s.length > 4 ? `${s.slice(0, 4)}-${s.slice(4, 6)}` : s;
}
