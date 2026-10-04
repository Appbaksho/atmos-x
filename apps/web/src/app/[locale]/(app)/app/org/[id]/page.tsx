import { Placeholder } from '@/components/cz/placeholder';

/** S18 placeholder (V0-1). Owner: V0-6. Replace the body with the ported screen. */
export default async function Page({ params }: PageProps<'/[locale]/app/org/[id]'>) {
  const { id } = await params;
  return <Placeholder id="S18" owner="V0-6" param={id} />;
}
