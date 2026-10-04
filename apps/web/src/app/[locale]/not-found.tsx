import { useTranslations } from 'next-intl';

import { NotFoundBody } from '@/components/cz/placeholder';

export default function NotFound() {
  const t = useTranslations('common.notFound');
  return <NotFoundBody title={t('title')} body={t('body')} home={t('home')} />;
}
