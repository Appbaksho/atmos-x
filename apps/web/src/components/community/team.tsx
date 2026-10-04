'use client';
/** S17 · Team dashboard: goal ring + modeled cooling with evidence, stats, task board, members (2–5), activity, invite, join / leave. */
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import {
  Avatar,
  B,
  BottomSheet,
  Card,
  Check,
  CzButton,
  EmptyState,
  ErrorState,
  GhostButton,
  I,
  Label,
  ListRow,
  Note,
  R,
  Ring,
  Screen,
  ScreenHeader,
  Seg,
  SkeletonCard,
  SourceChips,
  StatTile,
  Tag,
  Txt,
  View,
  goReplace,
  href,
  requireAccount,
  toast,
  useCz,
} from '@/components/cz';
import { useCodeText } from '@/components/profile/codes';
import { initials } from '@/lib/format';
import { useGoals, useJoinByCode, useLeaveTeam, useMe, useSession, useTeam, useTeams } from '@/lib/data/hooks';
import type { Team, TeamTask } from '@/lib/data/types';

import { InviteCard } from './invite-card';
import { avatarFor, coolingText, freePlaces, useTeamErrorText } from './shared';

const WHITE_75 = 'rgba(255,255,255,0.75)';
const COLS: TeamTask['status'][] = ['todo', 'doing', 'done'];

export function TeamScreen({ id }: { id: string }) {
  const t = useTranslations('community');
  const team = useTeam(id);
  const session = useSession();

  if (!session.ready || team.isPending) {
    return (
      <Screen>
        <ScreenHeader title={t('hub')} />
        <SkeletonCard lines={4} height={260} />
        <SkeletonCard lines={3} height={180} />
      </Screen>
    );
  }
  if (team.isError) {
    return (
      <Screen>
        <ScreenHeader title={t('hub')} />
        <ErrorState error={team.error} onRetry={() => void team.refetch()} />
      </Screen>
    );
  }
  if (!team.data) {
    return (
      <Screen>
        <ScreenHeader title={t('notFound.title')} />
        <EmptyState icon={I.community} title={t('notFound.title')} sub={t('notFound.sub')} action={t('hub')} actionHref={href('S16')} />
      </Screen>
    );
  }
  return <TeamBody team={team.data} />;
}

function TeamBody({ team }: { team: Team }) {
  const t = useTranslations('community');
  const { f } = useCz();
  const me = useMe();
  const session = useSession();
  const myTeams = useTeams();
  const [inviteOpen, setInviteOpen] = useState(false);
  const isMember = team.members.some((m) => m.user_id === me.id) || !!myTeams.data?.some((x) => x.id === team.id);
  const goals = useGoals();
  const goal = team.goal_id ? goals.data?.find((g) => g.id === team.goal_id) ?? null : null;
  const n = team.members.length;
  const sub = goal
    ? t('teamSub', { zone: goal.zone_name, n: f.loc(n), max: f.loc(team.max_members) })
    : t('teamSubNoZone', { n: f.loc(n), max: f.loc(team.max_members) });

  return (
    <Screen>
      <ScreenHeader
        title={team.name}
        sub={sub}
        right={isMember ? <GhostButton label={t('invite')} height={40} onPress={() => setInviteOpen(true)} style={{ paddingHorizontal: 14 }} /> : null}
      />

      {!isMember ? <JoinStrip team={team} guest={session.isGuest} /> : null}

      <Hero team={team} goal={goal} />

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <StatTile label={t('stats.points')} value={f.num(team.stats.points)} style={{ flex: 1, minWidth: 0 }} />
        <StatTile label={t('stats.trees')} value={f.num(team.stats.trees)} style={{ flex: 1, minWidth: 0 }} />
        <StatTile label={t('stats.actions')} value={f.num(team.stats.actions)} style={{ flex: 1, minWidth: 0 }} />
      </View>

      {team.tasks?.length ? <TaskBoard tasks={team.tasks} /> : null}

      <Members team={team} meId={me.id} />

      <Activity team={team} isMember={isMember} />

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <SourceChips demo={team.members.length > 1 || !!team.tasks?.length} sources={[{ id: 'device', name: 'This device' }]} />
      </View>

      {isMember ? <LeaveButton team={team} /> : null}

      <BottomSheet open={inviteOpen} onClose={() => setInviteOpen(false)} title={t('inviteTitle', { name: team.name })} sub={t('deviceNote')}>
        <InviteCard team={team} />
      </BottomSheet>
    </Screen>
  );
}

/* ───────────────────────────── Hero ───────────────────────────── */

function Hero({ team, goal }: { team: Team; goal: { progress_pct: number; modeled_c: number; target_c: number; by_date: string; zone_name: string } | null }) {
  const t = useTranslations('community');
  const { f } = useCz();
  const pct = goal ? Math.round(goal.progress_pct) : null;
  const evidence = team.evidence ?? [];

  return (
    <Card tone="navy" pad={18} gap={16} style={{ borderRadius: R.xxl }}>
      {goal && pct != null ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <Ring pct={pct} size={104} stroke={11} color={B.lime} track="rgba(255,255,255,0.14)" label={`${f.pct(pct)} ${t('ofGoal')}`}>
            <Txt size={24} w={600} num color={B.white} style={{ lineHeight: 28 }}>
              {f.pct(pct)}
            </Txt>
            <Txt size={10} color="rgba(255,255,255,0.8)">
              {t('ofGoal')}
            </Txt>
          </Ring>
          <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
            <Label color={B.lime}>{t('headline')}</Label>
            <Txt size={24} w={600} num color={B.white} style={{ lineHeight: 28 }}>
              {f.dC(-Math.abs(goal.modeled_c), 2)}
            </Txt>
            <Txt size={12} color="rgba(255,255,255,0.8)">
              {t('goalOf', { target: f.dC(goal.target_c), date: f.date(goal.by_date, { month: 'short', year: 'numeric' }) })}
            </Txt>
          </View>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
            <Label color={B.lime}>{t('headline')}</Label>
            <Txt size={24} w={600} num color={B.white} style={{ lineHeight: 28 }}>
              {coolingText(f.dC, team.stats.cooling_c)}
            </Txt>
            <Txt size={12} color="rgba(255,255,255,0.8)">
              {t('noGoal.sub')}
            </Txt>
          </View>
          <CzButton label={t('noGoal.cta')} size="sm" href={href('S05')} />
        </View>
      )}

      {evidence.length ? (
        <View style={{ gap: 8 }}>
          <Label color="rgba(255,255,255,0.7)">{t('evidence')}</Label>
          {evidence.map((e) => (
            <View
              key={e.source}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: R.md, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }}>
              <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                <Txt size={13} w={600} color={B.white}>
                  {e.source}
                </Txt>
                <Txt size={11.5} color={WHITE_75}>
                  {f.loc(e.what)}
                </Txt>
              </View>
              <Tag label={e.agrees ? t('agrees') : t('noisy')} bg={e.agrees ? B.lime : 'rgba(255,255,255,0.16)'} fg={e.agrees ? B.limeInk : B.white} style={{ alignSelf: 'center' }} />
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

/* ───────────────────────────── Tasks ───────────────────────────── */

function TaskBoard({ tasks }: { tasks: TeamTask[] }) {
  const t = useTranslations('community');
  const { f } = useCz();
  const [col, setCol] = useState<TeamTask['status']>('todo');
  const list = tasks.filter((x) => x.status === col);
  const done = col === 'done';
  return (
    <Card pad={14} gap={10}>
      <Label style={{ paddingHorizontal: 4 }}>{t('tasks')}</Label>
      <Seg
        value={col}
        onChange={setCol}
        label={t('tasks')}
        options={COLS.map((s) => ({ label: t('colCount', { label: t(`cols.${s}`), n: f.loc(tasks.filter((x) => x.status === s).length) }), value: s }))}
      />
      {list.length ? (
        list.map((task) => {
          const av = avatarFor(task.assignee);
          return (
            <View
              key={task.id}
              role="group"
              label={t('taskA11y', { title: task.title, due: task.due, who: task.assignee })}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 4 }}>
              <Check on={done} />
              <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                <Txt size={13.5} w={500}>
                  {task.title}
                </Txt>
                <Txt size={11.5} dim>
                  {f.loc(task.due)}
                </Txt>
              </View>
              <Avatar ini={task.assignee} bg={av[0]} fg={av[1]} size={30} />
            </View>
          );
        })
      ) : (
        <Txt size={12.5} dim style={{ paddingHorizontal: 4, paddingVertical: 6 }}>
          {t('tasksEmpty')}
        </Txt>
      )}
    </Card>
  );
}

/* ───────────────────────────── Members ───────────────────────────── */

function Members({ team, meId }: { team: Team; meId: string }) {
  const t = useTranslations('community');
  const { c, f } = useCz();
  const members = [...team.members].sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : b.points - a.points));
  const empty = freePlaces(team);
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: 4, gap: 8 }}>
        <Label>{t('members')}</Label>
        <Txt size={11.5} dim num>
          {t('capacity', { n: f.loc(team.members.length), max: f.loc(team.max_members) })}
        </Txt>
      </View>
      <View style={{ backgroundColor: c.card, borderRadius: R.xl, paddingVertical: 6, paddingHorizontal: 16 }}>
        {members.map((m, i) => {
          const av = avatarFor(m.display_name);
          const role = t(`role.${m.role}`);
          return (
            <ListRow key={m.user_id} last={i === members.length - 1 && empty === 0}>
              <Avatar ini={initials(m.display_name)} bg={av[0]} fg={av[1]} size={38} />
              <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                <Txt size={13.5} w={600} lines={1}>
                  {m.display_name}
                </Txt>
                <Txt size={11.5} dim>
                  {m.user_id === meId ? t('roleYou', { role }) : role}
                </Txt>
              </View>
              <Txt size={13} w={600} num>
                {f.num(m.points)}
              </Txt>
            </ListRow>
          );
        })}
        {Array.from({ length: empty }).map((_, i) => (
          <ListRow key={`free-${i}`} last={i === empty - 1}>
            <View style={{ width: 38, height: 38, borderRadius: 19, borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.line }} />
            <Txt size={12.5} dim style={{ flex: 1 }}>
              {t('freePlace')}
            </Txt>
          </ListRow>
        ))}
      </View>
    </View>
  );
}

/* ───────────────────────────── Activity ───────────────────────────── */

function Activity({ team, isMember }: { team: Team; isMember: boolean }) {
  const t = useTranslations('community');
  const { c, f } = useCz();
  const codes = useCodeText();
  const list = team.activity ?? [];
  return (
    <View style={{ gap: 8 }}>
      <Label style={{ paddingHorizontal: 4 }}>{t('activity')}</Label>
      {list.length ? (
        <Card pad={0} gap={0} style={{ paddingVertical: 6, paddingHorizontal: 16 }}>
          {list.slice(0, 8).map((a, i) => (
            <ListRow key={a.id} last={i === Math.min(list.length, 8) - 1}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.soft, alignItems: 'center', justifyContent: 'center' }}>
                <span aria-hidden style={{ fontSize: 17, lineHeight: 1 }}>
                  {ACTION_EMOJI[a.action_type] ?? '🌱'}
                </span>
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                <Txt size={13.5} w={600} lines={1}>
                  {t('activityTitle', { action: codes.action(a.action_type), qty: f.loc(a.quantity) })}
                </Txt>
                <Txt size={11.5} dim lines={1}>
                  {t('activityMeta', { name: a.user_name, when: f.rel(a.created_at) })}
                </Txt>
              </View>
              <Txt size={12.5} w={600} num color={c.leaf}>
                {`+${f.num(a.points)}`}
              </Txt>
            </ListRow>
          ))}
        </Card>
      ) : (
        <Card gap={10}>
          <Txt size={13} dim>
            {t('activityEmpty')}
          </Txt>
          {isMember ? <CzButton label={t('logForTeam')} icon="camera" size="md" href={href('S14', undefined, { team: team.id })} /> : null}
        </Card>
      )}
    </View>
  );
}

const ACTION_EMOJI: Record<string, string> = {
  plant_tree: '🌳',
  plant_shrubs: '🪴',
  rooftop_garden: '🏡',
  cool_roof: '⬜',
  green_wall: '🌿',
  shade_structure: '⛱️',
  water_tree: '💧',
  awareness: '📣',
};

/* ───────────────────────────── Join / leave ───────────────────────────── */

function JoinStrip({ team, guest }: { team: Team; guest: boolean }) {
  const t = useTranslations('community');
  const { f } = useCz();
  const join = useJoinByCode();
  const errText = useTeamErrorText();
  const free = freePlaces(team);
  const onJoin = () => {
    if (guest) return requireAccount(t('noTeam.feature'));
    join.mutate(team.code, {
      onSuccess: (tm) => toast(t('joined', { name: tm.name }), { tone: 'success' }),
      onError: (e) => toast(errText(e), { tone: 'warn' }),
    });
  };
  if (free <= 0) return <Note tone="warn" icon={I.info}>{t('teamFull', { max: f.loc(team.max_members) })}</Note>;
  return (
    <Card tone="limeSoft" gap={10}>
      <Txt size={13} w={500}>
        {t('spotsLeft', { count: free, n: f.loc(free), max: f.loc(team.max_members) })}
      </Txt>
      <CzButton label={t('join')} icon="plus" size="md" onPress={onJoin} busy={join.isPending} />
    </Card>
  );
}

function LeaveButton({ team }: { team: Team }) {
  const t = useTranslations('community');
  const tc = useTranslations('common');
  const me = useMe();
  const leave = useLeaveTeam();
  const errText = useTeamErrorText();
  const [open, setOpen] = useState(false);
  const owner = team.owner_id === me.id && team.members.length <= 1;
  return (
    <>
      <GhostButton label={t('leave')} height={46} color={B.red} onPress={() => setOpen(true)} />
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title={t('leaveTitle', { name: team.name })}
        footer={
          <View style={{ gap: 8 }}>
            <CzButton
              label={t('leaveConfirm')}
              variant="navy"
              busy={leave.isPending}
              onPress={() =>
                leave.mutate(team.id, {
                  onSuccess: () => {
                    setOpen(false);
                    toast(t('left', { name: team.name }));
                    goReplace('S16');
                  },
                  onError: (e) => toast(errText(e), { tone: 'warn' }),
                })
              }
            />
            <GhostButton label={tc('cancel')} height={46} onPress={() => setOpen(false)} />
          </View>
        }>
        <Txt size={13.5} dim>
          {owner ? t('leaveOwnerBody') : t('leaveBody')}
        </Txt>
      </BottomSheet>
    </>
  );
}
