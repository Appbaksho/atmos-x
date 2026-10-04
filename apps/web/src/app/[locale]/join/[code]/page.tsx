import { Placeholder } from '@/components/cz/placeholder';

/** Join placeholder (V0-1). Owner: V0-6. Replace the body with the ported screen. */
export default async function Page({ params }: PageProps<'/[locale]/join/[code]'>) {
  const { code } = await params;
  return <Placeholder id="Join" owner="V0-6" param={code} />;
}
