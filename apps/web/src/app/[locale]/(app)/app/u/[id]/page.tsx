import { ProfilePage } from '@/components/community/person';

/** C5 · Public profile: name, photo, area, bio, trees, badges, points, teams, follow / block / report. */
export default async function Page({ params }: PageProps<'/[locale]/app/u/[id]'>) {
  const { id } = await params;
  return <ProfilePage id={decodeURIComponent(id)} />;
}
