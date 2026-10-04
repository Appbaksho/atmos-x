import { Placeholder } from '@/components/cz/placeholder';

/** S17 placeholder (V0-1). Owner: V0-6. Replace the body with the ported screen. */
export default async function Page({ params }: PageProps<'/[locale]/app/team/[id]'>) {
  const { id } = await params;
  return <Placeholder id="S17" owner="V0-6" param={id} />;
}
