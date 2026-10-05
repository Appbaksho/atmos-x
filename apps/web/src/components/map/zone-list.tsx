'use client';
/** Ranked zone rows (S05 sheet / desktop panel) and the floating map labels. */
import { useTranslations } from 'next-intl';

import { GlassPill, HeatBadge, Icon, Tag, Tap, Txt, View } from '@/components/cz/ui';
import { B, SHADOW, heatColor, heatFg } from '@/components/cz/tokens';
import type { ZoneSummary } from '@/lib/data/types';
import { useCz } from '@/lib/prefs';
import { href } from '@/lib/routes';

export function ZoneRow({ z, last }: { z: ZoneSummary; last?: boolean }) {
  const { c, f } = useCz();
  const t = useTranslations('map');
  const meta = `${t('lstShort')} ${f.deg(z.lst_c, 1)} · ${f.dist(z.dist_m)}`;
  return (
    <Tap
      href={href('S06', { id: z.id })}
      label={`${f.loc(z.rank)}. ${z.name}, ${t('scoreA11y', { score: f.loc(z.score) })}${z.near_tie ? ', ' + t('nearTie') : ''}. ${t('openZone')}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, minHeight: 56, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.line, textAlign: 'start' }}>
      <Txt size={12} dim num style={{ width: 18 }}>
        {f.loc(z.rank)}
      </Txt>
      <HeatBadge score={z.score} />
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Txt size={14} w={600} lines={1}>
          {z.name}
        </Txt>
        <Txt size={12} dim num lines={1}>
          {meta}
        </Txt>
      </View>
      {z.near_tie ? <Tag size="xs" label={t('nearTie')} fg={c.ink2} /> : null}
      <View style={[{ width: 36, height: 36, borderRadius: 18, backgroundColor: B.lime, alignItems: 'center', justifyContent: 'center' }, SHADOW.button]}>
        <Icon d={f.arrowPath} size={16} color={B.limeInk} sw={2} />
      </View>
    </Tap>
  );
}

/** Small score disc used on the floating map labels. */
export function MapScore({ score, size = 28 }: { score: number; size?: number }) {
  const { f, fw } = useCz();
  return (
    <span aria-hidden className="cz-view" style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: heatColor(score), alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <span style={{ color: heatFg(score), fontSize: Math.round(size * 0.4), lineHeight: 1, ...fw(700) }}>{f.loc(score)}</span>
    </span>
  );
}

/** Rank-1 label: glass pill with score + name. Others: a score disc (+ "≈" when near-tie). */
export function ZoneMarker({ z, big }: { z: ZoneSummary; big?: boolean }) {
  const { f } = useCz();
  const t = useTranslations('map');
  const label = `${z.name}, ${t('scoreA11y', { score: f.loc(z.score) })}${z.near_tie ? ', ' + t('nearTie') : ''}`;
  if (big)
    return (
      <Tap href={href('S06', { id: z.id })} label={label} style={{ filter: 'drop-shadow(0 4px 7px rgba(0,16,32,0.25))' }}>
        <GlassPill dark style={{ paddingStart: 6, paddingEnd: 12, minHeight: 40, gap: 8, maxWidth: 220 }}>
          <MapScore score={z.score} />
          <Txt size={12.5} w={600} color={B.white} lines={1}>
            {z.name}
          </Txt>
          {z.near_tie ? (
            <Txt size={11} w={700} color={B.lime}>
              ≈
            </Txt>
          ) : null}
        </GlassPill>
      </Tap>
    );
  return (
    <Tap href={href('S06', { id: z.id })} label={label} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
      <span className="cz-view" style={{ borderRadius: 999, border: '2px solid rgba(255,255,255,0.9)', boxShadow: '0 3px 6px rgba(0,16,32,0.3)' }}>
        <MapScore score={z.score} size={26} />
      </span>
      {z.near_tie ? (
        <span
          aria-hidden
          style={{ position: 'absolute', top: 2, insetInlineEnd: 0, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: B.navy, color: B.lime, fontSize: 11, lineHeight: '16px', textAlign: 'center', fontWeight: 700 }}>
          ≈
        </span>
      ) : null}
    </Tap>
  );
}
