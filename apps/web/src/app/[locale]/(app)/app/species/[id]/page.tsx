import { SpeciesDetail } from '@/components/plan/species-detail';

/** S11 · Species detail. */
export default async function Page({ params }: PageProps<'/[locale]/app/species/[id]'>) {
  const { id } = await params;
  return <SpeciesDetail id={decodeURIComponent(id)} />;
}
