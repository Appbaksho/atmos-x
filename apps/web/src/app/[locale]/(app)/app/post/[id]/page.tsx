import { PostPage } from '@/components/community/feed';

/** One post with its comments (C6). */
export default async function Page({ params }: PageProps<'/[locale]/app/post/[id]'>) {
  const { id } = await params;
  return <PostPage id={decodeURIComponent(id)} />;
}
