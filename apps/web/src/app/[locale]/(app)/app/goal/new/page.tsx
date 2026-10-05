import { GoalWizard, type GoalFocus } from '@/components/plan/goal-wizard';

const FOCUS = new Set(['sealed', 'green', 'roofs', 'density']);

/**
 * S08 · Cooling goal wizard. `?zone=<zone id>` preselects the zone (from S06 / S04);
 * `&focus=sealed|green|roofs|density` (S06 drivers card "Add to goal") shows that driver first.
 */
export default async function Page({ searchParams }: PageProps<'/[locale]/app/goal/new'>) {
  const { zone, focus } = await searchParams;
  return (
    <GoalWizard
      zoneId={typeof zone === 'string' && zone ? zone : null}
      focus={typeof focus === 'string' && FOCUS.has(focus) ? (focus as GoalFocus) : null}
    />
  );
}
