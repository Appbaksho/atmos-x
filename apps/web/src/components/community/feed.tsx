'use client';
/**
 * C6 · Feed: posts with a photo and text, likes, comments and @mentions, filtered by Area (3 km),
 * City or Following. Photos wait for moderation before others see them. Each post has a menu to
 * report it, block its author or delete it. `PostPage` shows one post with its comments.
 */
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { ACTION_ICON, qtyText } from '@/components/act/action-meta';
import {
  Avatar,
  B,
  BottomSheet,
  Card,
  CzButton,
  EmptyState,
  ErrorState,
  GhostButton,
  I,
  Icon,
  Note,
  OptionRow,
  Photo,
  R,
  Screen,
  ScreenHeader,
  Seg,
  SkeletonCard,
  Tap,
  Txt,
  View,
  goReplace,
  href,
 
  requireAccount,
  toast,
  useCz,
} from '@/components/cz';
import { initials } from '@/lib/format';
import {
  ACTION_BY_ID,
  isGuestRestricted,
  useAddComment,
  useBlock,
  useCreatePost,
  useDeleteComment,
  useDeletePost,
  useFeed,
  useLike,
  usePost,
  useReport,
  useSession,
  useTeams,
} from '@/lib/data/hooks';
import type { FeedFilter, Post, PostComment, ReportReason, ReportTarget } from '@/lib/data/types';

import { avatarFor } from './shared';

const FILTERS: FeedFilter[] = ['area', 'city', 'following'];
const REASONS: ReportReason[] = ['spam', 'abuse', 'nudity', 'violence', 'fake', 'dangerous', 'other'];
const MENTION = /@\[([^\]]{1,80})\]\(([0-9a-f-]{36})\)/g;

/** Body text with `@[Name](id)` mentions as profile links. */
function Body({ text }: { text: string }) {
  const { c } = useCz();
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(MENTION)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    out.push(
      <a key={m.index} href={href('user', { id: m[2] })} style={{ color: c.leaf, fontWeight: 600, textDecoration: 'none' }}>
        @{m[1]}
      </a>,
    );
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return (
    <Txt size={14} style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
      {out}
    </Txt>
  );
}

export function PersonAvatar({ name, src, size = 36 }: { name: string; src?: string | null; size?: number }) {
  const av = avatarFor(name || '?');
  return <Avatar ini={initials(name || '?')} bg={av[0]} fg={av[1]} size={size} src={src ?? undefined} />;
}

/* ───────────────────────────── Feed section (hub) ───────────────────────────── */

export function FeedSection() {
  const t = useTranslations('community.feed');
  const session = useSession();
  const [filter, setFilter] = useState<FeedFilter>('area');
  const feed = useFeed(filter);
  const posts = feed.data?.pages.flatMap((p) => p.posts) ?? [];
  const status = feed.data?.pages[0]?.status;

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingHorizontal: 4 }}>
        <Txt display size={16} as="h2">
          {t('title')}
        </Txt>
      </View>
      <Seg tone="card" height={38} label={t('filterL')} value={filter} onChange={setFilter} options={FILTERS.map((f) => ({ label: t(`filter.${f}`), value: f }))} />
      {session.ready && !session.isGuest ? <Composer /> : null}
      {feed.isPending ? (
        <SkeletonCard lines={3} height={160} />
      ) : feed.isError ? (
        <ErrorState error={feed.error} onRetry={() => void feed.refetch()} />
      ) : !posts.length ? (
        <EmptyState icon={I.community} title={t(status === 'no_place' ? 'noPlace' : status === 'no_follows' || filter === 'following' ? 'noFollows' : 'empty')} sub={t('emptySub')} />
      ) : (
        <View style={{ gap: 10 }}>
          {posts.map((p) => (
            <PostCard key={p.id} post={p} />
          ))}
          {feed.hasNextPage ? <GhostButton label={t('more')} height={44} onPress={() => void feed.fetchNextPage()} disabled={feed.isFetchingNextPage} /> : null}
        </View>
      )}
    </View>
  );
}

/* ───────────────────────────── Composer ───────────────────────────── */

function Composer() {
  const t = useTranslations('community.feed');
  const { c } = useCz();
  const create = useCreatePost();
  const teams = useTeams();
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [team, setTeam] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => () => void (photo && URL.revokeObjectURL(photo.url)), [photo]);

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!text.trim() && !photo) return;
    create.mutate(
      { body: text.trim(), photo: photo?.blob ?? null, team_id: team },
      {
        onSuccess: (p) => {
          setText('');
          setPhoto(null);
          toast(p.photo_pending ? t('postedPending') : t('posted'), { tone: 'success' });
        },
        onError: (er) => (isGuestRestricted(er) ? requireAccount(t('feature')) : toast((er as Error).message, { tone: 'warn' })),
      },
    );
  };

  return (
    <Card pad={12} gap={10}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={2000}
          rows={2}
          placeholder={t('ph')}
          aria-label={t('ph')}
          style={{ width: '100%', resize: 'vertical', borderRadius: 14, border: `1.5px solid ${c.line}`, backgroundColor: c.bg, color: c.ink, padding: 12, fontSize: 16, fontFamily: 'var(--cz-font-body)' }}
        />
        {photo ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
            <img src={photo.url} alt={t('photoAlt')} width={56} height={56} style={{ width: 56, height: 56, borderRadius: 12, objectFit: 'cover' }} />
            <Txt size={12} dim style={{ flex: 1 }}>
              {t('photoNote')}
            </Txt>
            <Tap label={t('removePhoto')} onPress={() => setPhoto(null)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.soft, alignItems: 'center', justifyContent: 'center' }}>
              <Icon d={I.close} size={14} sw={2.2} />
            </Tap>
          </View>
        ) : null}
        {teams.data?.length ? (
          <View role="radiogroup" label={t('teamL')} style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            {[{ id: null as string | null, name: t('noTeam') }, ...teams.data.map((x) => ({ id: x.id as string | null, name: x.name }))].map((o) => (
              <Tap key={o.id ?? 'none'} role="radio" selected={team === o.id} label={o.name} onPress={() => setTeam(o.id)} style={{ minHeight: 32, paddingHorizontal: 12, borderRadius: R.pill, backgroundColor: team === o.id ? c.solid : c.soft, justifyContent: 'center' }}>
                <Txt size={12} w={600} color={team === o.id ? c.onSolid : c.ink}>
                  {o.name}
                </Txt>
              </Tap>
            ))}
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <input
            ref={file}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) setPhoto({ blob: f, url: URL.createObjectURL(f) });
            }}
          />
          <Tap label={t('addPhoto')} onPress={() => file.current?.click()} style={{ height: 40, paddingHorizontal: 12, borderRadius: R.pill, backgroundColor: c.soft, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon d={I.camera} size={16} sw={1.8} />
            <Txt size={12.5} w={600}>
              {t('addPhoto')}
            </Txt>
          </Tap>
          <View style={{ flex: 1 }} />
          <CzButton label={t('post')} size="sm" variant="navy" type="submit" busy={create.isPending} disabled={!text.trim() && !photo} />
        </View>
      </form>
    </Card>
  );
}

/* ───────────────────────────── Post card ───────────────────────────── */

export function PostCard({ post, open = false }: { post: Post; open?: boolean }) {
  const t = useTranslations('community.feed');
  const ta = useTranslations('act');
  const tu = useTranslations('act.unit');
  const { c, f } = useCz();
  const session = useSession();
  const like = useLike();
  const [menu, setMenu] = useState(false);
  const name = post.author?.display_name ?? '';
  const onLike = () => {
    if (session.isGuest) return requireAccount(t('feature'));
    like.mutate({ post_id: post.id, on: !post.liked });
  };
  return (
    <Card pad={14} gap={10} style={post.hidden ? { opacity: 0.6 } : undefined}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Tap label={name} href={post.author ? href('user', { id: post.author.id }) : undefined} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, textAlign: 'start' }}>
          <PersonAvatar name={name} src={post.author?.avatar_url} />
          <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
            <Txt size={13.5} w={600} lines={1}>
              {name}
            </Txt>
            <Txt size={11.5} dim lines={1}>
              {[post.team?.name, post.area, f.rel(post.created_at)].filter(Boolean).join(' · ')}
            </Txt>
          </View>
        </Tap>
        {post.is_demo ? (
          <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: R.pill, backgroundColor: c.soft }}>
            <Txt size={10.5} w={600}>
              {t('demo')}
            </Txt>
          </View>
        ) : null}
        <Tap label={t('menu')} onPress={() => (session.isGuest ? requireAccount(t('feature')) : setMenu(true))} style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}>
          <Txt size={18} w={700} aria-hidden>
            ⋯
          </Txt>
        </Tap>
      </View>
      {post.body ? <Body text={post.body} /> : null}
      {post.action ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: R.md, backgroundColor: c.limeSoft }}>
          <Icon d={ACTION_ICON[post.action.action_type]} size={18} sw={1.8} />
          <Txt size={12.5} w={600} style={{ flex: 1 }}>
            {`${ta(`type.${post.action.action_type}`)} · ${qtyText(tu, ACTION_BY_ID[post.action.action_type]?.unit_code ?? 'unit.tree', post.action.quantity, f.loc)}`}
          </Txt>
          <Txt size={12} w={700} num color={c.leaf}>
            {`+${f.num(post.action.points)}`}
          </Txt>
        </View>
      ) : null}
      {post.photo_url ? (
        <Photo src={post.photo_url} label={t('photoAlt')} style={{ height: 240, borderRadius: R.lg, backgroundColor: B.photoBg2 }} />
      ) : post.photo_pending && post.mine ? (
        <Note tone="warn" icon={I.clock}>
          {t('photoWaiting')}
        </Note>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <Tap label={post.liked ? t('unlike') : t('like')} selected={post.liked} haptic onPress={onLike} style={{ height: 36, paddingHorizontal: 12, borderRadius: R.pill, backgroundColor: post.liked ? c.limeSoft : c.soft, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <span aria-hidden style={{ fontSize: 14 }}>
            {post.liked ? '💚' : '🤍'}
          </span>
          <Txt size={12.5} w={600} num>
            {f.loc(post.likes)}
          </Txt>
        </Tap>
        {!open ? (
          <Tap label={t('comments', { count: post.comments, n: f.loc(post.comments) })} href={href('post', { id: post.id })} style={{ height: 36, paddingHorizontal: 12, borderRadius: R.pill, backgroundColor: c.soft, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <span aria-hidden style={{ fontSize: 14 }}>
              💬
            </span>
            <Txt size={12.5} w={600}>
              {t('comments', { count: post.comments, n: f.loc(post.comments) })}
            </Txt>
          </Tap>
        ) : null}
      </View>
      <PostMenu open={menu} onClose={() => setMenu(false)} post={post} />
    </Card>
  );
}

function PostMenu({ open, onClose, post }: { open: boolean; onClose: () => void; post: Post }) {
  const t = useTranslations('community.feed');
  const del = useDeletePost();
  const block = useBlock();
  const [report, setReport] = useState(false);
  return (
    <>
      <BottomSheet open={open && !report} onClose={onClose} title={t('menuTitle')}>
        <View style={{ gap: 8 }}>
          {post.can_delete ? (
            <GhostButton
              label={t('delete')}
              height={46}
              color={B.red}
              onPress={() =>
                del.mutate(post.id, {
                  onSuccess: () => {
                    onClose();
                    toast(t('deleted'));
                  },
                })
              }
            />
          ) : null}
          {!post.mine ? <GhostButton label={t('report')} height={46} onPress={() => setReport(true)} /> : null}
          {!post.mine && post.author ? (
            <GhostButton
              label={t('block', { name: post.author.display_name })}
              height={46}
              onPress={() =>
                block.mutate(
                  { user_id: post.author!.id, on: true },
                  {
                    onSuccess: () => {
                      onClose();
                      toast(t('blocked', { name: post.author!.display_name }));
                    },
                  },
                )
              }
            />
          ) : null}
        </View>
      </BottomSheet>
      <ReportSheet
        open={open && report}
        target="post"
        targetId={post.id}
        onClose={() => {
          setReport(false);
          onClose();
        }}
      />
    </>
  );
}

/** C13: report a post, comment, photo or person with a reason. */
export function ReportSheet({ open, onClose, target, targetId }: { open: boolean; onClose: () => void; target: ReportTarget; targetId: string }) {
  const t = useTranslations('community.report');
  const report = useReport();
  const [reason, setReason] = useState<ReportReason>('spam');
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t('title')}
      sub={t('sub')}
      footer={
        <CzButton
          label={t('send')}
          busy={report.isPending}
          onPress={() =>
            report.mutate(
              { target_type: target, target_id: targetId, reason },
              {
                onSuccess: () => {
                  toast(t('thanks'), { tone: 'success' });
                  onClose();
                },
              },
            )
          }
        />
      }>
      <View role="radiogroup" label={t('title')} style={{ gap: 6 }}>
        {REASONS.map((r) => (
          <OptionRow key={r} title={t(`reason.${r}`)} selected={reason === r} onPress={() => setReason(r)} />
        ))}
      </View>
    </BottomSheet>
  );
}

/* ───────────────────────────── Post page ───────────────────────────── */

export function PostPage({ id }: { id: string }) {
  const t = useTranslations('community.feed');
  const q = usePost(id);
  if (q.isPending) {
    return (
      <Screen>
        <ScreenHeader title={t('postTitle')} />
        <SkeletonCard lines={4} height={220} />
      </Screen>
    );
  }
  if (q.isError || !q.data) {
    return (
      <Screen>
        <ScreenHeader title={t('postTitle')} />
        <ErrorState error={q.error} title={t('notFound')} onRetry={() => void q.refetch()} />
        <GhostButton label={t('back')} href={href('S16')} />
      </Screen>
    );
  }
  const post = q.data;
  return (
    <Screen>
      <ScreenHeader title={t('postTitle')} />
      <PostCard post={post} open />
      <Comments post={post} comments={post.comment_list} />
    </Screen>
  );
}

function Comments({ post, comments }: { post: Post; comments: PostComment[] }) {
  const t = useTranslations('community.feed');
  const { c, f } = useCz();
  const session = useSession();
  const add = useAddComment();
  const del = useDeleteComment();
  const teams = useTeams();
  const [text, setText] = useState('');
  const [pick, setPick] = useState(false);
  const people = [...new Map((teams.data ?? []).flatMap((tm) => tm.members).filter((m) => m.user_id !== session.user.id).map((m) => [m.user_id, m])).values()];

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (session.isGuest) return requireAccount(t('feature'));
    if (!text.trim()) return;
    add.mutate({ post_id: post.id, body: text.trim() }, { onSuccess: () => setText(''), onError: (er) => toast((er as Error).message, { tone: 'warn' }) });
  };

  return (
    <View style={{ gap: 8 }}>
      <Txt label as="h2" style={{ paddingHorizontal: 4 }}>
        {t('comments', { count: comments.length, n: f.loc(comments.length) })}
      </Txt>
      <Card pad={12} gap={10}>
        {comments.length ? (
          comments.map((cm) => (
            <View key={cm.id} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
              <PersonAvatar name={cm.author?.display_name ?? ''} src={cm.author?.avatar_url} size={30} />
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Txt size={12} w={600}>
                  {`${cm.author?.display_name ?? ''} · ${f.rel(cm.created_at)}`}
                </Txt>
                <Body text={cm.body} />
              </View>
              {cm.can_delete ? (
                <Tap label={t('deleteComment')} onPress={() => del.mutate(cm.id)} style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon d={I.close} size={13} sw={2} color={c.ink2} />
                </Tap>
              ) : null}
            </View>
          ))
        ) : (
          <Txt size={12.5} dim>
            {t('noComments')}
          </Txt>
        )}
        <form onSubmit={submit} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={1000}
            placeholder={t('commentPh')}
            aria-label={t('commentPh')}
            style={{ flex: 1, minWidth: 0, height: 42, borderRadius: 999, border: `1.5px solid ${c.line}`, backgroundColor: c.bg, color: c.ink, paddingInline: 14, fontSize: 16 }}
          />
          {people.length ? <GhostButton label="@" height={42} onPress={() => setPick(true)} style={{ paddingHorizontal: 14 }} /> : null}
          <CzButton label={t('send')} size="sm" variant="navy" type="submit" busy={add.isPending} disabled={!text.trim()} />
        </form>
      </Card>
      <BottomSheet open={pick} onClose={() => setPick(false)} title={t('mention')}>
        <View style={{ gap: 6 }}>
          {people.map((m) => (
            <OptionRow
              key={m.user_id}
              title={m.display_name}
              selected={false}
              onPress={() => {
                setText((s) => `${s}${s && !s.endsWith(' ') ? ' ' : ''}@[${m.display_name}](${m.user_id}) `);
                setPick(false);
              }}
            />
          ))}
        </View>
      </BottomSheet>
    </View>
  );
}

/** After deleting from the post page, go back to the community. */
export function useAfterDelete() {
  return () => goReplace('S16');
}
