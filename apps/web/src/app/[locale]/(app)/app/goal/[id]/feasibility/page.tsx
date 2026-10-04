import { Placeholder } from '@/components/cz/placeholder';

/** S09 placeholder (V0-1). Owner: V0-5. Replace the body with the ported screen. */
export default async function Page({ params }: PageProps<'/[locale]/app/goal/[id]/feasibility'>) {
  const { id } = await params;
  return <Placeholder id="S09" owner="V0-5" param={id} />;
}
