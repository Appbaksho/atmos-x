'use client';
/** S20 "My trees": 15-day photo status per tree, camera shortcut, and an "Add tree" sheet. */
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import {
  B,
  BottomSheet,
  Card,
  CzButton,
  EmptyState,
  ErrorState,
  Field,
  I,
  Icon,
  R,
  SkeletonCard,
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
import { useAddTree, useSession, useTrees } from '@/lib/data/hooks';
import type { Tree } from '@/lib/data/types';

import { FALLBACK_SPECIES, treeLabel, useSpeciesList, useSpeciesName, useTreeChip } from './trees-common';

export function MyTrees() {
  const t = useTranslations('profile.trees');
  const { f } = useCz();
  const session = useSession();
  const trees = useTrees();
  const chip = useTreeChip();
  const spName = useSpeciesName();
  const [adding, setAdding] = useState(false);
  const list = trees.data ?? [];

  const onAdd = () => (session.isGuest ? requireAccount(t('feature')) : setAdding(true));

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingHorizontal: 4, paddingTop: 4 }}>
        <Txt display size={14} as="h2" style={{ flexShrink: 1 }}>
          {t('count', { n: f.loc(list.length) })}
        </Txt>
        <Tap
          label={t('add')}
          haptic
          onPress={onAdd}
          style={{ height: 40, paddingStart: 10, paddingEnd: 14, borderRadius: R.pill, backgroundColor: B.lime, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon d={I.plus} size={16} sw={2.2} color={B.limeInk} />
          <Txt size={12.5} w={600} color={B.limeInk}>
            {t('add')}
          </Txt>
        </Tap>
      </View>

      {!session.ready || trees.isPending ? (
        <SkeletonCard lines={3} height={200} />
      ) : trees.isError ? (
        <ErrorState error={trees.error} onRetry={() => void trees.refetch()} />
      ) : !list.length ? (
        <EmptyState
          icon={I.tree}
          title={t('empty')}
          sub={session.isGuest ? t('guestSub') : t('emptySub')}
          action={session.isGuest ? t('add') : undefined}
          onAction={session.isGuest ? onAdd : undefined}
        />
      ) : (
        <Card pad={12} gap={8}>
          <View>
            {list.map((tree, i) => (
              <TreeRow key={tree.id} tree={tree} index={i} chip={chip(tree)} name={treeLabel(tree, spName)} species={spName(tree.species_id)} first={i === 0} />
            ))}
          </View>
          <Txt size={11.5} dim style={{ paddingHorizontal: 4 }}>
            {t('rule')}
          </Txt>
        </Card>
      )}

      {!session.isGuest ? <AddTreeSheet open={adding} onClose={() => setAdding(false)} /> : null}
    </View>
  );
}

function TreeRow({ tree, index, chip, name, species, first }: { tree: Tree; index: number; chip: ReturnType<ReturnType<typeof useTreeChip>>; name: string; species: string; first: boolean }) {
  const t = useTranslations('profile.trees');
  const { c, f } = useCz();
  const to = href('tree', { id: tree.id });
  const dot = chip.urgent ? chip.bg : B.lime;
  const dotFg = chip.urgent ? chip.fg : B.limeInk;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: first ? 0 : 1, borderTopColor: c.line }}>
      <Tap
        label={`${name}, ${chip.label}`}
        href={to}
        style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 4, borderRadius: 14, textAlign: 'start' }}>
        <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: dot, alignItems: 'center', justifyContent: 'center' }}>
          <Txt size={12} w={700} num color={dotFg} style={{ lineHeight: '15px' }}>
            {f.loc(index + 1)}
          </Txt>
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Txt size={13.5} w={600} lines={1}>
            {name}
          </Txt>
          <Txt size={11.5} dim lines={1}>
            {t('meta', { species, date: f.date(tree.planted_at, { day: 'numeric', month: 'short' }) })}
          </Txt>
          <Tag label={chip.label} bg={chip.bg} fg={chip.fg} size="xs" />
        </View>
      </Tap>
      <Tap
        label={t('submitA11y', { name })}
        haptic
        href={href('tree', { id: tree.id }, { check: 1 })}
        style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: chip.urgent ? B.navy : c.soft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon d={I.camera} size={18} sw={1.8} color={chip.urgent ? B.lime : c.ink} />
      </Tap>
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
