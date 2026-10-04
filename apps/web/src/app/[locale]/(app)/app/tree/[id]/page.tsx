import { Placeholder } from '@/components/cz/placeholder';

/** Tree placeholder (V0-1). Owner: V0-6. Replace the body with the ported screen. */
export default async function Page({ params }: PageProps<'/[locale]/app/tree/[id]'>) {
  const { id } = await params;
  return <Placeholder id="Tree" owner="V0-6" param={id} />;
}
