'use client';
/**
 * Tree detail (/app/tree/[id], T5/T6): photo hero, state, guided 15-day check-in (photo → own health
 * report → optional height) with the server's deterministic checks, care tips from species, month and
 * recent rain, the photo timeline from planting day, invite a friend to water it.
 */
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { ChecksList } from '@/components/act/checks';
import { SharePostButton } from '@/components/community/share-post';
import { Camera, type CameraCapture } from '@/components/camera';
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
  LightStatusBar,
  OptionRow,
  Photo,
  R,
  Screen,
  ScreenHeader,
  SkeletonCard,
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
import { TREE_CHECK_POINTS, daysUntilDue, isGuestRestricted, usePhotoUrl, useRemoveTree, useSession, useTree, useTreeCheck, useTreeInvite, useUpdateTree } from '@/lib/data/hooks';
import type { Tree, TreeCheck, TreeHealth } from '@/lib/data/types';

import { useCodeText } from './codes';
import { treeLabel, useScientific, useSpeciesName, useTreeChip } from './trees-common';

/** Unsplash sapling (Sehajpal Singh), credited on About; shown until the tree has its own photo. */
const SAPLING = 'https://images.unsplash.com/photo-1683994857980-280afa59a3f8?auto=format&fit=crop&w=900&h=760&q=70';
/** Guided-shot icons: whole tree, leaf close-up, soil at the base. */
const SHOT_ICONS = ['M12 21v-5M12 3l6 9h-3l4 4H5l4-4H6z', 'M5 19c0-8 5-14 14-14 0 9-6 14-14 14zM5 19l7-7', 'M4 20h16M7 20c0-3 2-5 5-5s5 2 5 5M12 15V9'];
const HEALTHS: TreeHealth[] = ['healthy', 'stressed', 'dead'];
/** T3: a tree more than 45 days overdue can be marked lost by its owner. */
const LOST_AFTER_DAYS = 45;

type Phase = { k: 'idle' } | { k: 'form'; cap: CameraCapture & { url: string } } | { k: 'done'; check: TreeCheck; tree: Tree };

export function TreeScreen({ id, openCheck }: { id: string; openCheck?: boolean }) {
  const t = useTranslations('profile');
  const session = useSession();
  const tree = useTree(session.isGuest ? null : id);

  if (!session.ready || (!session.isGuest && tree.isPending)) {
    return (
      <Screen>
        <ScreenHeader title={t('tree.back')} />
        <SkeletonCard lines={3} height={280} />
        <SkeletonCard lines={3} />
      </Screen>
    );
  }
  if (tree.isError && !isGuestRestricted(tree.error)) {
    return (
      <Screen>
        <ScreenHeader title={t('tree.back')} />
        <ErrorState error={tree.error} title={(tree.error as { status?: number })?.status === 404 ? t('tree.notFound') : undefined} onRetry={() => void tree.refetch()} />
        <GhostButton label={t('tree.allTrees')} href={href('trees')} />
      </Screen>
    );
  }
  if (session.isGuest || !tree.data) {
    return (
      <Screen>
        <ScreenHeader title={t('tree.back')} />
        <EmptyState
          icon={I.tree}
          title={t('trees.empty')}
          sub={session.isGuest ? t('trees.guestSub') : t('tree.notFound')}
          action={session.isGuest ? t('guestCta') : t('tree.allTrees')}
          onAction={session.isGuest ? () => requireAccount(t('tree.feature')) : undefined}
          actionHref={session.isGuest ? undefined : href('trees')}
        />
      </Screen>
    );
  }
  return <TreeBody tree={tree.data} openCheck={!!openCheck} />;
}

function TreeBody({ tree, openCheck }: { tree: Tree; openCheck: boolean }) {
  const t = useTranslations('profile.tree');
  const { c, f } = useCz();
  const spName = useSpeciesName();
  const scientific = useScientific();
  const chipOf = useTreeChip();
  const [phase, setPhase] = useState<Phase>({ k: 'idle' });
  const [camOpen, setCamOpen] = useState(false);
  const opened = useRef(false);

  const name = treeLabel(tree, spName);
  const chip = chipOf(tree);
  const heroSrc = usePhotoUrl(tree.photo_url) ?? SAPLING;
  const checks = tree.checks ?? [];
  const height = checks.find((x) => x.height_cm != null)?.height_cm ?? null;
  const sci = scientific(tree.species_id);
  const overdue = -daysUntilDue(tree.next_due_at);

  useEffect(() => {
    if (openCheck && !opened.current && tree.state !== 'lost') {
      opened.current = true;
      setCamOpen(true);
    }
  }, [openCheck, tree.state]);

  useEffect(() => () => void (phase.k === 'form' && URL.revokeObjectURL(phase.cap.url)), [phase]);

  const onCapture = (cap: CameraCapture) => {
    setCamOpen(false);
    setPhase({ k: 'form', cap: { ...cap, url: URL.createObjectURL(cap.blob) } });
  };

  const stats: [string, string][] = [
    [t('age'), t('days', { count: tree.age_days, n: f.loc(tree.age_days) })],
    [t('height'), height != null ? t('cm', { n: f.loc(Math.round(height)) }) : '–'],
    [t('next'), f.date(tree.next_due_at, { day: 'numeric', month: 'short' })],
    [t('checkins'), f.loc(checks.length)],
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
            {[spName(tree.species_id), sci, t('planted', { date: f.date(tree.planted_at, { day: 'numeric', month: 'short', year: 'numeric' }) })].filter(Boolean).join(' · ')}
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

        <StateNote tree={tree} name={name} overdue={overdue} />

        {phase.k === 'idle' && tree.state !== 'lost' ? (
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
            <CzButton label={t('take')} icon="camera" onPress={() => setCamOpen(true)} />
          </Card>
        ) : null}

        {phase.k === 'form' ? <CheckForm tree={tree} cap={phase.cap} onCancel={() => setPhase({ k: 'idle' })} onDone={(res) => setPhase({ k: 'done', check: res.check!, tree: res })} /> : null}

        {phase.k === 'done' ? <Result check={phase.check} tree={phase.tree} name={name} onAgain={() => setPhase({ k: 'idle' })} /> : null}

        <Tips tree={tree} name={name} />

        <Cooling tree={tree} />

        <Timeline tree={tree} />

        {tree.mine ? <SharePostButton treeId={tree.id} actionId={tree.verified ? tree.action_id : null} defaultBody={t('shareBody', { name })} /> : null}
        {tree.mine ? <InviteFriend tree={tree} name={name} /> : null}
        {tree.mine ? <RemoveTree tree={tree} name={name} /> : null}
      </View>

      <Camera open={camOpen} onClose={() => setCamOpen(false)} onCapture={onCapture} title={t('take')} />
    </Screen>
  );
}

/* ───────────────────────────── State note ───────────────────────────── */

function StateNote({ tree, name, overdue }: { tree: Tree; name: string; overdue: number }) {
  const t = useTranslations('profile.tree');
  const update = useUpdateTree();
  const { c } = useCz();
  if (tree.state === 'verifying') {
    return (
      <Card tone="limeSoft" gap={6} style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <Icon d={I.clock} size={18} sw={2} />
        <Txt size={13} style={{ flex: 1 }}>
          {t('verifyingNote')}
        </Txt>
      </Card>
    );
  }
  if (tree.state === 'lost') {
    return (
      <Card gap={10}>
        <Txt size={15} w={600}>
          {t('lostTitle', { name })}
        </Txt>
        <Txt size={13} dim>
          {t('lostSub')}
        </Txt>
        <CzButton label={t('replant')} icon="plus" size="md" href={href('S14', undefined, { type: 'plant_tree', species: tree.species_id })} />
      </Card>
    );
  }
  if (tree.state === 'at_risk' && tree.mine && overdue > LOST_AFTER_DAYS) {
    return (
      <Card gap={10} style={{ borderWidth: 2, borderColor: B.deepRed }}>
        <Txt size={14} w={600}>
          {t('stillThere', { name })}
        </Txt>
        <Txt size={12.5} dim>
          {t('stillThereSub')}
        </Txt>
        {update.isError ? <ErrorState compact error={update.error} /> : null}
        <GhostButton label={t('markLost')} height={44} disabled={update.isPending} onPress={() => update.mutate({ id: tree.id, patch: { lost_confirmed: true } })} />
      </Card>
    );
  }
  if (tree.state === 'needs_water') {
    const t2 = tree.rain_7d_mm;
    return (
      <Card gap={6} style={{ flexDirection: 'row', alignItems: 'flex-start', backgroundColor: 'rgba(242,154,56,0.16)' }}>
        <Icon d={I.drop} size={18} sw={2} color={c.ink} />
        <Txt size={13} style={{ flex: 1 }}>
          {t2 != null ? t('waterNote', { mm: Math.round(t2) }) : t('waterNoteStressed')}
        </Txt>
      </Card>
    );
  }
  return null;
}

/* ───────────────────────────── Check-in form ───────────────────────────── */

function CheckForm({ tree, cap, onCancel, onDone }: { tree: Tree; cap: CameraCapture & { url: string }; onCancel: () => void; onDone: (t: Tree) => void }) {
  const t = useTranslations('profile.tree');
  const { f } = useCz();
  const check = useTreeCheck();
  const [health, setHealth] = useState<TreeHealth>('healthy');
  const [height, setHeight] = useState('');
  const [note, setNote] = useState('');
  const h = Number(height.replace(',', '.'));
  const heightOk = height.trim() === '' || (Number.isFinite(h) && h > 0 && h < 5000);

  const submit = () =>
    check.mutate(
      {
        tree_id: tree.id,
        photo: cap.blob,
        health,
        height_cm: height.trim() && heightOk ? h : null,
        note: note.trim() || null,
        location: cap.lat != null && cap.lng != null ? { lat: cap.lat, lng: cap.lng } : null,
      },
      { onSuccess: (res) => onDone(res) },
    );

  if (check.isPending) {
    return (
      <View role="status" style={{ backgroundColor: B.navy, borderRadius: R.xl, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Spinner size={40} color={B.lime} />
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Txt size={14} w={600} color={B.white}>
            {t('busy')}
          </Txt>
          <Txt size={12} color="rgba(255,255,255,0.75)">
            {t('busySub')}
          </Txt>
        </View>
      </View>
    );
  }

  return (
    <Card gap={12}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
        <img src={cap.url} alt={t('captured')} width={72} height={72} style={{ width: 72, height: 72, borderRadius: 14, objectFit: 'cover' }} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Txt size={14} w={600}>
            {t('howIsIt')}
          </Txt>
          <Txt size={12} dim>
            {f.date(cap.takenAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </Txt>
        </View>
      </View>
      <View role="radiogroup" label={t('howIsIt')} style={{ gap: 6 }}>
        {HEALTHS.map((x) => (
          <OptionRow key={x} title={t(`verdict.${x}`)} sub={t(`healthHint.${x}`)} selected={health === x} onPress={() => setHealth(x)} />
        ))}
      </View>
      <Field label={t('heightL')} value={height} onChangeText={setHeight} keyboardType="decimal-pad" placeholder={t('heightPh')} error={heightOk ? undefined : t('heightBad')} maxLength={6} />
      <Field label={t('noteL')} value={note} onChangeText={setNote} multiline maxLength={280} />
      {check.isError && !isGuestRestricted(check.error) ? <ErrorState compact error={check.error} title={t('failed')} /> : null}
      <CzButton label={t('submit')} icon="check" onPress={submit} disabled={!heightOk} />
      <GhostButton label={t('cancel')} height={44} onPress={onCancel} />
    </Card>
  );
}

/* ───────────────────────────── Result ───────────────────────────── */

function Result({ check, tree, name, onAgain }: { check: TreeCheck; tree: Tree; name: string; onAgain: () => void }) {
  const t = useTranslations('profile.tree');
  const { c, f } = useCz();
  const { text } = useCodeText();
  const health = check.health;
  const color = health === 'healthy' ? B.lime : health === 'stressed' ? B.orange : B.red;
  const head = useRef<HTMLDivElement>(null);
  useEffect(() => head.current?.focus(), []);
  // Milestones stamped by this check-in (same server transaction).
  const reached = (['d90', 'y1'] as const).filter((m) => tree.milestones[m] && Math.abs(Date.parse(tree.milestones[m]!) - Date.parse(check.created_at)) < 120_000);
  return (
    <Card gap={14}>
      <div ref={head} tabIndex={-1} role="status" style={{ outline: 'none', display: 'flex', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
          <Icon d={health === 'healthy' ? I.check : health === 'stressed' ? I.warn : I.close} size={26} sw={2.6} color={health === 'healthy' ? B.limeInk : B.white} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Txt size={18} w={600}>
            {t('saved')}
          </Txt>
          <Txt size={12.5} dim>
            {t(`verdictSub.${health}`)}
          </Txt>
        </View>
      </div>
      {reached.map((m) => (
        <View key={m} style={{ flexDirection: 'row', gap: 8, alignItems: 'center', padding: 10, borderRadius: R.md, backgroundColor: c.limeSoft }}>
          <Icon d={I.sparkleOne} size={16} sw={2} />
          <Txt size={13} w={600} style={{ flex: 1 }}>
            {t(`milestone.${m}`, { name })}
          </Txt>
        </View>
      ))}
      <ChecksList checks={check.checks} compact />
      {check.tip ? (
        <View style={{ gap: 8, padding: 14, borderRadius: 18, backgroundColor: c.limeSoft }}>
          <Txt size={13.5} w={700}>
            {t('tip', { name })}
          </Txt>
          <Txt size={13}>{text(check.tip)}</Txt>
        </View>
      ) : null}
      <Txt size={12.5} dim>
        {t('nextOn', { date: f.date(tree.next_due_at, { day: 'numeric', month: 'short' }) })}
      </Txt>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <Txt size={12.5} w={600} color={check.points ? c.leaf : c.ink2} style={{ flexShrink: 1 }}>
          {check.points ? t('pts', { pts: f.loc(check.points) }) : check.on_time ? t('ptsNone') : t('ptsLate', { pts: f.loc(TREE_CHECK_POINTS) })}
        </Txt>
        <GhostButton label={t('again')} onPress={onAgain} height={38} style={{ paddingHorizontal: 14 }} />
      </View>
    </Card>
  );
}

/* ───────────────────────────── Tips ───────────────────────────── */

function Tips({ tree, name }: { tree: Tree; name: string }) {
  const t = useTranslations('profile.tree');
  const { text } = useCodeText();
  const { c } = useCz();
  const tips = tree.tips ?? [];
  if (!tips.length) return null;
  return (
    <Card gap={10}>
      <Txt label as="h2">
        {t('tipsT', { name })}
      </Txt>
      {tips.map((x) => (
        <View key={x.code} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
          <Icon d={I.sparkleOne} size={14} sw={2} color={c.leaf} />
          <Txt size={13} style={{ flex: 1 }}>
            {text(x)}
          </Txt>
        </View>
      ))}
      {tree.rain_7d_mm != null ? (
        <Txt size={11.5} dim>
          {t(tree.rain_source === 'imerg' ? 'rainImerg' : 'rainPower', { mm: Math.round(tree.rain_7d_mm) })}
        </Txt>
      ) : null}
    </Card>
  );
}

/* ───────────────────────────── Timeline ───────────────────────────── */

function Timeline({ tree }: { tree: Tree }) {
  const t = useTranslations('profile.tree');
  const { f } = useCz();
  const checks = tree.checks ?? [];
  return (
    <Card pad={0} gap={0} style={{ paddingVertical: 6, paddingHorizontal: 16 }}>
      <Txt label as="h2" style={{ paddingTop: 10, paddingBottom: 4 }}>
        {t('hist')}
      </Txt>
      {checks.map((x) => (
        <HistRow
          key={x.id}
          label={[t(`verdict.${x.health}`), x.height_cm != null ? t('cm', { n: f.loc(Math.round(x.height_cm)) }) : null].filter(Boolean).join(' · ')}
          sub={x.points ? t('pts', { pts: f.loc(x.points) }) : x.on_time ? null : t('offSchedule')}
          date={x.created_at}
          photo={x.photo_url}
          health={x.health}
        />
      ))}
      <HistRow label={t('hPlant')} sub={null} date={tree.planted_at} photo={null} health="healthy" />
    </Card>
  );
}

function HistRow({ label, sub, date, photo, health }: { label: string; sub: string | null; date: string; photo: string | null; health: TreeHealth }) {
  const { c, f } = useCz();
  const src = usePhotoUrl(photo);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.line }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" width={44} height={44} style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
      ) : (
        <View style={{ width: 26, height: 26, marginInline: 9, borderRadius: 13, backgroundColor: health === 'healthy' ? c.limeSoft : 'rgba(242,154,56,0.3)', alignItems: 'center', justifyContent: 'center' }}>
          <Icon d={health === 'healthy' ? I.checkSm : I.warn} size={14} sw={2.4} />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Txt size={13} w={500}>
          {label}
        </Txt>
        {sub ? (
          <Txt size={11.5} dim>
            {sub}
          </Txt>
        ) : null}
      </View>
      <Txt size={12} dim num>
        {f.date(date, { day: 'numeric', month: 'short' })}
      </Txt>
    </View>
  );
}

/* ───────────────────────────── Invite ───────────────────────────── */

/** T5 · This tree's estimated cooling (grows with the tree; an estimate, not a measurement). */
function Cooling({ tree }: { tree: Tree }) {
  const t = useTranslations('profile.tree');
  const { f } = useCz();
  if (!(tree.cooling_c_est > 0)) return null;
  return (
    <Card gap={6}>
      <Txt size={13.5} w={600}>
        {t('coolingTitle')}
      </Txt>
      <Txt size={22} w={700} num>
        {f.dC(-tree.cooling_c_est, 4)}
      </Txt>
      <Txt size={12} dim>
        {t('coolingNote')}
      </Txt>
    </Card>
  );
}

function InviteFriend({ tree, name }: { tree: Tree; name: string }) {
  const t = useTranslations('profile.tree');
  const invite = useTreeInvite();
  const share = async () => {
    try {
      const inv = await invite.mutateAsync(tree.id);
      const url = `${window.location.origin}${inv.path}`;
      const text = t('inviteText', { name });
      try {
        if (navigator.share) {
          await navigator.share({ title: 'Atmos X', text, url });
          return;
        }
      } catch (e) {
        if ((e as { name?: string })?.name === 'AbortError') return;
      }
      await navigator.clipboard.writeText(`${text} ${url}`);
      toast(t('inviteCopied'), { tone: 'success' });
    } catch {
      toast(t('inviteFailed'), { tone: 'warn' });
    }
  };
  return (
    <Card gap={8}>
      <Txt size={14} w={600}>
        {t('inviteT')}
      </Txt>
      <Txt size={12.5} dim>
        {t('inviteSub', { name })}
      </Txt>
      <GhostButton label={t('invite')} height={44} disabled={invite.isPending} onPress={() => void share()} />
    </Card>
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
                    goReplace('trees');
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
