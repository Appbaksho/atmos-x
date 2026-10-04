import { Placeholder } from '@/components/cz/placeholder';

/** S06 placeholder (V0-1). Owner: V0-4. Replace the body with the ported screen. */
export default async function Page({ params }: PageProps<'/[locale]/app/zone/[id]'>) {
  const { id } = await params;
  return <Placeholder id="S06" owner="V0-4" param={id} />;
}
