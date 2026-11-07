import { redirect } from '@/i18n/navigation';

/** P7 · /app/zone without an id opens the map. */
export default async function Page({ params }: PageProps<'/[locale]/app/zone'>) {
  const { locale } = await params;
  redirect({ href: '/app/map', locale });
}
