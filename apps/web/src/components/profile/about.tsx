'use client';
/**
 * About · Data & science (prompt-v1 §8.4, E6): where every number comes from. The source list,
 * the Heat Score formula and the driver fit are read live from GET /sources, so this page can't
 * drift from what the app really uses. The sections explain each feature in plain words.
 */
import { useTranslations } from 'next-intl';

import { B, Card, ErrorState, I, Icon, R, Screen, ScreenHeader, SkeletonCard, Tag, Txt, View, useCz } from '@/components/cz';
import { useSources } from '@/lib/data/hooks';
import type { SourceEntry } from '@/lib/data/types';

const SECTIONS: { k: string; icon: string }[] = [
  { k: 'heat', icon: I.lst },
  { k: 'zones', icon: I.map },
  { k: 'air', icon: I.sun },
  { k: 'aq', icon: I.wind },
  { k: 'cooling', icon: I.tree },
  { k: 'farm', icon: I.drop },
  { k: 'checks', icon: I.check },
  { k: 'ask', icon: I.sparkleOne },
  { k: 'community', icon: I.community },
  { k: 'nurseries', icon: I.pin },
];

const CREDITS: { k: string; link?: string }[] = [
  { k: 'osm', link: 'https://www.openstreetmap.org/copyright' },
  { k: 'ofm', link: 'https://openfreemap.org/' },
  { k: 'meteo', link: 'https://open-meteo.com/en/license' },
  { k: 'photos', link: 'https://unsplash.com/license' },
  { k: 'fonts' },
];

export function AboutScreen() {
  const t = useTranslations('profile.about');
  const { c, f } = useCz();
  const q = useSources();
  const info = q.data;
  const sources = [...(info?.sources ?? [])].sort((a, b) => Number(b.nasa) - Number(a.nasa) || Number(b.status === 'active') - Number(a.status === 'active'));
  return (
    <Screen>
      <ScreenHeader title={t('title')} sub={t('sub')} />

      {/* Live summary from /sources */}
      {q.isPending ? (
        <SkeletonCard lines={3} height={140} />
      ) : q.isError || !info ? (
        <ErrorState compact error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <Card tone="navy" gap={10}>
          <Txt size={15} w={600} color={B.white}>
            {t('live.count', { n: f.loc(info.active_nasa_count) })}
          </Txt>
          <Txt size={12.5} color="rgba(255,255,255,0.8)">
            {t('live.formula')}
          </Txt>
          <code dir="ltr" style={{ fontSize: 11.5, lineHeight: 1.5, whiteSpace: 'pre-wrap', color: B.white, background: 'rgba(255,255,255,0.08)', borderRadius: 10, padding: 10 }}>
            {`${info.heat_score.text}\n${info.heat_score.f}`}
          </code>
          {info.driver_fit ? (
            <Txt size={12.5} color="rgba(255,255,255,0.8)">
              {t('live.fit', { r2: f.dec(info.driver_fit.r2, 2), n: f.num(info.driver_fit.n) })}
            </Txt>
          ) : null}
        </Card>
      )}

      {SECTIONS.map((s) => (
        <Card key={s.k} gap={8}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: c.limeSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Icon d={s.icon} size={17} sw={2} />
            </View>
            <Txt size={14.5} w={600} as="h2" style={{ flex: 1 }}>
              {t(`sections.${s.k}.title`)}
            </Txt>
          </View>
          <Txt size={13} dim>
            {t(`sections.${s.k}.body`)}
          </Txt>
        </Card>
      ))}

      {/* Every source, live */}
      <View style={{ gap: 8 }}>
        <Txt label as="h2" style={{ paddingHorizontal: 4, paddingTop: 4 }}>
          {t('sources.title')}
        </Txt>
        <Txt size={12} dim style={{ paddingHorizontal: 4 }}>
          {t('sources.sub')}
        </Txt>
        {q.isPending ? (
          <SkeletonCard lines={4} height={200} />
        ) : sources.length ? (
          <Card pad={0} gap={0} style={{ paddingHorizontal: 14 }}>
            {sources.map((s, i) => (
              <SourceRow key={s.id} s={s} last={i === sources.length - 1} />
            ))}
          </Card>
        ) : null}
      </View>

      <Card gap={10}>
        <Txt label as="h2">
          {t('credits')}
        </Txt>
        {CREDITS.map((cr) =>
          cr.link ? (
            <a key={cr.k} href={cr.link} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none', minHeight: 24 }}>
              <Txt size={12.5}>{t(`credit.${cr.k}`)}</Txt>
            </a>
          ) : (
            <Txt key={cr.k} size={12.5}>
              {t(`credit.${cr.k}`)}
            </Txt>
          ),
        )}
      </Card>
      <Txt size={11} dim center>
        {info ? t('version', { v: info.pipeline_version }) : t('versionNone')}
      </Txt>
    </Screen>
  );
}

function SourceRow({ s, last }: { s: SourceEntry; last: boolean }) {
  const t = useTranslations('profile.about.sources');
  const tl = useTranslations('landing');
  const tk = useTranslations('common.sources');
  const { c, f } = useCz();
  const active = s.status === 'active';
  const date = s.latest_data && /^\d{4}-\d{2}-\d{2}/.test(s.latest_data) ? f.date(s.latest_data.slice(0, 10), { dateStyle: 'medium' }) : s.latest_data;
  const use = tl.has(`use.${s.id}`) ? tl(`use.${s.id}`) : s.used_for;
  const body = (
    <View style={{ gap: 4, paddingVertical: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.line }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <Txt size={13.5} w={600} style={{ flexShrink: 1 }}>
          {s.name}
        </Txt>
        {s.nasa ? <Tag label="NASA" size="xs" bg={B.navy} fg={B.lime} /> : null}
        <Tag label={tk.has(`kind.${s.kind}`) ? tk(`kind.${s.kind}`) : s.kind} size="xs" />
        <Tag label={active ? t('inUse') : t('standby')} size="xs" bg={active ? c.limeSoft : c.soft} />
      </View>
      <Txt size={12} dim>
        {use}
      </Txt>
      <Txt size={11.5} dim>
        {[date ? t('latest', { date }) : null, s.resolution_m ? t('resolution', { m: f.num(s.resolution_m) }) : null, s.licence].filter(Boolean).join(' · ')}
      </Txt>
    </View>
  );
  return s.url && /^https?:/.test(s.url) ? (
    <a href={s.url} target="_blank" rel="noopener noreferrer" aria-label={t('opens', { name: s.name })} style={{ color: 'inherit', textDecoration: 'none', borderRadius: R.md }}>
      {body}
    </a>
  ) : (
    body
  );
}
