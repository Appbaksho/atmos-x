import type { Metadata } from 'next';

import { KitGallery } from '@/components/cz/kit-gallery';

export const metadata: Metadata = { title: 'Kit', robots: { index: false } };

/** /dev/kit (and /bn/dev/kit, /ur/dev/kit …): the UI kit gallery. */
export default function KitPage() {
  return <KitGallery />;
}
