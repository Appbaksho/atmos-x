import { Suspense } from 'react';

import { CompanyPortal } from '@/components/store/company';

/** M1–M18 · Company account: register, overview, buy, emissions, billing, certificates. */
export default function Page() {
  return (
    <Suspense>
      <CompanyPortal />
    </Suspense>
  );
}
