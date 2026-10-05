import { JoinScreen } from '@/components/community/join';

/** /join/[code] · invite landing (outside the app shell: no tab bar). */
export default async function Page({ params, searchParams }: PageProps<'/[locale]/join/[code]'>) {
  const [{ code }, sp] = await Promise.all([params, searchParams]);
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
  return <JoinScreen code={code} payload={one(sp.t)} autoJoin={one(sp.join) === '1'} />;
}
