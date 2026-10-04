import { TeamScreen } from '@/components/community/team';

/** S17 · Team dashboard. */
export default async function Page({ params }: PageProps<'/[locale]/app/team/[id]'>) {
  const { id } = await params;
  return <TeamScreen id={decodeURIComponent(id)} />;
}
