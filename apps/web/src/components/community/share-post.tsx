'use client';
/**
 * C14 / T5 · Share a verified action or a tree as a feed post. The server publishes a moderated,
 * EXIF-free copy of its photo; the place is the public area label, never the exact spot.
 */
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { BottomSheet, CzButton, Field, GhostButton, Txt, View, go, requireAccount, toast } from '@/components/cz';
import { useCreatePost, useSession } from '@/lib/data/hooks';

export function SharePostButton({ actionId, treeId, defaultBody = '', height = 44 }: { actionId?: string | null; treeId?: string | null; defaultBody?: string; height?: number }) {
  const t = useTranslations('community.sharePost');
  const session = useSession();
  const create = useCreatePost();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState(defaultBody);
  const share = () =>
    create.mutate(
      { body: body.trim(), action_id: actionId ?? undefined, tree_id: treeId ?? undefined, share_photo: true },
      {
        onSuccess: (p) => {
          setOpen(false);
          setBody(defaultBody);
          toast(t('done'), { tone: 'success' });
          go('post', { id: p.id });
        },
        onError: (e) => toast(t.has(`err.${(e as { code?: string }).code ?? ''}`) ? t(`err.${(e as { code?: string }).code}`) : t('err.generic'), { tone: 'warn' }),
      },
    );
  return (
    <>
      <GhostButton label={t('cta')} height={height} onPress={() => (session.isGuest ? requireAccount(t('feature')) : setOpen(true))} />
      <BottomSheet open={open} onClose={() => setOpen(false)} title={t('title')} sub={t('sub')} footer={<CzButton label={t('post')} icon="check" busy={create.isPending} onPress={share} />}>
        <View style={{ gap: 10 }}>
          <Field label={t('say')} value={body} onChangeText={setBody} multiline maxLength={2000} />
          <Txt size={12} dim>
            {t('privacy')}
          </Txt>
        </View>
      </BottomSheet>
    </>
  );
}
