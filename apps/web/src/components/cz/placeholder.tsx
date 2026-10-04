'use client';
/** Placeholder screens created by V0-1 so every §4.3 route resolves. Porters replace the page body. */
import { useTranslations } from 'next-intl';

import { href } from '@/lib/routes';

import { I } from './icons';
import { Card, CzButton, Icon, Screen, ScreenHeader, Tag, Txt, View } from './ui';
import { useCz } from '@/lib/prefs';

export function Placeholder({ id, owner, tab, param, back = !tab }: { id: string; owner: string; tab?: boolean; param?: string; back?: boolean }) {
  const t = useTranslations('common.placeholder');
  const { c } = useCz();
  return (
    <Screen tab={tab}>
      <ScreenHeader title={t('title', { id })} back={back} big={tab} />
      <Card gap={10}>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Tag label={id} bg={c.limeSoft} />
          <Tag label={owner} />
          {param ? <Tag label={param} /> : null}
        </View>
        <Txt size={13} dim>
          {t('body', { owner })}
        </Txt>
      </Card>
    </Screen>
  );
}

export function NotFoundBody({ title, body, home }: { title: string; body: string; home: string }) {
  const { c } = useCz();
  return (
    <Screen>
      <View style={{ alignItems: 'center', gap: 12, paddingTop: 80 }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: c.limeSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon d={I.search} size={28} color={c.leaf} sw={2} />
        </View>
        <Txt display size={21} center as="h1">
          {title}
        </Txt>
        <Txt size={14} dim center>
          {body}
        </Txt>
        <CzButton label={home} href={href('S04')} icon="arrow" style={{ marginTop: 8 }} />
      </View>
    </Screen>
  );
}
