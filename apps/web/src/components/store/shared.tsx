'use client';
/** Pieces the store, partner portal, company portal and admin share: error text, status tags, voucher QR. */
import { useTranslations } from 'next-intl';

import { useQrDataUrl } from '@/components/community/invite-card';
import { B, R, Skeleton, Tag, Txt, View, useCz } from '@/components/cz';
import type { StoreOrder } from '@/lib/data/types';

export const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

/** API error code → message (`store.err.<code with dots as _>`), falling back to a generic line. */
export function useStoreError() {
  const t = useTranslations('store.err');
  return (e: unknown) => {
    const code = ((e as { code?: string })?.code ?? '').replace(/\./g, '_');
    return code && t.has(code) ? t(code) : t('generic');
  };
}

const TONE: Record<string, [string, string]> = {
  issued: [B.lime, B.limeInk],
  processing: [B.yellow, B.limeInk],
  collected: [B.green, B.white],
  expired: [B.red, B.white],
  cancelled: [B.red, B.white],
  unpaid: [B.yellow, B.limeInk],
  awaiting_transfer: [B.yellow, B.limeInk],
  paid: [B.green, B.white],
  failed: [B.red, B.white],
  pending: [B.yellow, B.limeInk],
  approved: [B.green, B.white],
  rejected: [B.red, B.white],
  estimated: [B.yellow, B.limeInk],
  verified: [B.blue, B.white],
  sold: [B.navy2, B.white],
  retired: [B.green, B.white],
};

/** A status chip (`store.status.<status>`). */
export function StatusTag({ status }: { status: string }) {
  const t = useTranslations('store.status');
  const [bg, fg] = TONE[status] ?? [B.navy2, B.white];
  return <Tag label={t.has(status) ? t(status) : status} bg={bg} fg={fg} size="xs" />;
}

/** Voucher code + QR (the QR holds only the code; outlets type it or scan it). */
export function VoucherCard({ order }: { order: StoreOrder }) {
  const t = useTranslations('store.voucher');
  const { c, f } = useCz();
  const v = order.voucher;
  const qr = useQrDataUrl(v?.code ?? null);
  if (!v) return null;
  return (
    <View style={{ alignItems: 'center', gap: 10, padding: 16, borderRadius: R.xl, backgroundColor: c.soft }}>
      <View style={{ width: 200, height: 200, borderRadius: R.md, backgroundColor: B.white, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- data URL QR */}
        {qr ? <img src={qr} alt={t('qrAlt', { code: v.code })} width={190} height={190} /> : <Skeleton w={190} h={190} r={12} />}
      </View>
      <View role="group" label={t('codeA11y', { code: v.code.split('').join(' ') })}>
        <Txt size={24} w={700} style={{ fontFamily: MONO, letterSpacing: 3 }} selectable>
          {v.code}
        </Txt>
      </View>
      <Txt size={12.5} dim center>
        {v.collected_at ? t('collectedOn', { date: f.date(v.collected_at) }) : t('validUntil', { date: f.date(v.expires_at, { day: 'numeric', month: 'short', year: 'numeric' }) })}
      </Txt>
      {!v.collected_at ? (
        <Txt size={12} dim center>
          {t('show')}
        </Txt>
      ) : null}
    </View>
  );
}

/** Product image: the partner's photo, else its emoji on a soft tile. */
export function ProductArt({ photo, emoji, size = 64, label }: { photo: string | null; emoji: string | null; size?: number | string; label: string }) {
  const { c } = useCz();
  return (
    <View role="img" label={label} style={{ width: size, ...(typeof size === 'number' ? { height: size } : { aspectRatio: '4 / 3' }), borderRadius: R.lg, backgroundColor: c.soft, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element -- partner-provided URL
        <img src={photo} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <Txt size={typeof size === 'number' ? Math.round(size * 0.48) : 40}>{emoji || '🎁'}</Txt>
      )}
    </View>
  );
}

/** Open a server PDF in a new tab (cookie auth; same origin). */
export function openPdf(url: string) {
  window.open(url, '_blank', 'noopener');
}
