import { JoinTreeScreen } from '@/components/profile/join-tree';

/** Accept an invite to help water a friend's tree (T5). `?t=<signed token>`. */
export default async function Page({ searchParams }: PageProps<'/[locale]/app/tree/join'>) {
  const sp = await searchParams;
  return <JoinTreeScreen token={typeof sp.t === 'string' ? sp.t : null} />;
}
