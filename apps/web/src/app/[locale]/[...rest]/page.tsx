import { notFound } from 'next/navigation';

/** Unknown paths under a locale render [locale]/not-found.tsx inside the root layout. */
export default function CatchAll() {
  notFound();
}
