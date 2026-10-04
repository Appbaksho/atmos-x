import type React from 'react';

import { AppShell } from '@/components/cz/shell/app-shell';

/** /app/**: tab bar / sidebar, Ask Atmos slot, offline + install UI, onboarding redirect. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
