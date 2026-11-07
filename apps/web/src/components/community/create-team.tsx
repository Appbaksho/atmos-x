'use client';
/** S19 · Create a team (2–5 people), then invite by link / QR / code. */
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import {
  Card,
  Check,
  CzButton,
  EmptyState,
  Field,
  GhostButton,
  I,
  Icon,
  Label,
  Note,
  Screen,
  ScreenHeader,
  SkeletonCard,
  Stepper,
  Tap,
  Txt,
  View,
  href,
  requireAccount,
  useCz,
} from '@/components/cz';
import { MAX_TEAM_MEMBERS, MIN_TEAM_MEMBERS, useActiveGoal, useCreateTeam, useSession, useUpdateGoal } from '@/lib/data/hooks';
import type { Team } from '@/lib/data/types';

import { InviteCard } from './invite-card';
import { useTeamErrorText } from './shared';

export function CreateTeamScreen() {
  const t = useTranslations('community');
  const session = useSession();
  const [created, setCreated] = useState<Team | null>(null);

  if (!session.ready) {
    return (
      <Screen>
        <ScreenHeader title={t('newTeam')} />
        <SkeletonCard lines={4} />
      </Screen>
    );
  }
  if (session.isGuest) {
    return (
      <Screen>
        <ScreenHeader title={t('newTeam')} sub={t('newTeamSub')} />
        <EmptyState icon={I.lock} title={t('noTeam.title')} sub={t('noTeam.guestSub')} action={t('noTeam.create')} onAction={() => requireAccount(t('noTeam.feature'))} />
      </Screen>
    );
  }
  return created ? <Created team={created} /> : <CreateForm onCreated={setCreated} />;
}

function CreateForm({ onCreated }: { onCreated: (t: Team) => void }) {
  const t = useTranslations('community');
  const { c, f } = useCz();
  const goal = useActiveGoal();
  const create = useCreateTeam();
  const updateGoal = useUpdateGoal();
  const errText = useTeamErrorText();
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [size, setSize] = useState(MAX_TEAM_MEMBERS);
  const [isPublic, setPublic] = useState(true);
  const [useGoal, setUseGoal] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const g = goal.data ?? null;

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const n = name.trim();
    if (n.length < 3 || n.length > 60) return setErr(t('nameError'));
    setErr(null);
    create.mutate(
      { name: n, description: desc.trim() || null, max_members: size, is_public: isPublic },
      {
        // The active goal becomes the team's goal (its progress then counts for everyone).
        onSuccess: (tm) => (g && useGoal ? updateGoal.mutate({ id: g.id, patch: { team_id: tm.id } }, { onSettled: () => onCreated(tm) }) : onCreated(tm)),
        onError: (e2) => setErr(errText(e2)),
      },
    );
  };

  return (
    <Screen>
      <ScreenHeader
        title={t('newTeam')}
        sub={g ? t('newTeamSubGoal', { zone: g.zone_name, target: f.dC(g.target_c), date: f.date(g.by_date, { month: 'short', year: 'numeric' }) }) : t('newTeamSub')}
      />
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Card gap={14}>
          <Field label={t('teamName')} value={name} onChangeText={setName} placeholder={t('placeholder')} autoCapitalize="words" maxLength={60} error={err} required />
          <Field label={t('description')} value={desc} onChangeText={setDesc} placeholder={t('descriptionPh')} maxLength={160} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Label>{t('size')}</Label>
              <Txt size={12} dim>
                {t('sizeNote')}
              </Txt>
            </View>
            <Stepper
              value={f.loc(size)}
              label={t('size')}
              decDisabled={size <= MIN_TEAM_MEMBERS}
              incDisabled={size >= MAX_TEAM_MEMBERS}
              onDec={() => setSize((s) => Math.max(MIN_TEAM_MEMBERS, s - 1))}
              onInc={() => setSize((s) => Math.min(MAX_TEAM_MEMBERS, s + 1))}
            />
          </View>
        </Card>

        <Card pad={6} gap={0} style={{ paddingHorizontal: 12 }}>
          <CheckRow label={t('public')} sub={t('publicSub')} on={isPublic} onToggle={() => setPublic((v) => !v)} last={!g} />
          {g ? <CheckRow label={t('linkGoal', { zone: g.zone_name })} on={useGoal} onToggle={() => setUseGoal((v) => !v)} last /> : null}
        </Card>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 }}>
          <Icon d={I.info} size={14} sw={2} color={c.ink2} />
          <Txt size={12} dim style={{ flex: 1 }}>
            {t('deviceNote')}
          </Txt>
        </View>

        <CzButton label={create.isPending ? t('creating') : t('create')} icon="check" type="submit" busy={create.isPending} />
      </form>
    </Screen>
  );
}

function CheckRow({ label, sub, on, onToggle, last }: { label: string; sub?: string; on: boolean; onToggle: () => void; last?: boolean }) {
  const { c } = useCz();
  return (
    <Tap
      role="checkbox"
      selected={on}
      label={label}
      onPress={onToggle}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 4, minHeight: 56, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.line, textAlign: 'start' }}>
      <Check on={on} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Txt size={13.5} w={500}>
          {label}
        </Txt>
        {sub ? (
          <Txt size={11.5} dim>
            {sub}
          </Txt>
        ) : null}
      </View>
    </Tap>
  );
}

function Created({ team }: { team: Team }) {
  const t = useTranslations('community');
  const { f } = useCz();
  return (
    <Screen>
      <ScreenHeader title={team.name} sub={t('created')} />
      <Note icon={I.checkSm}>{t('createdSub', { max: f.loc(team.max_members) })}</Note>
      <Card gap={14}>
        <InviteCard team={team} initial="qr" />
      </Card>
      <CzButton label={t('openTeam')} icon="arrow" href={href('S17', { id: team.id })} />
      <GhostButton label={t('hub')} href={href('S16')} height={46} />
    </Screen>
  );
}
