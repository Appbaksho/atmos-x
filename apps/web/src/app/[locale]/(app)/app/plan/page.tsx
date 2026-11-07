import { Suspense } from 'react';

import { PlanScreen } from '@/components/plan/plan-screen';

/** S10 · Your plan (tab root). Suspense: the screen reads `?goal=` with useSearchParams. */
export default function Page() {
  return (
    <Suspense>
      <PlanScreen />
    </Suspense>
  );
}
