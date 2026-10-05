'use client';

/** S15 · Contribution (useAction): photo, status, checks, cooling contributed, points, rank, share. */
import { useTranslations } from 'next-intl';

import {
  B,
  Card,
  CzButton,
  ErrorState,
  GhostButton,
  I,
  Icon,
  IconBtn,
  Label,
  Photo,
  R,
  Screen,
  ScreenHeader,
  SkeletonCard,
  Tap,
  Txt,
  View,
  href,
  toast,
  useCz,
} from '@/components/cz';
import { zoneArea } from '@/components/plan/use-goal-plan';
import { ACTION_BY_ID, PHOTO_EVERY_DAYS, TREE_CHECK_POINTS, isGuestRestricted, useAction, useConfirmAction, useGoals, useMyStats, usePhotoUrl, useTeam, useZone } from '@/lib/data/hooks';
import type { ActionLog } from '@/lib/data/types';

import { ACTION_ICON, qtyText } from './action-meta';
import { useReasonText } from './reason';

export function ContributionScreen({ id }: { id: string }) {
  const t = useTranslations('act.contribution');
  const q = useAction(id);
  if (q.isLoading) {
    return (
      <Screen>
        <ScreenHeader title={t('title')} />
        <SkeletonCard lines={3} height={120} />
        <SkeletonCard lines={4} />
      </Screen>
    );
  }
  if (q.isError || !q.data) {
    return (
      <Screen>
        <ScreenHeader title={t('title')} />
        <ErrorState error={q.error} title={q.isError ? undefined : t('notFound')} body={q.isError ? undefined : ' '} onRetry={() => void q.refetch()} />
        <GhostButton label={t('backPlan')} href={href('S10')} />
      </Screen>
    );
  }
  return <Body log={q.data} />;
}

function Body({ log }: { log: ActionLog }) {
  const t = useTranslations('act.contribution');
  const ta = useTranslations('act');
  const tu = useTranslations('act.unit');
  const tp = useTranslations('profile');
  const { c, f } = useCz();
  const reason = useReasonText();
  const photo = usePhotoUrl(log.photo_url);
  const goals = useGoals();
  const goal = goals.data?.find((g) => g.id === log.goal_id) ?? null;
  const zone = useZone(goal && !goal.zone_id.startsWith('demo:') ? goal.zone_id : null);
  const team = useTeam(log.team_id);
  const stats = useMyStats();
  const confirm = useConfirmAction();

  const ok = log.status === 'verified';
  const v = log.verification;
  const title = ta(`type.${log.action_type}`);
  const qty = qtyText(tu, ACTION_BY_ID[log.action_type].unit_code, log.quantity, f.loc);
  const zoneName = log.zone_label ?? goal?.zone_name ?? null;
  const coolC = log.cooling_c > 0 ? log.cooling_c / zoneArea(zone.data?.h3) : 0;
  const hasGps = log.lat != null && log.lng != null;
  const ageH = log.taken_at ? (Date.parse(log.created_at) - Date.parse(log.taken_at)) / 36e5 : null;
  const timeOk = ageH != null && ageH <= 24 && ageH > -0.2;
  const aiOk = !!v && v.confidence >= 0.6 && !['ai_mismatch', 'different_action', 'not_a_photo', 'ai_low_confidence'].includes(v.reason_code);
  const gpsOk = hasGps && v?.reason_code !== 'gps_far' && v?.reason_code !== 'gps_missing';

  const checks: [string, string, string, boolean][] = [
    [v?.seen || t('aiSeen'), t('aiCheck'), v && v.confidence > 0 ? f.pct(v.confidence * 100, 0) : '—', aiOk],
    [hasGps ? t('gps') : t('gpsMissing'), t('gpsRule'), gpsOk ? t('pass') : t('check'), gpsOk],
    [t('time'), t('timeRule'), timeOk ? t('pass') : t('check'), timeOk],
  ];

  const share = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    const text = t('shareText', { action: title, points: f.num(log.points), zone: zoneName ?? '' });
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Atmos X', text, url });
        return;
      }
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      toast(t('copied'), { tone: 'success' });
    } catch {
      toast(url);
    }
  };

  const survival = log.action_type === 'plant_tree' ? [1, 2, 3, 4].map((k) => k * PHOTO_EVERY_DAYS) : [];
  const start = Date.parse(log.taken_at ?? log.created_at);

  return (
    <Screen>
      <ScreenHeader
        title={t('title')}
        sub={[qty + ' · ' + title, zoneName, f.date(log.taken_at ?? log.created_at, { day: 'numeric', month: 'short' })].filter(Boolean).join(' · ')}
        right={<IconBtn d={I.share} label={t('share')} onPress={share} />}
      />

      <Card tone="navy" pad={12} gap={14} style={{ borderRadius: R.xxl, flexDirection: 'row', alignItems: 'center' }}>
        {photo ? (
          <Photo src={photo} label={t('photoAlt')} style={{ width: 96, height: 96, borderRadius: R.lg, backgroundColor: B.photoBg2 }} />
        ) : (
          <View style={{ width: 96, height: 96, borderRadius: R.lg, backgroundColor: B.photoBg2, alignItems: 'center', justifyContent: 'center' }}>
            <Icon d={ACTION_ICON[log.action_type]} size={36} color={B.lime} sw={1.6} />
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
          <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, height: 26, paddingHorizontal: 10, borderRadius: R.pill, backgroundColor: ok ? B.lime : B.orange }}>
            <Icon d={ok ? I.check : I.clock} size={12} color={B.limeInk} sw={3} />
            <Txt size={11.5} w={700} color={B.limeInk}>
              {t(log.status)}
            </Txt>
          </View>
          <Txt size={30} num color={B.white} lines={1} style={{ lineHeight: '32px', letterSpacing: -0.6 }}>
            {t('pts', { points: f.num(log.points) })}
          </Txt>
          <Txt size={12} color="rgba(255,255,255,0.8)">
            {ok ? (team.data ? t('creditedTo', { who: team.data.name }) : t('creditedMe')) : t('provisionalNote')}
          </Txt>
        </View>
      </Card>

      <Card pad={0} gap={0} style={{ paddingVertical: 6, paddingHorizontal: 16 }}>
        <Txt label style={{ paddingTop: 10, paddingBottom: 2 }}>
          {t('checks')}
        </Txt>
        {checks.map(([label, kind, val, pass], i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: c.line }}>
            <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: pass ? c.limeSoft : 'rgba(242,154,56,0.2)', alignItems: 'center', justifyContent: 'center' }}>
              <Icon d={pass ? I.check : I.warn} size={13} sw={2.6} />
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
              <Txt size={13.5} w={500}>
                {label}
              </Txt>
              <Txt size={11} dim>
                {kind}
              </Txt>
            </View>
            <Txt size={12.5} w={600} num lines={1}>
              {val}
            </Txt>
          </View>
        ))}
        <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 12, alignItems: 'flex-start' }}>
          <Icon d={ok ? I.check : I.info} size={15} sw={2.2} color={ok ? c.leaf : B.orangeInk} />
          <Txt size={12.5} style={{ flex: 1 }}>
            {reason(v?.reason_code ?? (ok ? 'ok' : 'unavailable'))}
          </Txt>
        </View>
      </Card>

      {!ok && log.status === 'pending' ? (
        <Card tone="limeSoft" gap={8}>
          <Txt size={14} w={600}>
            {t('confirm')}
          </Txt>
          <Txt size={12} dim>
            {t('confirmSub')}
          </Txt>
          {confirm.isError && !isGuestRestricted(confirm.error) ? <ErrorState compact error={confirm.error} /> : null}
          <CzButton label={t('confirm')} icon="check" size="md" variant="navy" busy={confirm.isPending} onPress={() => confirm.mutate(log.id)} />
        </Card>
      ) : null}

      <Card gap={6}>
        <Label>{t('cooling')}</Label>
        {coolC > 0 ? (
          <>
            <Txt size={28} w={700} num color={c.leaf} style={{ letterSpacing: -0.5 }}>
              {f.dC(-coolC, coolC < 0.01 ? 4 : 3)}
            </Txt>
            <Txt size={12} dim>
              {t('coolingSub', { zone: zoneName ?? '—' })}
            </Txt>
          </>
        ) : (
          <Txt size={13}>{t('coolingNone')}</Txt>
        )}
      </Card>

      {stats.data?.rank_area ? (
        <Tap href={href('S16')} label={t('rank', { rank: f.loc(stats.data.rank_area) })} style={{ backgroundColor: c.card, borderRadius: R.xl, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Txt size={30} w={600} num style={{ lineHeight: '34px' }}>
            {'#' + f.loc(stats.data.rank_area)}
          </Txt>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Txt size={13.5} w={600}>
              {t('rank', { rank: f.loc(stats.data.rank_area) })}
            </Txt>
            <Txt size={12} dim>
              {t('rankSub', { points: f.num(stats.data.points), level: tp.has(stats.data.level.name_code) ? tp(stats.data.level.name_code) : stats.data.level.name_code.replace(/^level\./, '').replace(/_/g, ' ') })}
            </Txt>
          </View>
          <Icon d={f.fwdPath} size={16} sw={2} />
        </Tap>
      ) : null}

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <Label>{t('groundTitle')}</Label>
          <View style={{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: R.pill, backgroundColor: c.limeSoft }}>
            <Txt size={11} w={600}>
              {t('groundTag')}
            </Txt>
          </View>
        </View>
        <Txt size={13}>{t('groundBody')}</Txt>
        <Txt size={11} dim>
          {t('groundSrc')}
        </Txt>
      </Card>

      {survival.length ? (
        <Card gap={14}>
          <Label>{t('survival')}</Label>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <View style={{ position: 'absolute', start: '12.5%', end: '12.5%', top: 15, height: 2, backgroundColor: c.line }} />
            {survival.map((d, i) => (
              <View key={d} role="img" label={`${t('dayN', { n: d })}, +${TREE_CHECK_POINTS}`} style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 6 }}>
                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c.card, borderWidth: 2, borderColor: i === 0 ? B.lime : c.line, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon d={I.camera} size={15} sw={1.8} />
                </View>
                <Txt size={12.5} w={600} center lines={1}>
                  {t('dayN', { n: f.loc(d) })}
                </Txt>
                <Txt size={11} dim center lines={1}>
                  {f.date(new Date(start + d * 864e5), { day: 'numeric', month: 'short' })}
                </Txt>
                <Txt size={11} w={600} num center color={c.leaf}>
                  {'+' + f.loc(TREE_CHECK_POINTS)}
                </Txt>
              </View>
            ))}
          </View>
          <Txt size={12} dim>
            {t('survivalNote')}
          </Txt>
        </Card>
      ) : null}

      <View style={{ gap: 10 }}>
        <CzButton label={t('share')} icon="arrow" onPress={share} />
        <GhostButton label={t('backPlan')} href={href('S10')} />
        {log.team_id ? <GhostButton label={t('seeTeam')} href={href('S17', { id: log.team_id })} /> : null}
      </View>
    </Screen>
  );
}
