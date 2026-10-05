'use client';
/**
 * /join/[code]: invite landing (outside the app shell). Explains Atmos X, previews the team, and
 * joins: guests register first (we come back here with ?join=1 and join automatically).
 */
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import {
  Avatar,
  B,
  Card,
  CzButton,
  GhostButton,
  I,
  Icon,
  Note,
  R,
  Screen,
  SkeletonCard,
  SourceChips,
  Txt,
  View,
  goReplace,
  href,
  toast,
  useCz,
} from '@/components/cz';
import { type RemoteInvite, useJoinByCode, useMe, useSession, useTeamByCode } from '@/lib/data/hooks';
import type { Team } from '@/lib/data/types';

import { decodeInvite, formatCode, type InvitePayload } from './invite-link';
import { avatarFor, freePlaces, teamInitials, useTeamErrorText } from './shared';

const safeDecode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

export function JoinScreen({ code: rawCode, payload, autoJoin }: { code: string; payload?: string | null; autoJoin?: boolean }) {
  const t = useTranslations('community.joinPage');
  const code = formatCode(safeDecode(rawCode));
  const session = useSession();
  const preview = decodeInvite(payload);
  const invite = preview ? toRemoteInvite(preview) : null;
  const team = useTeamByCode(code, invite);

  return (
    <Screen gap={16} style={{ paddingBottom: 40 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 8 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/atmosx-logo.png" alt="Atmos X" width={36} height={36} style={{ borderRadius: 10 }} />
        <Txt display size={16}>
          Atmos X
        </Txt>
      </View>

      <View style={{ gap: 8 }}>
        <Txt display size={24} as="h1">
          {t('title')}
        </Txt>
        <Txt size={13.5} dim>
          {t('pitch')}
        </Txt>
      </View>

      {!session.ready || team.isPending ? (
        <SkeletonCard lines={3} height={200} />
      ) : team.data ? (
        <Found team={team.data} autoJoin={!!autoJoin} invite={invite} payload={payload ?? null} />
      ) : (
        <NotFound code={code} preview={preview} />
      )}
    </Screen>
  );
}

function TeamCard({ name, meta, org, by, code }: { name: string; meta: string; org?: string | null; by?: string | null; code: string }) {
  const t = useTranslations('community.joinPage');
  const tc = useTranslations('community');
  const av = avatarFor(name);
  return (
    <Card tone="navy" pad={18} gap={14} style={{ borderRadius: R.xxl }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar ini={teamInitials(name)} bg={av[0] === B.navy ? B.lime : av[0]} fg={av[0] === B.navy ? B.limeInk : av[1]} size={48} square />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Txt size={17} w={600} color={B.white}>
            {name}
          </Txt>
          <Txt size={12} color="rgba(255,255,255,0.78)">
            {meta}
          </Txt>
        </View>
      </View>
      {org || by ? (
        <View style={{ gap: 4 }}>
          {org ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon d={I.check} size={14} sw={2.6} color={B.lime} />
              <Txt size={12.5} color={B.white}>
                {t('inOrg', { org })}
              </Txt>
            </View>
          ) : null}
          {by ? (
            <Txt size={12.5} color="rgba(255,255,255,0.78)">
              {t('by', { name: by })}
            </Txt>
          ) : null}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.14)' }}>
        <Txt size={11} w={600} color="rgba(255,255,255,0.7)" style={{ textTransform: 'uppercase', letterSpacing: 0.66 }}>
          {t('codeLabel')}
        </Txt>
        <Txt size={16} w={600} color={B.lime} style={{ fontFamily: MONO, direction: 'ltr' }} selectable>
          <span aria-label={`${tc('codeA11y')}: ${code.split('').join(' ')}`}>{code}</span>
        </Txt>
      </View>
    </Card>
  );
}

/** Invite-link preview → the data layer's RemoteInvite (teams made on another device). */
function toRemoteInvite(p: InvitePayload): RemoteInvite {
  return { id: p.i, name: p.n, max_members: p.m, members: p.c, org_name: p.o ?? null, emoji: p.e, inviter: p.by ?? null };
}

function Found({ team, autoJoin, invite, payload }: { team: Team; autoJoin: boolean; invite: RemoteInvite | null; payload: string | null }) {
  const t = useTranslations('community.joinPage');
  const tc = useTranslations('community');
  const { f } = useCz();
  const session = useSession();
  const me = useMe();
  const join = useJoinByCode();
  const errText = useTeamErrorText();
  const [error, setError] = useState<string | null>(null);
  const tried = useRef(false);
  const member = team.members.some((m) => m.user_id === me.id);
  const full = freePlaces(team) <= 0;
  const next = href('join', { code: team.code }, payload ? { join: 1, t: payload } : { join: 1 });

  const doJoin = () => {
    setError(null);
    join.mutate({ code: team.code, invite }, {
      onSuccess: (tm) => {
        toast(tc('joined', { name: tm.name }), { tone: 'success' });
        goReplace('S17', { id: tm.id });
      },
      onError: (e) => setError(errText(e)),
    });
  };

  useEffect(() => {
    if (!autoJoin || tried.current || session.isGuest || member || full) return;
    tried.current = true;
    doJoin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoJoin, session.isGuest, member, full]);

  const meta = t('teamOf', { n: f.loc(team.members.length), max: f.loc(team.max_members) });
  return (
    <View style={{ gap: 14 }}>
      <TeamCard name={team.name} meta={meta} org={team.org_name} code={team.code} />
      {team.description ? (
        <Txt size={13} dim style={{ paddingHorizontal: 4 }}>
          {team.description}
        </Txt>
      ) : null}
      {error ? <Note tone="warn" icon={I.warn}>{error}</Note> : null}
      {member ? (
        <>
          <Note icon={I.checkSm}>{t('already', { name: team.name })}</Note>
          <CzButton label={t('openTeam')} icon="arrow" href={href('S17', { id: team.id })} />
        </>
      ) : full ? (
        <>
          <Note tone="warn" icon={I.info}>
            {t('full', { max: f.loc(team.max_members) })}
          </Note>
          <GhostButton label={t('openApp')} href={href('S16')} />
        </>
      ) : session.isGuest ? (
        <>
          <Txt size={13} dim style={{ paddingHorizontal: 4 }}>
            {t('guest')}
          </Txt>
          <CzButton label={t('create')} icon="arrow" href={href('register', undefined, { next })} />
          <GhostButton label={t('signIn')} href={href('login', undefined, { next })} height={46} />
        </>
      ) : (
        <CzButton label={join.isPending ? t('joining') : t('join', { name: team.name })} icon="plus" onPress={doJoin} busy={join.isPending} />
      )}
      <SourceChips demo={team.members.length > 1} sources={[{ id: 'device', name: 'This device' }]} />
    </View>
  );
}

function NotFound({ code, preview }: { code: string; preview: InvitePayload | null }) {
  const t = useTranslations('community.joinPage');
  const { f } = useCz();
  if (preview) {
    return (
      <View style={{ gap: 14 }}>
        <TeamCard name={preview.n} meta={t('teamOf', { n: f.loc(preview.c), max: f.loc(preview.m) })} org={preview.o} by={preview.by} code={code} />
        <Note tone="warn" icon={I.info}>
          {t('remote')}
        </Note>
        <CzButton label={t('openApp')} icon="arrow" href={href('S16')} />
      </View>
    );
  }
  return (
    <View style={{ gap: 14 }}>
      <Note tone="warn" icon={I.warn}>
        {t('invalid', { code })}
      </Note>
      <CzButton label={t('openApp')} icon="arrow" href={href('S16')} />
    </View>
  );
}
