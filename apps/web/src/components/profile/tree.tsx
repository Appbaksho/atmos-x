'use client';
/** Tree detail (/app/tree/[id]): photo hero, stats, guided 15-day photo → AI health verdict + tip → points, photo history. */
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { Camera, type CameraCapture } from '@/components/camera';
import {
  B,
  BottomSheet,
  Card,
  CzButton,
  EmptyState,
  ErrorState,
  GhostButton,
  I,
  Icon,
  LightStatusBar,
  Photo,
  R,
  Screen,
  ScreenHeader,
  SkeletonCard,
  SourceChips,
  Spinner,
  Tag,
  Tap,
  Txt,
  View,
  goBack,
  goReplace,
  href,
  requireAccount,
  toast,
  useCz,
} from '@/components/cz';
import { TREE_CHECK_POINTS, usePhotoUrl, useRemoveTree, useSession, useTree, useTreeCheck } from '@/lib/data/hooks';
import type { Tree, TreeCheck, TreeHealth } from '@/lib/data/types';

import { treeLabel, useScientific, useSpeciesName, useTreeChip } from './trees-common';

/** Unsplash sapling (Sehajpal Singh), credited on About; shown until the tree has its own photo. */
const SAPLING = 'https://images.unsplash.com/photo-1683994857980-280afa59a3f8?auto=format&fit=crop&w=900&h=760&q=70';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
/** Guided-shot icons: whole tree, leaf close-up, soil at the base. */
const SHOT_ICONS = ['M12 21v-5M12 3l6 9h-3l4 4H5l4-4H6z', 'M5 19c0-8 5-14 14-14 0 9-6 14-14 14zM5 19l7-7', 'M4 20h16M7 20c0-3 2-5 5-5s5 2 5 5M12 15V9'];
const DAY = 864e5;

type Phase = { k: 'idle' } | { k: 'busy' } | { k: 'done'; check: TreeCheck };

export function TreeScreen({ id, openCheck }: { id: string; openCheck?: boolean }) {
  const t = useTranslations('profile');
  const session = useSession();
  const tree = useTree(id);

  if (!session.ready || tree.isPending) {
    return (
      <Screen>
        <ScreenHeader title={t('tree.back')} />
        <SkeletonCard lines={3} height={280} />
        <SkeletonCard lines={3} />
      </Screen>
    );
  }
  if (tree.isError) {
    return (
      <Screen>
        <ScreenHeader title={t('tree.back')} />
        <ErrorState error={tree.error} onRetry={() => void tree.refetch()} />
      </Screen>
    );
  }
  if (!tree.data) {
    return (
      <Screen>
        <ScreenHeader title={t('tree.back')} />
        <EmptyState
          icon={I.tree}
          title={t('trees.empty')}
          sub={session.isGuest ? t('trees.guestSub') : t('tree.notFound')}
          action={session.isGuest ? t('guestCta') : t('tree.back')}
          onAction={session.isGuest ? () => requireAccount(t('tree.feature')) : undefined}
          actionHref={session.isGuest ? undefined : href('S20')}
        />
      </Screen>
    );
  }
  return <TreeBody tree={tree.data} openCheck={!!openCheck} />;
}

function TreeBody({ tree, openCheck }: { tree: Tree; openCheck: boolean }) {
  const t = useTranslations('profile.tree');
  const tp = useTranslations('profile');
  const { c, f } = useCz();
  const session = useSession();
  const spName = useSpeciesName();
  const scientific = useScientific();
  const chipOf = useTreeChip();
  const check = useTreeCheck();
  const [phase, setPhase] = useState<Phase>({ k: 'idle' });
  const [camOpen, setCamOpen] = useState(false);
  const opened = useRef(false);

  const name = treeLabel(tree, spName);
  const chip = chipOf(tree);
  const checks = tree.checks ?? [];
  const latestPhoto = checks.find((x) => x.photo_url)?.photo_url ?? tree.photo_url;
  const heroSrc = usePhotoUrl(latestPhoto) ?? SAPLING;
  const [now] = useState(() => Date.now());
  const age = Math.max(0, Math.floor((now - new Date(tree.planted_at).getTime()) / DAY));
  const photos = checks.filter((x) => x.photo_url).length + (tree.photo_url && !checks.some((x) => x.photo_url === tree.photo_url) ? 1 : 0);
  const sci = scientific(tree.species_id);

  useEffect(() => {
    if (openCheck && !opened.current && !session.isGuest) {
      opened.current = true;
      setCamOpen(true);
    }
  }, [openCheck, session.isGuest]);

  const start = () => {
    if (session.isGuest) return requireAccount(t('feature'));
    setCamOpen(true);
  };

  const onCapture = async (cap: CameraCapture) => {
    setCamOpen(false);
    setPhase({ k: 'busy' });
    try {
      const res = await check.mutateAsync({ tree_id: tree.id, photo: cap.blob });
      setPhase({ k: 'done', check: res });
    } catch {
      setPhase({ k: 'idle' });
      toast(tp('tree.noAi'), { tone: 'warn' });
    }
  };

  const stats: [string, string][] = [
    [t('age'), t('days', { count: age, n: f.loc(age) })],
    [t('photos'), f.loc(photos)],
    [t('next'), f.date(tree.next_due_at, { day: 'numeric', month: 'short' })],
    [t('health'), t(`healthShort.${tree.health}`)],
  ];

  return (
    <Screen bleed>
      <LightStatusBar />
      <Photo
        src={heroSrc}
        label={t('photoA11y', { name })}
        priority
        scrim={[
          [0, 0.5],
          [0.32, 0],
          [1, 0.88],
        ]}
        style={{ height: 'calc(env(safe-area-inset-top, 0px) + 284px)' }}>
        <Tap
          label={t('back')}
          haptic
          onPress={goBack}
          style={{
            position: 'absolute',
            top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
            start: 16,
            height: 44,
            paddingStart: 12,
            paddingEnd: 16,
            borderRadius: R.pill,
            borderWidth: 1,
            borderColor: B.glassLine,
            backgroundColor: B.glass,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
          }}>
          <Icon d={f.backPath} size={18} sw={2} color={B.white} />
          <Txt size={13} w={600} color={B.white}>
            {t('back')}
          </Txt>
        </Tap>
        <View style={{ position: 'absolute', start: 20, end: 20, bottom: 20, gap: 8, pointerEvents: 'none' }}>
          <Tag label={chip.label} bg={chip.bg} fg={chip.fg} />
          <Txt display size={28} color={B.white} as="h1" style={{ lineHeight: '32px' }}>
            {name}
          </Txt>
          <Txt size={13} color="rgba(255,255,255,0.92)">
            {[spName(tree.species_id), sci].filter(Boolean).join(' · ')}
          </Txt>
          <Txt size={11.5} w={600} color="rgba(255,255,255,0.85)" style={{ fontFamily: MONO, direction: 'ltr', textAlign: 'start' }}>
            {tree.id}
          </Txt>
        </View>
      </Photo>

      <View style={{ paddingHorizontal: 16, gap: 14 }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {stats.map(([label, val]) => (
            <View key={label} style={{ flex: 1, minWidth: 0, backgroundColor: c.card, borderRadius: R.md, paddingVertical: 10, paddingHorizontal: 8, gap: 2 }}>
              <Txt size={10.5} dim lines={1}>
                {label}
              </Txt>
              <Txt size={14} w={600} num lines={1}>
                {val}
              </Txt>
            </View>
          ))}
        </View>

        {phase.k === 'idle' ? (
          <Card style={chip.urgent ? { borderWidth: 2, borderColor: chip.bg } : undefined}>
            <View style={{ gap: 3 }}>
              <Txt label>{chip.urgent ? t('nextT', { status: chip.label }) : t('nextOk', { status: chip.label })}</Txt>
              <Txt size={15} w={600}>
                {t('what')}
              </Txt>
            </View>
            {(['s1', 's2', 's3'] as const).map((k, i) => (
              <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.soft, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon d={SHOT_ICONS[i]} size={20} sw={1.7} />
                  <View style={{ position: 'absolute', top: -4, end: -4, width: 18, height: 18, borderRadius: 9, backgroundColor: B.navy, alignItems: 'center', justifyContent: 'center' }}>
                    <Txt size={10} w={700} color={B.lime} style={{ lineHeight: '13px' }}>
                      {f.loc(i + 1)}
                    </Txt>
                  </View>
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                  <Txt size={13.5} w={600}>
                    {t(k)}
                  </Txt>
                  <Txt size={11.5} dim>
                    {t(`${k}s`)}
                  </Txt>
                </View>
              </View>
            ))}
            <CzButton label={t('take')} icon="camera" onPress={start} />
          </Card>
        ) : null}

        {phase.k === 'busy' ? (
          <View role="status" style={{ backgroundColor: B.navy, borderRadius: R.xl, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Spinner size={40} color={B.lime} />
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <Txt size={14} w={600} color={B.white}>
                {t('busy')}
              </Txt>
              <Txt size={12} color="rgba(255,255,255,0.75)">
                {t('busySub', { name })}
              </Txt>
            </View>
          </View>
        ) : null}

        {phase.k === 'done' ? <Verdict check={phase.check} tree={tree} name={name} onAgain={() => setPhase({ k: 'idle' })} /> : null}

        <History tree={tree} />

        <RemoveTree tree={tree} name={name} />
      </View>

      <Camera open={camOpen} onClose={() => setCamOpen(false)} onCapture={onCapture} title={t('take')} />
    </Screen>
  );
}

/* ───────────────────────────── Verdict ───────────────────────────── */

function Verdict({ check, tree, name, onAgain }: { check: TreeCheck; tree: Tree; name: string; onAgain: () => void }) {
  const t = useTranslations('profile.tree');
  const { c, f } = useCz();
  const ai = check.ai;
  const health: TreeHealth = ai?.health ?? check.health;
  const color = health === 'healthy' ? B.lime : health === 'stressed' ? B.orange : B.red;
  const next = new Date(new Date(check.created_at).getTime() + 15 * DAY).toISOString();
  return (
    <Card gap={14}>
      <View role="status" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
          <View style={{ width: 20, height: 20, borderRadius: 6, backgroundColor: B.navy, alignItems: 'center', justifyContent: 'center' }}>
            <Txt size={9} w={700} color={B.lime} style={{ lineHeight: '12px' }}>
              AI
            </Txt>
          </View>
          <Txt label>{t('aiT')}</Txt>
        </View>
        {ai ? (
          <Txt size={11.5} dim>
            {t('conf', { n: f.loc(Math.round(ai.confidence * 100)) })}
          </Txt>
        ) : null}
      </View>

      {ai ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
              <Icon d={health === 'healthy' ? I.check : health === 'stressed' ? I.warn : I.close} size={26} sw={2.6} color={health === 'healthy' ? B.limeInk : B.white} />
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Txt size={18} w={600}>
                {t(`verdict.${health}`)}
              </Txt>
              <Txt size={12.5} dim>
                {t(`verdictSub.${health}`)}
              </Txt>
            </View>
          </View>
          {ai.seen ? (
            <View style={{ gap: 4, paddingTop: 10, borderTopWidth: 1, borderTopColor: c.line }}>
              <Txt size={12} dim>
                {t('seen')}
              </Txt>
              <Txt size={13.5}>{ai.seen}</Txt>
            </View>
          ) : null}
          {ai.tip ? (
            <View style={{ gap: 8, padding: 14, borderRadius: 18, backgroundColor: c.limeSoft }}>
              <Txt size={13.5} w={700}>
                {t('tip', { name })}
              </Txt>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Txt size={13} w={700} color={c.leaf}>
                  {f.rtl ? '←' : '→'}
                </Txt>
                <Txt size={13} style={{ flex: 1, minWidth: 0 }}>
                  {ai.tip}
                </Txt>
              </View>
            </View>
          ) : null}
          <SourceChips meta={ai.meta} ai />
        </>
      ) : (
        <Txt size={13} dim>
          {t('noAi')}
        </Txt>
      )}

      <Txt size={12.5} dim>
        {t('nextOn', { date: f.date(tree.next_due_at || next, { day: 'numeric', month: 'short' }) })}
      </Txt>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <Txt size={12.5} w={600} color={c.leaf} style={{ flexShrink: 1 }}>
          {t('pts', { pts: f.loc(check.points || TREE_CHECK_POINTS) })}
        </Txt>
        <GhostButton label={t('again')} onPress={onAgain} height={38} style={{ paddingHorizontal: 14 }} />
      </View>
    </Card>
  );
}

/* ───────────────────────────── History ───────────────────────────── */

function History({ tree }: { tree: Tree }) {
  const t = useTranslations('profile.tree');
  const checks = tree.checks ?? [];
  return (
    <Card pad={0} gap={0} style={{ paddingVertical: 6, paddingHorizontal: 16 }}>
      <Txt label as="h2" style={{ paddingTop: 10, paddingBottom: 4 }}>
        {t('hist')}
      </Txt>
      {checks.map((x) => (
        <HistRow key={x.id} label={x.ai ? t('hCheckAi', { verdict: t(`verdict.${x.ai.health}`) }) : t('hCheck')} date={x.created_at} photo={x.photo_url} health={x.health} />
      ))}
      <HistRow label={t('hPlant')} date={tree.planted_at} photo={checks.length ? null : tree.photo_url} health="healthy" />
    </Card>
  );
}

function HistRow({ label, date, photo, health }: { label: string; date: string; photo: string | null; health: TreeHealth }) {
  const { c, f } = useCz();
  const src = usePhotoUrl(photo);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.line }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" width={36} height={36} style={{ width: 36, height: 36, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
      ) : (
        <View style={{ width: 26, height: 26, marginInline: 5, borderRadius: 13, backgroundColor: health === 'healthy' ? c.limeSoft : 'rgba(242,154,56,0.3)', alignItems: 'center', justifyContent: 'center' }}>
          <Icon d={health === 'healthy' ? I.checkSm : I.warn} size={14} sw={2.4} />
        </View>
      )}
      <Txt size={13} w={500} style={{ flex: 1, minWidth: 0 }}>
        {label}
      </Txt>
      <Txt size={12} dim num>
        {f.date(date, { day: 'numeric', month: 'short' })}
      </Txt>
    </View>
  );
}

/* ───────────────────────────── Remove ───────────────────────────── */

function RemoveTree({ tree, name }: { tree: Tree; name: string }) {
  const t = useTranslations('profile.tree');
  const tc = useTranslations('common');
  const remove = useRemoveTree();
  const [open, setOpen] = useState(false);
  return (
    <>
      <GhostButton label={t('remove')} height={44} color={B.red} onPress={() => setOpen(true)} style={{ borderWidth: 0 }} />
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title={t('removeTitle', { name })}
        footer={
          <View style={{ gap: 8 }}>
            <CzButton
              label={t('remove')}
              variant="navy"
              busy={remove.isPending}
              onPress={() =>
                remove.mutate(tree.id, {
                  onSuccess: () => {
                    setOpen(false);
                    toast(t('removed', { name }));
                    goReplace('S20');
                  },
                })
              }
            />
            <GhostButton label={tc('cancel')} height={46} onPress={() => setOpen(false)} />
          </View>
        }>
        <Txt size={13.5} dim>
          {t('removeBody')}
        </Txt>
      </BottomSheet>
    </>
  );
}
