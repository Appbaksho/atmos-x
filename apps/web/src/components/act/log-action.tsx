'use client';

/**
 * S14 · Log an action: in-app camera (GPS + time sealed) → action type, species, quantity, credit,
 * note → useLogAction → "Verifying with AI…" → result (verified with what the AI saw, or pending
 * with the reason) → points count-up → contribution card (S15).
 * Query params: ?type=<ActionTypeId>&species=<id>&goal=<goal id>.
 */
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Camera, ViewfinderBracket as Bracket, type CameraCapture } from '@/components/camera';
import {
  B,
  CzButton,
  ErrorState,
  Field,
  GhostButton,
  HScroll,
  I,
  Icon,
  IconBtn,
  Label,
  LightStatusBar,
  OptionRow,
  R,
  Screen,
  Spinner,
  Stepper,
  Tap,
  Txt,
  View,
  go,
  goBack,
  href,
  requireAccount,
  useCz,
} from '@/components/cz';
import { useGoalPlan } from '@/components/plan/use-goal-plan';
import { ACTION_BY_ID, isGuestRestricted, scoreAction, useLogAction, useSpecies, useTeams, type LogActionResult } from '@/lib/data/hooks';
import type { ActionTypeId } from '@/lib/data/types';

import { ACTION_ICON, ACTION_ORDER, qtyText } from './action-meta';
import { useReasonText } from './reason';

const IDS = new Set<string>(ACTION_ORDER);

export function LogActionScreen({
  initialType,
  initialSpecies,
  goalId,
  teamId: initialTeam,
}: {
  initialType?: string | null;
  initialSpecies?: string | null;
  goalId?: string | null;
  /** `?team=<id>` (team page "Log an action"): credit that team when I'm a member */
  teamId?: string | null;
}) {
  const t = useTranslations('act.log');
  const ta = useTranslations('act');
  const tu = useTranslations('act.unit');
  const { c, f } = useCz();
  const { session, goal: activeGoal, goals, point } = useGoalPlan();
  const goal = (goalId ? goals.data?.find((g) => g.id === goalId) : null) ?? activeGoal;
  const teams = useTeams();
  const species = useSpecies(point);
  const log = useLogAction();

  const [camOpen, setCamOpen] = useState(false);
  const [shot, setShot] = useState<(CameraCapture & { url: string }) | null>(null);
  const [type, setType] = useState<ActionTypeId>(initialType && IDS.has(initialType) ? (initialType as ActionTypeId) : 'plant_tree');
  const [sp, setSp] = useState<string | null>(initialSpecies ?? null);
  const [qty, setQty] = useState(type === 'plant_tree' ? 3 : 1);
  const [nickname, setNickname] = useState('');
  const [credit, setCredit] = useState<string>(initialTeam || 'auto');
  const [useGoal, setUseGoal] = useState(true);
  const [note, setNote] = useState('');
  const [result, setResult] = useState<LogActionResult | null>(null);

  useEffect(() => () => void (shot && URL.revokeObjectURL(shot.url)), [shot]);

  const spList = species.data?.species ?? [];
  const spId = sp ?? spList[0]?.id ?? null;
  const myTeams = teams.data ?? [];
  const isMine = (id: string | null | undefined) => !!id && myTeams.some((x) => x.id === id);
  const goalTeam = goal?.team_id && isMine(goal.team_id) ? goal.team_id : null;
  // A preselected team (?team=) only counts once it's one of my teams; otherwise fall back to auto.
  const teamId = credit === 'me' ? null : credit !== 'auto' && isMine(credit) ? credit : goalTeam;
  const meta = ACTION_BY_ID[type];
  const score = scoreAction(type, qty);

  const onCapture = (cap: CameraCapture) => {
    setShot({ ...cap, url: URL.createObjectURL(cap.blob) });
    setCamOpen(false);
  };

  const submit = (withPhoto: boolean) => {
    if (session.isGuest) return requireAccount(t('feature'));
    if (withPhoto && !shot) return setCamOpen(true);
    log.mutate(
      {
        action_type: type,
        quantity: qty,
        lat: withPhoto ? (shot?.lat ?? null) : null,
        lng: withPhoto ? (shot?.lng ?? null) : null,
        taken_at: withPhoto && shot ? shot.takenAt : new Date().toISOString(),
        photo: withPhoto && shot ? shot.blob : null,
        goal_id: useGoal && goal ? goal.id : null,
        team_id: teamId,
        note: note.trim() || null,
        species_id: type === 'plant_tree' ? (spId ?? 'unknown') : undefined,
        nickname: type === 'plant_tree' ? nickname.trim() || undefined : undefined,
      },
      { onSuccess: (r) => setResult(r) },
    );
  };

  const reset = () => {
    setResult(null);
    setShot(null);
    setNote('');
    setNickname('');
    log.reset();
  };

  if (log.isPending) return <Verifying photo={shot?.url ?? null} />;
  if (result) return <Result result={result} photo={shot?.url ?? null} onAnother={reset} />;

  return (
    <Screen bleed gap={0}>
      <LightStatusBar />
      {/* Viewfinder / captured photo */}
      <View style={{ height: 'min(58vh, 520px)', minHeight: 360, overflow: 'hidden', backgroundColor: B.navy }}>
        {shot ? (
          // eslint-disable-next-line @next/next/no-img-element -- local object URL
          <img src={shot.url} alt={t('captured')} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <View style={{ position: 'absolute', inset: 0, background: `radial-gradient(120% 80% at 50% 40%, ${B.photoBg2} 0%, ${B.navy} 75%)` }} />
        )}
        <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 26%, rgba(0,0,0,0) 62%, rgba(0,0,0,0.6) 100%)' }} />
        {!shot ? (
          <>
            <Bracket v="top" h="start" />
            <Bracket v="top" h="end" />
            <Bracket v="bottom" h="start" />
            <Bracket v="bottom" h="end" />
          </>
        ) : null}

        <View style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 12px)', start: 16, end: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <IconBtn d={I.close} label={ta('camera.close')} tone="glass" onPress={goBack} />
          <View style={{ height: 34, paddingHorizontal: 12, borderRadius: R.pill, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,24,46,0.55)', borderWidth: 1, borderColor: 'rgba(172,236,0,0.6)' }}>
            <Icon d={I.lock} size={14} color={B.lime} sw={2} />
            <Txt size={12} w={600} color={B.lime}>
              {ta('camera.sealed')}
            </Txt>
          </View>
        </View>

        {!shot ? (
          <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 40 }}>
            <Tap label={t('openCamera')} haptic onPress={() => setCamOpen(true)} style={{ width: 84, height: 84, borderRadius: 42, borderWidth: 4, borderColor: B.white, padding: 5 }}>
              <View style={{ flex: 1, borderRadius: 36, backgroundColor: B.lime, alignItems: 'center', justifyContent: 'center' }}>
                <Icon d={I.camera} size={28} color={B.limeInk} sw={2} />
              </View>
            </Tap>
            <Txt size={13} center color="rgba(255,255,255,0.85)" style={{ maxWidth: 280 }}>
              {t('photoHint')}
            </Txt>
          </View>
        ) : (
          <View style={{ position: 'absolute', start: 16, end: 16, bottom: 40, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 10 }}>
            <View style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.5)', flexShrink: 1 }}>
              <Txt size={11.5} w={500} num color={B.white}>
                {[shot.lat != null && shot.lng != null ? `${f.dec(shot.lat, 4)}, ${f.dec(shot.lng, 4)}` : null, f.date(shot.takenAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })].filter(Boolean).join(' · ')}
              </Txt>
            </View>
            <Tap label={t('retake')} onPress={() => setCamOpen(true)} style={{ height: 40, paddingHorizontal: 16, borderRadius: R.pill, backgroundColor: B.glass, borderWidth: 1, borderColor: B.glassLine, justifyContent: 'center' }}>
              <Txt size={13} w={600} color={B.white}>
                {t('retake')}
              </Txt>
            </Tap>
          </View>
        )}
      </View>

      {/* Sheet */}
      <View style={{ marginTop: -24, backgroundColor: c.bg, borderTopStartRadius: R.xxl, borderTopEndRadius: R.xxl, paddingTop: 18, paddingHorizontal: 16, gap: 14 }}>
        <Txt display size={17} as="h1">
          {t('title')}
        </Txt>
        {shot ? (
          <View aria-live="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: shot.lat != null ? c.limeSoft : 'rgba(242,154,56,0.18)' }}>
            <Icon d={shot.lat != null ? I.check : I.warn} size={16} sw={2.4} />
            <Txt size={12.5} w={600} style={{ flex: 1 }}>
              {shot.lat != null ? t('captured') : t('capturedNoGps')}
            </Txt>
          </View>
        ) : null}

        <View style={{ gap: 8 }}>
          <Label>{t('action')}</Label>
          <View role="radiogroup" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>
            {ACTION_ORDER.map((id) => {
              const on = type === id;
              return (
                <Tap
                  key={id}
                  role="radio"
                  selected={on}
                  label={ta(`type.${id}`)}
                  haptic
                  onPress={() => {
                    setType(id);
                    setQty(id === 'plant_tree' ? 3 : 1);
                  }}
                  style={{ minWidth: 0, height: 64, borderRadius: R.md, backgroundColor: on ? B.lime : c.card, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 2 }}>
                  <Icon d={ACTION_ICON[id]} size={20} sw={1.7} color={on ? B.limeInk : c.ink} />
                  <Txt size={11} w={600} lines={1} color={on ? B.limeInk : c.ink}>
                    {ta(`short.${id}`)}
                  </Txt>
                </Tap>
              );
            })}
          </View>
        </View>

        <View style={{ backgroundColor: c.card, borderRadius: 22, paddingVertical: 4, paddingHorizontal: 16 }}>
          {type === 'plant_tree' ? (
            <View style={{ paddingVertical: 12, gap: 8, borderBottomWidth: 1, borderBottomColor: c.line }}>
              <Txt size={11.5} dim>
                {t('species')}
              </Txt>
              <HScroll gap={6} style={{ marginInline: -16, paddingInline: 16 }} label={t('speciesPick')}>
                {[...spList.map((s) => ({ id: s.id, label: s.name })), { id: 'unknown', label: t('speciesOther') }].map((o) => {
                  const on = spId === o.id;
                  return (
                    <Tap
                      key={o.id}
                      role="radio"
                      selected={on}
                      label={o.label}
                      onPress={() => setSp(o.id)}
                      style={{ height: 36, paddingHorizontal: 14, borderRadius: R.pill, backgroundColor: on ? c.solid : c.soft, justifyContent: 'center', flexShrink: 0 }}>
                      <Txt size={12.5} w={600} lines={1} color={on ? c.onSolid : c.ink}>
                        {o.label}
                      </Txt>
                    </Tap>
                  );
                })}
              </HScroll>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Txt size={11.5} dim>
                {t('qty')}
              </Txt>
              <Txt size={14} w={600} num>
                {qtyText(tu, meta.unit_code, qty, f.loc)}
              </Txt>
            </View>
            <Stepper value={f.loc(qty)} label={t('qty')} onDec={() => setQty((q) => Math.max(1, q - 1))} onInc={() => setQty((q) => Math.min(99, q + 1))} decDisabled={qty <= 1} incDisabled={qty >= 99} />
          </View>
          {type === 'plant_tree' ? (
            <View style={{ paddingBottom: 12 }}>
              <Field label={t('nickname')} placeholder={t('nicknamePh')} value={nickname} onChangeText={setNickname} maxLength={40} />
            </View>
          ) : null}
        </View>

        <View style={{ gap: 8 }}>
          <Label>{t('credit')}</Label>
          <View role="radiogroup" style={{ gap: 6 }}>
            <OptionRow title={t('cMe')} sub={t('cMeSub')} selected={teamId == null} onPress={() => setCredit('me')} />
            {myTeams.map((tm) => (
              <OptionRow key={tm.id} title={tm.name} sub={t('cTeamSub', { n: f.loc(tm.members.length) })} selected={teamId === tm.id} onPress={() => setCredit(tm.id)} />
            ))}
          </View>
          {goal ? (
            <Tap
              role="checkbox"
              selected={useGoal}
              label={t('cGoal', { zone: goal.zone_name })}
              onPress={() => setUseGoal(!useGoal)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: R.lg, backgroundColor: c.card, borderWidth: 2, borderColor: useGoal ? c.accent : 'transparent', textAlign: 'start' }}>
              <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: useGoal ? B.lime : c.soft, alignItems: 'center', justifyContent: 'center' }}>
                {useGoal ? <Icon d={I.check} size={13} color={B.limeInk} sw={3} /> : null}
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Txt size={14} w={600}>
                  {t('cGoal', { zone: goal.zone_name })}
                </Txt>
                <Txt size={12} dim>
                  {t('cGoalSub', { target: f.dC(goal.target_c), date: f.date(goal.by_date, { month: 'short', year: 'numeric' }) })}
                </Txt>
              </View>
            </Tap>
          ) : null}
        </View>

        <Field label={t('note')} placeholder={t('notePh')} value={note} onChangeText={setNote} multiline maxLength={280} />

        {log.isError && !isGuestRestricted(log.error) ? <ErrorState compact error={log.error} title={t('failed')} /> : null}

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: 4 }}>
          <Txt size={12.5} dim>
            {t('pointsSub', { points: f.num(score.points) })}
          </Txt>
          <Txt size={15} w={700} num color={c.leaf}>
            {t('points', { points: f.num(score.points) })}
          </Txt>
        </View>
        <CzButton label={shot ? t('submit') : t('needPhoto')} icon={shot ? 'check' : 'camera'} onPress={() => submit(true)} />
        {!shot ? (
          <View style={{ gap: 6, alignItems: 'center' }}>
            <Tap role="button" label={t('submitNoPhoto')} onPress={() => submit(false)} style={{ minHeight: 40, justifyContent: 'center', paddingHorizontal: 12 }}>
              <Txt size={13} w={600} color={c.leaf}>
                {t('submitNoPhoto')}
              </Txt>
            </Tap>
            <Txt size={11.5} dim center>
              {t('noPhotoNote')}
            </Txt>
          </View>
        ) : null}
        <View style={{ height: 24 }} />
      </View>

      <Camera open={camOpen} onClose={() => setCamOpen(false)} onCapture={onCapture} />
    </Screen>
  );
}

/* ───────────────────────── Verifying ───────────────────────── */

function Verifying({ photo }: { photo: string | null }) {
  const t = useTranslations('act.log');
  return (
    <Screen bleed gap={0}>
      <LightStatusBar />
      <View style={{ minHeight: '100dvh', backgroundColor: B.navy, alignItems: 'center', justifyContent: 'center', gap: 22, padding: 32 }} aria-live="polite" aria-busy="true">
        <View style={{ width: 200, height: 200, borderRadius: 28, overflow: 'hidden', backgroundColor: B.photoBg2 }}>
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element -- local object URL
            <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : null}
          <div className="cz-v05-scan" aria-hidden />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Spinner color={B.lime} />
          <Txt display size={18} color={B.white}>
            {t('verifying')}
          </Txt>
        </View>
        <Txt size={13} center color="rgba(255,255,255,0.75)" style={{ maxWidth: 300 }}>
          {t('verifyingSub')}
        </Txt>
      </View>
      <style>{`.cz-v05-scan{position:absolute;inset:0;background:linear-gradient(180deg,rgba(172,236,0,0) 0%,rgba(172,236,0,.45) 50%,rgba(172,236,0,0) 100%);height:40%;animation:czv05scan 1.6s ease-in-out infinite alternate}@keyframes czv05scan{from{transform:translateY(-40%)}to{transform:translateY(190%)}}@media (prefers-reduced-motion:reduce){.cz-v05-scan{animation:none;opacity:.3}}`}</style>
    </Screen>
  );
}

/* ───────────────────────── Result ───────────────────────── */

function useCountUp(target: number, ms = 900) {
  const [v, setV] = useState(0);
  const [reduced] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      setV(Math.round(target * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms, reduced]);
  return reduced ? target : v;
}

function Result({ result, photo, onAnother }: { result: LogActionResult; photo: string | null; onAnother: () => void }) {
  const t = useTranslations('act.log');
  const ta = useTranslations('act');
  const tu = useTranslations('act.unit');
  const { c, f } = useCz();
  const reason = useReasonText();
  const { log, trees, milestones } = result;
  const ok = log.status === 'verified';
  const pts = useCountUp(log.points);
  const head = useRef<HTMLHeadingElement>(null);
  useEffect(() => head.current?.focus(), []);
  const qty = useMemo(() => qtyText(tu, ACTION_BY_ID[log.action_type].unit_code, log.quantity, f.loc), [tu, log, f.loc]);

  return (
    <Screen>
      <View style={{ alignItems: 'center', gap: 14, paddingTop: 24 }}>
        <View style={{ width: 168, height: 168, borderRadius: 28, overflow: 'hidden', backgroundColor: B.photoBg2 }}>
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element -- local object URL
            <img src={photo} alt={ta('contribution.photoAlt')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Icon d={ACTION_ICON[log.action_type]} size={48} color={B.lime} sw={1.5} />
            </View>
          )}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, paddingHorizontal: 12, borderRadius: R.pill, backgroundColor: ok ? B.lime : 'rgba(242,154,56,0.22)' }}>
          <Icon d={ok ? I.check : I.clock} size={14} color={ok ? B.limeInk : c.ink} sw={2.6} />
          <Txt size={12.5} w={700} color={ok ? B.limeInk : c.ink}>
            {ok ? t('verified') : t('pending')}
          </Txt>
        </View>
        <h1 ref={head} tabIndex={-1} style={{ outline: 'none', margin: 0 }}>
          <Txt as="span" size={46} w={700} num color={ok ? c.leaf : c.ink} className="cz-v05-pop" style={{ letterSpacing: -1 }}>
            {'+' + f.num(pts)}
          </Txt>
        </h1>
        <Txt size={13} dim center>
          {(ok ? t('earned') : t('provisional')) + ' · ' + ta(`type.${log.action_type}`) + ' · ' + qty}
        </Txt>
      </View>

      <View style={{ backgroundColor: c.card, borderRadius: 22, padding: 16, gap: 10 }}>
        {log.verification?.seen ? (
          <View style={{ gap: 4 }}>
            <Label>{t('seen')}</Label>
            <Txt size={14}>{log.verification.seen}</Txt>
            {log.verification.confidence > 0 ? (
              <Txt size={12} dim num>
                {t('confidence', { pct: f.pct(log.verification.confidence * 100, 0) })}
              </Txt>
            ) : null}
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
          <Icon d={ok ? I.check : I.info} size={16} sw={2.2} color={ok ? c.leaf : B.orangeInk} />
          <Txt size={13} style={{ flex: 1 }}>
            {reason(log.verification?.reason_code ?? (ok ? 'ok' : 'unavailable'))}
          </Txt>
        </View>
        {trees.length ? (
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Icon d={I.tree} size={16} sw={2} />
            <Txt size={13}>{t('treesAdded', { count: trees.length, n: f.loc(trees.length) })}</Txt>
          </View>
        ) : null}
        {milestones.map((m) => (
          <View key={m} style={{ flexDirection: 'row', gap: 8, alignItems: 'center', padding: 10, borderRadius: R.md, backgroundColor: c.limeSoft }}>
            <Icon d={I.sparkleOne} size={16} sw={2} />
            <Txt size={13} w={600}>
              {t('milestone', { pct: f.pct(m, 0) })}
            </Txt>
          </View>
        ))}
      </View>

      <View style={{ gap: 10 }}>
        <CzButton label={t('seeContribution')} icon="arrow" onPress={() => go('S15', { id: log.id })} />
        <GhostButton label={t('logAnother')} onPress={onAnother} />
        <GhostButton label={ta('contribution.backPlan')} href={href('S10')} />
      </View>
      <style>{`.cz-v05-pop{display:inline-block;animation:czv05pop .5s cubic-bezier(.2,1.6,.4,1) both}@keyframes czv05pop{from{transform:scale(.6);opacity:0}to{transform:scale(1);opacity:1}}@media (prefers-reduced-motion:reduce){.cz-v05-pop{animation:none}}`}</style>
    </Screen>
  );
}
