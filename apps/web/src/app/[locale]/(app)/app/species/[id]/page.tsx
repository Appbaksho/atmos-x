import { Placeholder } from '@/components/cz/placeholder';

/** S11 placeholder (V0-1). Owner: V0-5. Replace the body with the ported screen. */
export default async function Page({ params }: PageProps<'/[locale]/app/species/[id]'>) {
  const { id } = await params;
  return <Placeholder id="S11" owner="V0-5" param={id} />;
}
