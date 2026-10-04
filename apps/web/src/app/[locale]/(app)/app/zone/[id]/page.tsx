import { ZoneScreen } from '@/components/zone/zone-screen';

/** S06 Zone detail. Owner: V0-4. */
export default async function Page({ params }: PageProps<'/[locale]/app/zone/[id]'>) {
  const { id } = await params;
  return <ZoneScreen id={decodeURIComponent(id)} />;
}
