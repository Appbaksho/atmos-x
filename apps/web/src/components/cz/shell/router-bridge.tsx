'use client';
/** Binds next-intl's router to the imperative go()/goPath()/goBack() helpers in src/lib/routes.ts. */
import { useEffect, useRef } from 'react';

import { usePathname, useRouter } from '@/i18n/navigation';
import { bindRouter, markNavigated } from '@/lib/routes';

export function RouterBridge() {
  const router = useRouter();
  const pathname = usePathname();
  const first = useRef<string | null>(null);

  useEffect(() => {
    bindRouter({
      push: (p) => router.push(p),
      replace: (p) => router.replace(p),
      back: () => router.back(),
      prefetch: (p) => router.prefetch(p),
    });
    return () => bindRouter(null);
  }, [router]);

  useEffect(() => {
    if (first.current === null) first.current = pathname;
    else if (first.current !== pathname) markNavigated();
  }, [pathname]);

  return null;
}
