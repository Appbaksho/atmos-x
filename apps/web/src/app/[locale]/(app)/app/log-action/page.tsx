import { LogActionScreen } from '@/components/act/log-action';

/** S14 · Log an action. `?type=<action type>&species=<id>&goal=<goal id>` preselect the form. */
export default async function Page({ searchParams }: PageProps<'/[locale]/app/log-action'>) {
  const q = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === 'string' && v ? v : null);
  return <LogActionScreen initialType={one(q.type)} initialSpecies={one(q.species)} goalId={one(q.goal)} />;
}
