import { Feasibility } from '@/components/plan/feasibility';

/** S09 · Feasibility of a (local) goal. */
export default async function Page({ params }: PageProps<'/[locale]/app/goal/[id]/feasibility'>) {
  const { id } = await params;
  return <Feasibility id={id} />;
}
