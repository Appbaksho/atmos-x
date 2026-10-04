import { GoalWizard } from '@/components/plan/goal-wizard';

/** S08 · Cooling goal wizard. `?zone=<zone id>` preselects the zone (from S06 / S04). */
export default async function Page({ searchParams }: PageProps<'/[locale]/app/goal/new'>) {
  const { zone } = await searchParams;
  return <GoalWizard zoneId={typeof zone === 'string' && zone ? zone : null} />;
}
