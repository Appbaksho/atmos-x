import { ProjectionScreen } from '@/components/zone/projection-screen';

/** S07 Projection. Owner: V0-4. */
export default async function Page({ params }: PageProps<'/[locale]/app/zone/[id]/projection'>) {
  const { id } = await params;
  return <ProjectionScreen id={decodeURIComponent(id)} />;
}
