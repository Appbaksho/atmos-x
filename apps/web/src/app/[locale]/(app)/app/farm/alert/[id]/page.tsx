import { Placeholder } from '@/components/cz/placeholder';

/** F02 placeholder (V0-1). Owner: V0-7. Replace the body with the ported screen. */
export default async function Page({ params }: PageProps<'/[locale]/app/farm/alert/[id]'>) {
  const { id } = await params;
  return <Placeholder id="F02" owner="V0-7" param={id} />;
}
