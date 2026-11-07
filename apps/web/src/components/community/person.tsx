'use client';
/** C5 · Public profile (/app/u/[id]): photo, name, area, bio, points and level, badges, trees, teams, posts; follow, block, report. */
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { B, BottomSheet, Card, CzButton, EmptyState, ErrorState, GhostButton, I, Label, R, Screen, ScreenHeader, SkeletonCard, StatTile, Tap, Txt, View, href, requireAccount, toast, useCz } from '@/components/cz';
import { useCodeText } from '@/components/profile/codes';
import { useBlock, useFeed, useFollow, useSession, useUserProfile } from '@/lib/data/hooks';
import type { PublicProfile } from '@/lib/data/types';

import { PersonAvatar, PostCard, ReportSheet } from './feed';

export function ProfilePage({ id }: { id: string }) {
  const t = useTranslations('community.person');
  const q = useUserProfile(id);
  if (q.isPending) {
    return (
      <Screen>
        <ScreenHeader title={t('title')} />
        <SkeletonCard lines={3} height={200} />
      </Screen>
    );
  }
  if (q.isError || !q.data) {
    return (
      <Screen>
        <ScreenHeader title={t('title')} />
        <EmptyState icon={I.profile} title={t('notFound')} sub={t('notFoundSub')} action={t('back')} actionHref={href('S16')} />
      </Screen>
    );
  }
  return <Body p={q.data} />;
}

function Body({ p }: { p: PublicProfile }) {
  const t = useTranslations('community.person');
  const { c, f } = useCz();
  const { badge, level } = useCodeText();
  const session = useSession();
  const follow = useFollow();
  const block = useBlock();
  const [menu, setMenu] = useState(false);
  const [report, setReport] = useState(false);
  const posts = useFeed('area', { user_id: p.id });
  const list = posts.data?.pages.flatMap((x) => x.posts) ?? [];
  const guard = (fn: () => void) => () => (session.isGuest ? requireAccount(t('feature')) : fn());

  return (
    <Screen>
      <ScreenHeader title={p.display_name} sub={[p.area, p.city].filter(Boolean).join(' · ') || undefined} right={!p.is_me ? <GhostButton label="⋯" height={40} onPress={guard(() => setMenu(true))} style={{ paddingHorizontal: 14 }} /> : null} />
      <Card tone="navy" pad={18} gap={14} style={{ borderRadius: R.xxl }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <PersonAvatar name={p.display_name} src={p.avatar_url} size={64} />
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <Txt size={20} w={600} color={B.white} lines={1}>
              {p.display_name}
            </Txt>
            <Txt size={12.5} color="rgba(255,255,255,0.8)">
              {`${level(p.level.name_code)} · ${t('level', { n: f.loc(p.level.level) })}`}
            </Txt>
            {p.is_demo ? (
              <Txt size={11} w={600} color={B.lime}>
                {t('demo')}
              </Txt>
            ) : null}
          </View>
        </View>
        {p.bio ? (
          <Txt size={13} color={B.white}>
            {p.bio}
          </Txt>
        ) : null}
        {!p.is_me ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <CzButton
              label={p.is_following ? t('following') : t('follow')}
              size="sm"
              variant={p.is_following ? 'navy' : undefined}
              busy={follow.isPending}
              onPress={guard(() => follow.mutate({ user_id: p.id, on: !p.is_following }))}
            />
            <Txt size={12} color="rgba(255,255,255,0.8)" style={{ alignSelf: 'center' }}>
              {t('followers', { count: p.followers, n: f.loc(p.followers) })}
            </Txt>
          </View>
        ) : (
          <Txt size={12} color="rgba(255,255,255,0.8)">
            {t('followers', { count: p.followers, n: f.loc(p.followers) })}
          </Txt>
        )}
      </Card>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <StatTile label={t('points')} value={f.num(p.points)} />
        <StatTile label={t('trees')} value={f.loc(p.trees)} />
        <StatTile label={t('actions')} value={f.loc(p.actions)} />
      </View>
      {p.badges.length ? (
        <View style={{ gap: 8 }}>
          <Label style={{ paddingHorizontal: 4 }}>{t('badges')}</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {p.badges.map((b) => (
              <View key={b.id} role="img" label={badge(b.code)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: R.pill, backgroundColor: c.card }}>
                <span aria-hidden>{b.emoji}</span>
                <Txt size={12} w={600}>
                  {badge(b.code)}
                </Txt>
              </View>
            ))}
          </View>
        </View>
      ) : null}
      {p.teams.length ? (
        <View style={{ gap: 8 }}>
          <Label style={{ paddingHorizontal: 4 }}>{t('teams')}</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {p.teams.map((tm) => (
              <Tap key={tm.id} label={tm.name} href={href('S17', { id: tm.id })} style={{ minHeight: 36, paddingHorizontal: 12, borderRadius: R.pill, backgroundColor: c.card, justifyContent: 'center' }}>
                <Txt size={12.5} w={600}>
                  {`${tm.emoji ?? ''} ${tm.name}`.trim()}
                </Txt>
              </Tap>
            ))}
          </View>
        </View>
      ) : null}
      <View style={{ gap: 8 }}>
        <Label style={{ paddingHorizontal: 4 }}>{t('posts')}</Label>
        {posts.isPending ? <SkeletonCard lines={2} height={120} /> : posts.isError ? <ErrorState compact error={posts.error} /> : list.length ? list.map((x) => <PostCard key={x.id} post={x} />) : <Txt size={12.5} dim style={{ paddingHorizontal: 4 }}>{t('noPosts')}</Txt>}
      </View>
      <BottomSheet open={menu} onClose={() => setMenu(false)} title={p.display_name}>
        <View style={{ gap: 8 }}>
          <GhostButton label={t('report')} height={46} onPress={() => setReport(true)} />
          <GhostButton
            label={p.blocked ? t('unblock') : t('block')}
            height={46}
            color={p.blocked ? undefined : B.red}
            onPress={() =>
              block.mutate(
                { user_id: p.id, on: !p.blocked },
                {
                  onSuccess: (r) => {
                    setMenu(false);
                    toast(r.blocked ? t('blocked') : t('unblocked'));
                  },
                },
              )
            }
          />
        </View>
      </BottomSheet>
      <ReportSheet
        open={report}
        target="user"
        targetId={p.id}
        onClose={() => {
          setReport(false);
          setMenu(false);
        }}
      />
    </Screen>
  );
}
