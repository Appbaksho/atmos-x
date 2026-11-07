'use client';
/**
 * My trees (/app/tree, T1–T4): top strip (planted, alive, points, cooling), a photo grid with each
 * tree's state, a map of pins, trees I help water, and "Add tree". `MyTrees` is the compact version
 * on the profile.
 */
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import {
  B,
  BottomSheet,
  Card,
  CzButton,
  EmptyState,
  ErrorState,
  Field,
  GhostButton,
  I,
  Icon,
  Photo,
  R,
  Screen,
  ScreenHeader,
  Seg,
  SkeletonCard,
  StatTile,
  Tag,
  Tap,
  Txt,
  View,
  href,
  requireAccount,
  toast,
  useCz,
  useLocation,
} from '@/components/cz';
import { MapAttribution, MapView, type MapMarker } from '@/components/map/map-view-lazy';
import { useAddTree, useHelpingTrees, useMyStats, usePhotoUrl, useSession, useTrees } from '@/lib/data/hooks';
import type { LatLng, Tree } from '@/lib/data/types';

import { FALLBACK_SPECIES, treeLabel, useSpeciesList, useSpeciesName, useTreeChip, type TreeChip } from './trees-common';

/** Unsplash sapling (Sehajpal Singh), credited on About; shown until a tree has its own photo. */
const SAPLING = 'https://images.unsplash.com/photo-1683994857980-280afa59a3f8?auto=format&fit=crop&w=480&h=400&q=60';

/* ───────────────────────────── Page ───────────────────────────── */

export function MyTreesScreen() {
  const t = useTranslations('profile.trees');
  const session = useSession();
  const trees = useTrees();
  const helping = useHelpingTrees();
  const [view, setView] = useState<'grid' | 'map'>('grid');
  const [adding, setAdding] = useState(false);
  const list = trees.data ?? [];
  const onAdd = () => (session.isGuest ? requireAccount(t('feature')) : setAdding(true));

  return (
    <Screen tab>
      <ScreenHeader
        title={t('title')}
        back={false}
        big
        right={
          <Tap label={t('add')} haptic onPress={onAdd} style={{ height: 40, paddingStart: 10, paddingEnd: 14, borderRadius: R.pill, backgroundColor: B.lime, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon d={I.plus} size={16} sw={2.2} color={B.limeInk} />
            <Txt size={12.5} w={600} color={B.limeInk}>
              {t('add')}
            </Txt>
          </Tap>
        }
      />
      {session.ready && !session.isGuest ? <Strip /> : null}
      {!session.ready || (!session.isGuest && trees.isPending) ? (
        <SkeletonCard lines={3} height={240} />
      ) : trees.isError ? (
        <ErrorState error={trees.error} onRetry={() => void trees.refetch()} />
      ) : !list.length ? (
        <EmptyState
          icon={I.tree}
          title={t('empty')}
          sub={session.isGuest ? t('guestSub') : t('emptySub')}
          action={session.isGuest ? t('add') : t('plantCta')}
          onAction={session.isGuest ? onAdd : undefined}
          actionHref={session.isGuest ? undefined : href('S14', undefined, { type: 'plant_tree' })}
        />
      ) : (
        <>
          <Seg
            label={t('viewL')}
            options={[
              { label: t('grid'), value: 'grid' },
              { label: t('map'), value: 'map' },
            ]}
            value={view}
            onChange={setView}
          />
          {view === 'grid' ? <Grid trees={list} /> : <TreesMap trees={list} />}
          <Txt size={11.5} dim style={{ paddingHorizontal: 4 }}>
            {t('rule')}
          </Txt>
        </>
      )}
      {helping.data?.length ? (
        <View style={{ gap: 8 }}>
          <Txt label as="h2" style={{ paddingHorizontal: 4 }}>
            {t('helping')}
          </Txt>
          <Grid trees={helping.data} />
        </View>
      ) : null}
      {session.ready && !session.isGuest ? <AddTreeSheet open={adding} onClose={() => setAdding(false)} /> : null}
    </Screen>
  );
}

/** T1: trees planted, alive, total points, estimated cooling added. */
function Strip() {
  const t = useTranslations('profile.trees');
  const { c, f } = useCz();
  const stats = useMyStats();
  if (stats.isPending) return <SkeletonCard lines={1} height={72} />;
  if (stats.isError || !stats.data) return null;
  const s = stats.data;
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      <StatTile label={t('stripPlanted')} value={f.loc(s.trees)} />
      <StatTile label={t('stripAlive')} value={f.loc(s.trees_alive)} />
      <StatTile label={t('stripPoints')} value={f.num(s.points.earned)} sub={s.points.pending ? t('stripPending', { n: f.num(s.points.pending) }) : undefined} />
      <StatTile label={t('stripCooling')} value={s.cooling_c > 0 ? f.dC(-s.cooling_c, s.cooling_c < 0.01 ? 4 : 3) : '–'} color={c.leaf} />
    </View>
  );
}

/* ───────────────────────────── Grid (T2) ───────────────────────────── */

function Grid({ trees }: { trees: readonly Tree[] }) {
  const chip = useTreeChip();
  const spName = useSpeciesName();
  return (
    <View role="list" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
      {trees.map((tree) => (
        <TreeTile key={tree.id} tree={tree} chip={chip(tree)} name={treeLabel(tree, spName)} species={spName(tree.species_id)} />
      ))}
    </View>
  );
}

function TreeTile({ tree, chip, name, species }: { tree: Tree; chip: TreeChip; name: string; species: string }) {
  const t = useTranslations('profile.trees');
  const { c, f } = useCz();
  const src = usePhotoUrl(tree.photo_url) ?? SAPLING;
  return (
    <View role="listitem" style={{ backgroundColor: c.card, borderRadius: R.lg, overflow: 'hidden' }}>
      <Tap label={`${name}, ${chip.label}`} href={href('tree', { id: tree.id })} style={{ textAlign: 'start' }}>
        <Photo src={src} label="" style={{ height: 120, backgroundColor: B.photoBg2 }}>
          <View style={{ position: 'absolute', top: 8, start: 8, end: 8 }}>
            <Tag label={chip.label} bg={chip.bg} fg={chip.fg} size="xs" />
          </View>
        </Photo>
        <View style={{ padding: 10, gap: 2 }}>
          <Txt size={13.5} w={600} lines={1}>
            {name}
          </Txt>
          <Txt size={11.5} dim lines={1}>
            {t('tileMeta', { species, age: f.loc(tree.age_days), count: tree.age_days })}
          </Txt>
        </View>
      </Tap>
      {chip.urgent && tree.state !== 'verifying' ? (
        <Tap
          label={t('submitA11y', { name })}
          haptic
          href={href('tree', { id: tree.id }, { check: 1 })}
          style={{ position: 'absolute', top: 76, end: 8, width: 38, height: 38, borderRadius: 19, backgroundColor: B.navy, alignItems: 'center', justifyContent: 'center' }}>
          <Icon d={I.camera} size={17} sw={1.8} color={B.lime} />
        </Tap>
      ) : null}
    </View>
  );
}

/* ───────────────────────────── Map (T4) ───────────────────────────── */

function TreesMap({ trees }: { trees: readonly Tree[] }) {
  const t = useTranslations('profile.trees');
  const chip = useTreeChip();
  const spName = useSpeciesName();
  const { focus } = useLocation();
  const pins = trees.filter((x): x is Tree & { location: LatLng } => !!x.location);
  const { center, radius } = useMemo(() => {
    if (!pins.length) return { center: focus, radius: 500 };
    const lat = pins.reduce((a, p) => a + p.location.lat, 0) / pins.length;
    const lng = pins.reduce((a, p) => a + p.location.lng, 0) / pins.length;
    const far = Math.max(...pins.map((p) => Math.hypot((p.location.lat - lat) * 111_000, (p.location.lng - lng) * 111_000 * Math.cos((lat * Math.PI) / 180))));
    return { center: { lat, lng }, radius: Math.max(250, far * 1.3) };
  }, [pins, focus]);
  const markers: MapMarker[] = pins.map((p) => {
    const ch = chip(p);
    return {
      id: p.id,
      at: p.location,
      anchor: 'bottom',
      node: (
        <a href={href('tree', { id: p.id })} aria-label={`${treeLabel(p, spName)}, ${ch.label}`} style={{ display: 'block' }}>
          <span style={{ display: 'flex', width: 30, height: 30, borderRadius: 15, background: ch.urgent ? ch.bg : B.lime, border: '2px solid #fff', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(0,0,0,.3)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={ch.urgent ? ch.fg : B.limeInk} strokeWidth="2" aria-hidden>
              <path d={I.tree} />
            </svg>
          </span>
        </a>
      ),
    };
  });
  return (
    <View style={{ gap: 6 }}>
      <View style={{ height: 'min(56vh, 460px)', minHeight: 300, borderRadius: R.xl, overflow: 'hidden' }}>
        <MapView center={center} radiusM={radius} showCircle={false} markers={markers} label={t('mapLabel', { n: pins.length })} />
        <MapAttribution style={{ position: 'absolute', bottom: 8, end: 8 }} />
      </View>
      {pins.length < trees.length ? (
        <Txt size={11.5} dim style={{ paddingHorizontal: 4 }}>
          {t('mapMissing', { n: trees.length - pins.length })}
        </Txt>
      ) : null}
    </View>
  );
}

/* ───────────────────────────── Profile (compact) ───────────────────────────── */

export function MyTrees() {
  const t = useTranslations('profile.trees');
  const { f } = useCz();
  const session = useSession();
  const trees = useTrees();
  const [adding, setAdding] = useState(false);
  const list = trees.data ?? [];
  const onAdd = () => (session.isGuest ? requireAccount(t('feature')) : setAdding(true));

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingHorizontal: 4, paddingTop: 4 }}>
        <Txt display size={14} as="h2" style={{ flexShrink: 1 }}>
          {t('count', { n: f.loc(list.length) })}
        </Txt>
        <Tap label={t('add')} haptic onPress={onAdd} style={{ height: 40, paddingStart: 10, paddingEnd: 14, borderRadius: R.pill, backgroundColor: B.lime, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon d={I.plus} size={16} sw={2.2} color={B.limeInk} />
          <Txt size={12.5} w={600} color={B.limeInk}>
            {t('add')}
          </Txt>
        </Tap>
      </View>
      {!session.ready || (!session.isGuest && trees.isPending) ? (
        <SkeletonCard lines={3} height={200} />
      ) : trees.isError ? (
        <ErrorState error={trees.error} onRetry={() => void trees.refetch()} />
      ) : !list.length ? (
        <EmptyState icon={I.tree} title={t('empty')} sub={session.isGuest ? t('guestSub') : t('emptySub')} action={session.isGuest ? t('add') : undefined} onAction={session.isGuest ? onAdd : undefined} />
      ) : (
        <Card pad={12} gap={10}>
          <Grid trees={list.slice(0, 4)} />
          <GhostButton label={t('seeAll', { n: f.loc(list.length) })} height={44} href={href('trees')} />
        </Card>
      )}
      {session.ready && !session.isGuest ? <AddTreeSheet open={adding} onClose={() => setAdding(false)} /> : null}
    </View>
  );
}

/* ───────────────────────────── Add tree ───────────────────────────── */

const todayIso = () => new Date().toISOString().slice(0, 10);

function AddTreeSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('profile.trees');
  const tc = useTranslations('common');
  const { c, f } = useCz();
  const { focus, placeName } = useLocation();
  const list = useSpeciesList();
  const spName = useSpeciesName();
  const add = useAddTree();
  const ids = (list?.length ? list.map((s) => s.id) : FALLBACK_SPECIES).slice(0, 10);
  const [sp, setSp] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [date, setDate] = useState(todayIso);
  const species = sp ?? ids[0];

  const save = () => {
    if (!species) return;
    add.mutate(
      { species_id: species, nickname: name.trim() || undefined, planted_at: new Date(`${date}T08:00:00`).toISOString(), location: focus },
      {
        onSuccess: (tree) => {
          toast(t('saved', { name: tree.nickname || spName(tree.species_id) }), { tone: 'success' });
          setName('');
          setSp(null);
          setDate(todayIso());
          onClose();
        },
        onError: () => toast(tc('error.title'), { tone: 'warn' }),
      },
    );
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t('addTitle')}
      sub={t('addSub')}
      footer={<CzButton label={t('save')} icon="check" onPress={save} busy={add.isPending} disabled={!species} />}>
      <View style={{ gap: 14 }}>
        <Field label={t('nameL')} value={name} onChangeText={setName} placeholder={t('namePh')} maxLength={40} hint={t('regNote')} />
        <View style={{ gap: 8 }}>
          <Txt label as="h3">
            {t('species')}
          </Txt>
          <View role="radiogroup" label={t('species')} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {ids.map((id) => {
              const on = species === id;
              return (
                <Tap
                  key={id}
                  role="radio"
                  selected={on}
                  label={spName(id)}
                  haptic
                  onPress={() => setSp(id)}
                  style={{ minHeight: 40, paddingHorizontal: 14, borderRadius: R.pill, backgroundColor: on ? B.lime : c.soft, justifyContent: 'center' }}>
                  <Txt size={12.5} w={600} color={on ? B.limeInk : c.ink}>
                    {spName(id)}
                  </Txt>
                </Tap>
              );
            })}
          </View>
        </View>
        <Field label={t('date')} type="date" value={date} max={todayIso()} onChangeText={(v) => setDate(v || todayIso())} />
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
          <Icon d={I.pin} size={16} sw={2} color={c.ink2} />
          <Txt size={12} dim style={{ flex: 1 }}>
            {t('whereNote', { place: placeName ?? `${f.dec(focus.lat, 4)}, ${f.dec(focus.lng, 4)}` })}
          </Txt>
        </View>
      </View>
    </BottomSheet>
  );
}
