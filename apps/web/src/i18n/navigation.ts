import { createNavigation } from 'next-intl/navigation';

import { routing } from './routing';

/** Locale-aware navigation. Prefer `Link` from here over `next/link` so the locale prefix is kept. */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
