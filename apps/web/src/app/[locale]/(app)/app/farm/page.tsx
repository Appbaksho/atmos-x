import { redirect } from '@/i18n/navigation';

/** P6 · /app/farm opens the fields list. */
export default async function Page({ params }: PageProps<'/[locale]/app/farm'>) {
  const { locale } = await params;
  redirect({ href: '/app/farm/fields', locale });
}
