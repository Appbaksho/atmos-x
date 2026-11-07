'use client';

/** S15 · Contribution (useAction): photo, status, deterministic checks, review, cooling, points, rank, share. */
import { useTranslations } from 'next-intl';

import { SharePostButton } from '@/components/community/share-post';

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
import { ACTION_BY_ID, PHOTO_EVERY_DAYS, TREE_CHECK_POINTS, isGuestRestricted, useAction, useGoals, useMyStats, usePhotoUrl, useReviewAction, useSession, useTeam } from '@/lib/data/hooks';
import type { ActionLog } from '@/lib/data/types';

import { ACTION_ICON, qtyText } from './action-meta';
import { ChecksList } from './checks';
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
  const team = useTeam(log.team_id);
  const stats = useMyStats();
  const session = useSession();
  const review = useReviewAction();

  const ok = log.status === 'verified';
  const mine = session.user.id === log.user_id;
  const title = ta(`type.${log.action_type}`);
  const qty = qtyText(tu, ACTION_BY_ID[log.action_type].unit_code, log.quantity, f.loc);
  const zoneName = log.zone_label ?? goal?.zone_name ?? null;
  // The server already scales cooling to the goal zone's area.
  const coolC = log.cooling_c > 0 ? log.cooling_c : 0;

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
          <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, height: 26, paddingHorizontal: 10, borderRadius: R.pill, backgroundColor: ok ? B.lime : log.status === 'rejected' ? B.deepRed : B.orange }}>
            <Icon d={ok ? I.check : log.status === 'rejected' ? I.close : I.clock} size={12} color={log.status === 'rejected' ? B.white : B.limeInk} sw={3} />
            <Txt size={11.5} w={700} color={log.status === 'rejected' ? B.white : B.limeInk}>
              {t(log.status)}
            </Txt>
          </View>
          <Txt size={30} num color={B.white} lines={1} style={{ lineHeight: '32px', letterSpacing: -0.6 }}>
            {t('pts', { points: f.num(log.points) })}
          </Txt>
          <Txt size={12} color="rgba(255,255,255,0.8)">
            {ok ? (team.data ? t('creditedTo', { who: team.data.name }) : t('creditedMe')) : log.status === 'rejected' ? t('rejectedNote') : t('provisionalNote')}
          </Txt>
        </View>
      </Card>

      {ok && mine ? <SharePostButton actionId={log.id} /> : null}

      <Card pad={0} gap={0} style={{ paddingVertical: 6, paddingHorizontal: 16 }}>
        <Txt label style={{ paddingTop: 10, paddingBottom: 2 }}>
          {t('checks')}
        </Txt>
        <ChecksList checks={log.checks} />
        <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 12, alignItems: 'flex-start' }}>
          <Icon d={ok ? I.check : I.info} size={15} sw={2.2} color={ok ? c.leaf : B.orangeInk} />
          <Txt size={12.5} style={{ flex: 1 }}>
            {reason(log.reason_code ?? (ok ? 'ok' : 'unavailable'))}
          </Txt>
        </View>
      </Card>

      {log.status === 'pending' && log.can_review ? (
        <Card tone="limeSoft" gap={8}>
          <Txt size={14} w={600}>
            {t('reviewTitle')}
          </Txt>
          <Txt size={12} dim>
            {t('reviewSub')}
          </Txt>
          {review.isError && !isGuestRestricted(review.error) ? <ErrorState compact error={review.error} /> : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <CzButton label={t('approve')} icon="check" size="md" variant="navy" busy={review.isPending && review.variables?.approve === true} onPress={() => review.mutate({ id: log.id, approve: true })} />
            </View>
            <View style={{ flex: 1 }}>
              <GhostButton label={t('reject')} onPress={() => review.mutate({ id: log.id, approve: false })} />
            </View>
          </View>
        </Card>
      ) : log.status === 'pending' && mine ? (
        <Card tone="limeSoft" gap={6}>
          <Txt size={14} w={600}>
            {t('waitTitle')}
          </Txt>
          <Txt size={12} dim>
            {t('waitSub')}
          </Txt>
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

      {mine && stats.data?.rank_area ? (
        <Tap href={href('S16')} label={t('rank', { rank: f.loc(stats.data.rank_area.rank) })} style={{ backgroundColor: c.card, borderRadius: R.xl, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Txt size={30} w={600} num style={{ lineHeight: '34px' }}>
            {'#' + f.loc(stats.data.rank_area.rank)}
          </Txt>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Txt size={13.5} w={600}>
              {t('rank', { rank: f.loc(stats.data.rank_area.rank) })}
            </Txt>
            <Txt size={12} dim>
              {t('rankSub', { points: f.num(stats.data.points.earned), level: tp.has(stats.data.level.name_code) ? tp(stats.data.level.name_code) : stats.data.level.name_code.replace(/^level\./, '').replace(/_/g, ' ') })}
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
