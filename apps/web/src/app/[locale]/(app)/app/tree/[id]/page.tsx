import { TreeScreen } from '@/components/profile/tree';

/** Tree detail: 15-day photo checks with the AI health verdict. `?check=1` opens the camera. */
export default async function Page({ params, searchParams }: PageProps<'/[locale]/app/tree/[id]'>) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  return <TreeScreen id={decodeURIComponent(id)} openCheck={sp.check === '1'} />;
}
