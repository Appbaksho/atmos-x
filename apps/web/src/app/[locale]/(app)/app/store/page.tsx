import { Suspense } from 'react';

import { StoreScreen } from '@/components/store/store';

/** S1–S5, S10 · Store: points store, buy saplings, my orders. */
export default function Page() {
  return (
    <Suspense>
      <StoreScreen />
    </Suspense>
  );
}
