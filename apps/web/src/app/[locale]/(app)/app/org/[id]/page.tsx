import { OrgScreen } from '@/components/community/org';

/** S18 · Organization. */
export default async function Page({ params }: PageProps<'/[locale]/app/org/[id]'>) {
  const { id } = await params;
  return <OrgScreen id={decodeURIComponent(id)} />;
}
