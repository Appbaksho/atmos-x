'use client';

/** "All species for this area" card on S10 (useSpecies): filter chips, ranked rows → S11. */
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Card, ErrorState, FilterChip, GhostButton, HScroll, Icon, SkeletonText, SourceChips, Tap, Txt, View, href, useCz } from '@/components/cz';
import { useSpecies } from '@/lib/data/hooks';
import type { LatLng, SpeciesSummary } from '@/lib/data/types';
import { iso } from './bidi';

const FILTERS = ['all', 'high', 'lowWater', 'cheap'] as const;
type Filter = (typeof FILTERS)[number];
const RANK = { high: 3, medium: 2, low: 1 } as const;

export function SpeciesCatalog({ point }: { point: LatLng | null }) {
  const t = useTranslations('plan');
  const { c, f } = useCz();
  const q = useSpecies(point);
  const [filter, setFilter] = useState<Filter>('all');
  const [all, setAll] = useState(false);

  let list: SpeciesSummary[] = [...(q.data?.species ?? [])];
  if (filter === 'high') list = list.filter((s) => s.cooling === 'high');
  if (filter === 'lowWater') list = list.filter((s) => s.water === 'low');
  if (filter === 'cheap') list.sort((a, b) => (a.price?.amount ?? Infinity) - (b.price?.amount ?? Infinity));
  else list.sort((a, b) => RANK[b.cooling] - RANK[a.cooling] || b.canopy_m - a.canopy_m);
  const rows = all ? list : list.slice(0, 6);

  return (
    <Card pad={14}>
      <Txt display size={14} as="h2" style={{ paddingHorizontal: 2, paddingTop: 2 }}>
        {t('speciesAll')}
      </Txt>
      {q.isLoading ? (
        <SkeletonText lines={4} />
      ) : q.isError ? (
        <ErrorState compact error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <HScroll gap={6} style={{ marginInline: -14, paddingInline: 14 }}>
            {FILTERS.map((k) => (
              <FilterChip
                key={k}
                label={t(`filters.${k}`)}
                active={filter === k}
                onPress={() => {
                  setFilter(k);
                  setAll(false);
                }}
                style={filter === k ? undefined : { backgroundColor: c.soft }}
              />
            ))}
          </HScroll>
          <View>
            {rows.map((s, k) => {
              const name = f.lang !== 'en' && s.local_name ? s.local_name : s.name;
              return (
                <Tap
                  key={s.id}
                  href={href('S11', { id: s.id })}
                  label={name}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: c.line, textAlign: 'start' }}>
                  <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: s.cooling === 'high' ? c.limeSoft : c.soft, alignItems: 'center', justifyContent: 'center' }}>
                    <Txt size={12.5} w={700}>
                      {f.loc(k + 1)}
                    </Txt>
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Txt size={14} w={600}>
                      {name}
                      {f.lang === 'en' && s.local_name ? (
                        <Txt as="span" size={14} dim>
                          {' ' + s.local_name}
                        </Txt>
                      ) : null}
                    </Txt>
                    <Txt size={11.5} dim style={{ fontStyle: 'italic' }}>
                      {s.scientific}
                    </Txt>
                    <Txt size={11.5} dim>
                      {[t('canopy', { m: f.loc(s.canopy_m) }), t(`cooling.${s.cooling}`), t(`waterNeed.${s.water}`)].join(' · ')}
                    </Txt>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 2 }}>
                    {s.price ? (
                      <>
                        <Txt size={14} w={600} num lines={1}>
                          {iso(f.money(s.price))}
                        </Txt>
                        <Txt size={10.5} dim lines={1}>
                          {t('perSapling')}
                        </Txt>
                      </>
                    ) : (
                      <Icon d={f.fwdPath} size={16} sw={2} />
                    )}
                  </View>
                </Tap>
              );
            })}
          </View>
          {list.length > 6 ? <GhostButton label={all ? t('showLess') : t('showAll', { n: f.loc(list.length) })} height={44} onPress={() => setAll(!all)} /> : null}
          {q.data ? <SourceChips meta={q.data.meta} /> : null}
        </>
      )}
    </Card>
  );
}
