'use client';
/** Small pieces shared by the community screens (S16–S19, /join). */
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';

import { AVATARS, B } from '@/components/cz';
import { DataError } from '@/lib/data/hooks';
import type { Team } from '@/lib/data/types';

/** Avatar colours by position (same rotation as the prototype). */
export const avatarAt = (i: number): [string, string] => AVATARS[((i % AVATARS.length) + AVATARS.length) % AVATARS.length];

/** Stable avatar colours for a name (members keep their colour across screens). */
export function avatarFor(name: string): [string, string] {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return avatarAt(Math.abs(h));
}

/** Short initials for a team / org name ("Hall Rooftop Crew" → "HR"). */
export function teamInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts[0] && /^[A-Z0-9]{2,3}$/.test(parts[0])) return parts[0];
  const s = (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? parts[0]?.[1] ?? '');
  return s.toUpperCase();
}

/** The prototype's verified seal (blue rosette + white tick). */
export function VerifiedSeal({ size = 22, label }: { size?: number; label?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} focusable="false">
      <path d="M12 2l2.6 2.2 3.4-.4.9 3.3 3 1.7-1.3 3.2 1.3 3.2-3 1.7-.9 3.3-3.4-.4L12 22l-2.6-2.2-3.4.4-.9-3.3-3-1.7L3.4 12 2.1 8.8l3-1.7.9-3.3 3.4.4z" fill={B.blue} />
      <path d="M8 12.2l2.6 2.6L16 9.4" fill="none" stroke={B.white} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Map team-related data errors to copy. */
export function useTeamErrorText() {
  const t = useTranslations('community.err');
  return useCallback(
    (e: unknown): string => {
      if (e instanceof DataError) {
        const key = e.code.replace(/^team\./, 'team.');
        if (t.has(key)) return t(key);
      }
      return t('generic');
    },
    [t],
  );
}

/** Free places in a team. */
export const freePlaces = (team: Pick<Team, 'members' | 'max_members'>) => Math.max(0, team.max_members - team.members.length);

/** Compact number: 18,420 → "18.4k" (Latin → caller localises digits). */
export function compact(n: number): string {
  if (Math.abs(n) >= 10000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(Math.round(n));
}

/** Cooling as a negative °C delta ("−0.073 °C"); zero shows without a sign. */
export function coolingText(dC: (c: number, dp?: number) => string, cooling: number): string {
  const v = Math.abs(cooling);
  if (v < 0.0005) return dC(0, 2).replace(/^[+−-]/, '');
  return dC(-v, v < 0.1 ? 3 : 2);
}
