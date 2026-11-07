'use client';
/** C13 · Moderator queue: open reports (hide, block, dismiss) and public photos waiting for review (approve, reject). */
import { useTranslations } from 'next-intl';

import { B, Card, CzButton, EmptyState, ErrorState, GhostButton, I, Label, Photo, R, Screen, ScreenHeader, SkeletonCard, Txt, View, href, useCz } from '@/components/cz';
import { useModerate, useModerationQueue, useSession } from '@/lib/data/hooks';

export function ModerationPage() {
  const t = useTranslations('community.mod');
  const tr = useTranslations('community.report');
  const { f } = useCz();
  const session = useSession();
  const isMod = session.role === 'moderator' || session.role === 'admin';
  const q = useModerationQueue(isMod);
  const act = useModerate();

  if (session.ready && !isMod) {
    return (
      <Screen>
        <ScreenHeader title={t('title')} />
        <EmptyState icon={I.lock} title={t('notMod')} action={t('back')} actionHref={href('S16')} />
      </Screen>
    );
  }
  return (
    <Screen>
      <ScreenHeader title={t('title')} sub={t('sub')} />
      {q.isPending ? (
        <SkeletonCard lines={4} height={200} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <Label style={{ paddingHorizontal: 4 }}>{t('photos', { n: f.loc(q.data.photos.length) })}</Label>
          {q.data.photos.length ? (
            <View style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
              {q.data.photos.map((p) => (
                <Card key={p.id} pad={8} gap={8}>
                  <Photo src={p.photo_url} label={t('photoAlt', { purpose: p.purpose })} style={{ height: 130, borderRadius: R.md, backgroundColor: B.photoBg2 }} />
                  <Txt size={11.5} dim lines={1}>
                    {`${t(`purpose.${p.purpose}`)} · ${p.owner?.display_name ?? ''}`}
                  </Txt>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <CzButton label={t('approve')} size="sm" busy={act.isPending} onPress={() => act.mutate({ target_type: 'photo', target_id: p.id, action: 'approve' })} />
                    <GhostButton label={t('reject')} height={38} onPress={() => act.mutate({ target_type: 'photo', target_id: p.id, action: 'reject' })} />
                  </View>
                </Card>
              ))}
            </View>
          ) : (
            <Txt size={12.5} dim style={{ paddingHorizontal: 4 }}>
              {t('noPhotos')}
            </Txt>
          )}
          <Label style={{ paddingHorizontal: 4 }}>{t('reports', { n: f.loc(q.data.reports.length) })}</Label>
          {q.data.reports.length ? (
            q.data.reports.map((r) => (
              <Card key={r.id} gap={8}>
                <Txt size={13.5} w={600}>
                  {`${t(`target.${r.target_type}`)} · ${tr(`reason.${r.reason}`)}`}
                </Txt>
                <Txt size={11.5} dim>
                  {`${r.target_id} · ${f.rel(r.created_at)}`}
                </Txt>
                {r.note ? <Txt size={12.5}>{r.note}</Txt> : null}
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                  {r.target_type === 'post' ? <GhostButton label={t('open')} height={38} href={href('post', { id: r.target_id })} /> : null}
                  {r.target_type === 'user' ? <GhostButton label={t('open')} height={38} href={href('user', { id: r.target_id })} /> : null}
                  {r.target_type === 'post' || r.target_type === 'comment' ? (
                    <CzButton label={t('hide')} size="sm" variant="navy" onPress={() => act.mutate({ report_id: r.id, target_type: r.target_type, target_id: r.target_id, action: 'hide' })} />
                  ) : null}
                  {r.target_type === 'photo' ? <CzButton label={t('reject')} size="sm" variant="navy" onPress={() => act.mutate({ report_id: r.id, target_type: 'photo', target_id: r.target_id, action: 'reject' })} /> : null}
                  {r.target_type === 'user' ? <CzButton label={t('block')} size="sm" variant="navy" onPress={() => act.mutate({ report_id: r.id, target_type: 'user', target_id: r.target_id, action: 'block' })} /> : null}
                  <GhostButton label={t('dismiss')} height={38} onPress={() => act.mutate({ report_id: r.id, target_type: r.target_type, target_id: r.target_id, action: 'dismiss' })} />
                </View>
              </Card>
            ))
          ) : (
            <Txt size={12.5} dim style={{ paddingHorizontal: 4 }}>
              {t('noReports')}
            </Txt>
          )}
        </>
      )}
    </Screen>
  );
}
