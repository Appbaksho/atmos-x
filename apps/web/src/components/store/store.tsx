'use client';
/**
 * Store (prompt-v1 §6.9): spend verified points on products partners give through CSR programs,
 * and buy saplings from nearby nurseries in taka. S1 header · S2 partners · S3 product cards ·
 * S4 filters · S5 saplings · S10 My orders · S17 terms. Product detail and redeem live in product.tsx.
 */
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { B, BottomSheet, Card, CzButton, EmptyState, ErrorState, Field, FilterChip, HScroll, I, Icon, Note, R, Screen, ScreenHeader, Seg, SkeletonCard, Stepper, Tag, Tap, Txt, View, href, requireAccount, toast, useCz, useLocation } from '@/components/cz';
import { goToPayment, saplingInvoiceUrl, useMyOrders, useOrderSaplings, useSaplings, useSession, useStorePartners, useStoreProducts } from '@/lib/data/hooks';
import type { SaplingOrderOut, SaplingProduct, StoreFilter, StoreOrder, StorePartner, StoreProduct } from '@/lib/data/types';

import { ProductArt, StatusTag, VoucherCard, openPdf, useStoreError } from './shared';

type Tab = 'points' | 'saplings' | 'orders';
const FILTERS: StoreFilter[] = ['can_afford', 'food', 'home', 'garden', 'vouchers'];
const PAYMENT_TONE: Record<string, 'lime' | 'warn' | 'danger'> = { paid: 'lime', already: 'lime', failed: 'danger', cancelled: 'warn', invalid: 'danger', unknown: 'warn' };

export function StoreScreen() {
  const t = useTranslations('store');
  const params = useSearchParams();
  const initial = params.get('tab');
  const [tab, setTab] = useState<Tab>(initial === 'saplings' || initial === 'orders' ? initial : 'points');
  const payment = params.get('payment');
  return (
    <Screen>
      <ScreenHeader title={t('title')} sub={t('sub')} />
      {payment ? (
        <Note tone={PAYMENT_TONE[payment] ?? 'warn'} icon={payment === 'paid' || payment === 'already' ? I.check : I.info}>
          {t.has(`payment.${payment}`) ? t(`payment.${payment}`) : t('payment.unknown')}
        </Note>
      ) : null}
      <Seg
        value={tab}
        onChange={setTab}
        tone="card"
        label={t('title')}
        options={[
          { label: t('tabPoints'), value: 'points' },
          { label: t('tabSaplings'), value: 'saplings' },
          { label: t('tabOrders'), value: 'orders' },
        ]}
      />
      {tab === 'points' ? <PointsTab /> : tab === 'saplings' ? <SaplingsTab /> : <OrdersTab />}
    </Screen>
  );
}

/* ───────────────────────────── points store ───────────────────────────── */

function PointsTab() {
  const t = useTranslations('store');
  const [filter, setFilter] = useState<StoreFilter | null>(null);
  const q = useStoreProducts(filter);
  const partners = useStorePartners();
  const pilot = q.data?.pilot || partners.data?.some((p) => p.is_pilot);
  return (
    <View style={{ gap: 14 }}>
      <PointsHeader points={q.data?.points} loading={q.isPending} />
      {pilot ? (
        <Note tone="navy" icon={I.info}>
          {t('pilot')}
        </Note>
      ) : null}
      {partners.data?.length ? (
        <View style={{ gap: 8 }}>
          {partners.data.map((p) => (
            <PartnerRow key={p.id} p={p} />
          ))}
        </View>
      ) : null}
      <HScroll label={t('filters')} style={{ gap: 8, paddingBottom: 2 }}>
        <FilterChip label={t('filter.all')} active={filter === null} onPress={() => setFilter(null)} />
        {FILTERS.map((f) => (
          <FilterChip key={f} label={t(`filter.${f}`)} active={filter === f} onPress={() => setFilter(filter === f ? null : f)} />
        ))}
      </HScroll>
      {q.isPending ? (
        <SkeletonCard lines={3} height={200} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data.products.length ? (
        <View style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
          {q.data.products.map((p) => (
            <ProductCard key={p.id} p={p} />
          ))}
        </View>
      ) : (
        <EmptyState icon={I.sparkleOne} title={filter ? t('noneFilter') : t('none')} sub={filter ? undefined : t('noneSub')} />
      )}
      <Terms />
    </View>
  );
}

function PointsHeader({ points, loading }: { points?: { spendable: number; pending: number; next_unlock_at: string | null }; loading: boolean }) {
  const t = useTranslations('store');
  const { c, f } = useCz();
  const session = useSession();
  if (session.isGuest) {
    return (
      <Card tone="navy" gap={10}>
        <Txt size={15} w={600} color={B.white}>
          {t('guestTitle')}
        </Txt>
        <Txt size={12.5} color="rgba(255,255,255,0.8)">
          {t('guestSub')}
        </Txt>
        <CzButton label={t('guestCta')} size="sm" onPress={() => requireAccount(t('feature'))} style={{ alignSelf: 'flex-start' }} />
      </Card>
    );
  }
  if (loading || !points) return <SkeletonCard lines={2} height={110} />;
  return (
    <View role="group" label={t('balanceA11y', { pts: f.num(points.spendable) })} style={{ backgroundColor: B.navy, borderRadius: R.xxl, padding: 18, gap: 8, borderWidth: c.dark ? 1 : 0, borderColor: c.line }}>
      <Txt size={12} color="rgba(255,255,255,0.8)">
        {t('spendable')}
      </Txt>
      <Txt size={36} num color={B.white} style={{ lineHeight: '40px', letterSpacing: -0.6 }}>
        {f.num(points.spendable)}
      </Txt>
      {points.pending > 0 ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon d={I.clock} size={14} sw={2} color={B.orange} />
          <Txt size={12} w={600} color={B.orange} style={{ flex: 1 }}>
            {points.next_unlock_at ? t('pendingUntil', { pts: f.num(points.pending), date: f.date(points.next_unlock_at, { day: 'numeric', month: 'short' }) }) : t('pending', { pts: f.num(points.pending) })}
          </Txt>
        </View>
      ) : (
        <Txt size={12} color="rgba(255,255,255,0.75)">
          {t('howToEarn')}
        </Txt>
      )}
    </View>
  );
}

function PartnerRow({ p }: { p: StorePartner }) {
  const t = useTranslations('store');
  return (
    <Card pad={12} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <ProductArt photo={p.logo_url} emoji={p.logo_emoji ?? '🏪'} size={44} label={p.name} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Txt size={14} w={600} lines={1}>
            {p.name}
          </Txt>
          {p.is_pilot ? <Tag label={t('pilotTag')} size="xs" bg={B.lime} fg={B.limeInk} /> : null}
        </View>
        <Txt size={12} dim lines={2}>
          {p.csr_line || t('csrLine', { name: p.name })}
        </Txt>
      </View>
      <Txt size={11.5} dim>
        {t('productsN', { count: p.products })}
      </Txt>
    </Card>
  );
}

function ProductCard({ p }: { p: StoreProduct }) {
  const t = useTranslations('store');
  const { c, f } = useCz();
  const out = p.stock <= 0;
  return (
    <Tap
      label={t('productA11y', { name: p.name, pts: f.num(p.points_price) })}
      href={href('product', { id: p.id })}
      style={{ backgroundColor: c.card, borderRadius: R.xl, padding: 10, gap: 8, textAlign: 'start', opacity: out ? 0.6 : 1 }}>
      <ProductArt photo={p.photo_url} emoji={p.emoji} size="100%" label={p.name} />
      <Txt size={13.5} w={600} lines={2}>
        {p.name}
      </Txt>
      <Txt size={15} w={700} num color={p.can_afford ? c.leaf : c.ink}>
        {t('pts', { pts: f.num(p.points_price) })}
      </Txt>
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <Tag label={p.fulfilment === 'pickup' ? t('pickup') : t('delivery')} size="xs" />
        <Txt size={11} dim>
          {out ? t('soldOut') : t('left', { n: f.num(p.stock) })}
        </Txt>
      </View>
    </Tap>
  );
}

function Terms() {
  const t = useTranslations('store');
  return (
    <Card tone="soft" gap={6}>
      <Txt size={12} w={600}>
        {t('termsTitle')}
      </Txt>
      <Txt size={12} dim>
        {t('terms')}
      </Txt>
    </Card>
  );
}

/* ───────────────────────────── saplings ───────────────────────────── */

function SaplingsTab() {
  const t = useTranslations('store.saplings');
  const { focus, placeName } = useLocation();
  const q = useSaplings(focus);
  const [buying, setBuying] = useState<SaplingProduct | null>(null);
  return (
    <View style={{ gap: 12 }}>
      <Txt size={13} dim>
        {placeName ? t('near', { place: placeName }) : t('sub')}
      </Txt>
      {q.isPending ? (
        <SkeletonCard lines={3} height={160} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data.products.length ? (
        <>
          {!q.data.payments ? (
            <Note tone="warn" icon={I.info}>
              {t('noPayments')}
            </Note>
          ) : null}
          {q.data.products.map((p) => (
            <SaplingRow key={p.id} p={p} onBuy={() => setBuying(p)} />
          ))}
        </>
      ) : (
        <EmptyState icon={I.tree} title={t('none')} sub={t('noneSub')} action={t('nurseries')} actionHref={href('S12')} />
      )}
      {buying && q.data ? <BuySheet p={buying} vat={q.data.vat_rate} payments={q.data.payments} onClose={() => setBuying(null)} /> : null}
    </View>
  );
}

function SaplingRow({ p, onBuy }: { p: SaplingProduct; onBuy: () => void }) {
  const t = useTranslations('store.saplings');
  const { f } = useCz();
  return (
    <Card pad={12} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <ProductArt photo={p.photo_url} emoji={p.kind === 'kit' ? '🧰' : '🌱'} size={56} label={p.name} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Txt size={14} w={600} lines={1}>
          {p.name}
        </Txt>
        <Txt size={12} dim lines={1}>
          {p.nursery.dist_m != null ? t('fromDist', { name: p.nursery.name, dist: f.dist(p.nursery.dist_m) }) : p.nursery.name}
        </Txt>
        <Txt size={14} w={700} num>
          {f.tk(p.price_bdt)}
        </Txt>
      </View>
      <CzButton label={p.stock > 0 ? t('buy') : t('soldOut')} size="sm" icon="plus" disabled={p.stock <= 0} onPress={onBuy} />
    </Card>
  );
}

function BuySheet({ p, vat, payments, onClose }: { p: SaplingProduct; vat: number; payments: boolean; onClose: () => void }) {
  const t = useTranslations('store.saplings');
  const { f } = useCz();
  const session = useSession();
  const order = useOrderSaplings();
  const errText = useStoreError();
  const [qty, setQty] = useState(1);
  const [address, setAddress] = useState('');
  const max = Math.min(200, p.stock);
  const subtotal = p.price_bdt * qty;
  const vatAmt = Math.round(subtotal * vat * 100) / 100;
  const pay = () => {
    if (session.isGuest) return requireAccount(t('feature'));
    order.mutate(
      { product_id: p.id, qty, delivery_address: address.trim() || null },
      {
        onSuccess: (o: SaplingOrderOut) => {
          if (o.payment_url) goToPayment(o.payment_url);
          else toast(t('started'), { tone: 'success' });
        },
        onError: (e) => toast(errText(e), { tone: 'warn' }),
      },
    );
  };
  return (
    <BottomSheet
      open
      onClose={onClose}
      title={p.name}
      sub={p.nursery.name}
      footer={<CzButton label={t('pay', { total: f.tk(subtotal + vatAmt) })} icon="arrow" busy={order.isPending} disabled={!payments} onPress={pay} />}>
      <View style={{ gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Txt size={13.5} w={600}>
            {t('qty')}
          </Txt>
          <Stepper value={f.loc(qty)} label={t('qty')} onDec={() => setQty(Math.max(1, qty - 1))} onInc={() => setQty(Math.min(max, qty + 1))} decDisabled={qty <= 1} incDisabled={qty >= max} />
        </View>
        <Field label={t('address')} value={address} onChangeText={setAddress} multiline maxLength={500} hint={t('addressHint')} />
        <View style={{ gap: 6 }}>
          <Row k={t('subtotal')} v={f.tk(subtotal)} />
          <Row k={t('vat', { pct: f.pct(vat * 100) })} v={f.tk(vatAmt)} />
          <Row k={t('total')} v={f.tk(subtotal + vatAmt)} bold />
        </View>
        <Txt size={12} dim>
          {payments ? t('gateway') : t('noPayments')}
        </Txt>
      </View>
    </BottomSheet>
  );
}

function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <Txt size={13} dim={!bold} w={bold ? 600 : 400}>
        {k}
      </Txt>
      <Txt size={13} num w={bold ? 700 : 500}>
        {v}
      </Txt>
    </View>
  );
}

/* ───────────────────────────── my orders (S10) ───────────────────────────── */

function OrdersTab() {
  const t = useTranslations('store.orders');
  const session = useSession();
  const q = useMyOrders();
  const [open, setOpen] = useState<StoreOrder | null>(null);
  if (session.isGuest) return <EmptyState icon={I.lock} title={t('guest')} action={t('signUp')} onAction={() => requireAccount(t('feature'))} />;
  if (q.isPending) return <SkeletonCard lines={3} height={180} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const { redemptions, saplings } = q.data;
  if (!redemptions.length && !saplings.length) return <EmptyState icon={I.clock} title={t('none')} sub={t('noneSub')} />;
  return (
    <View style={{ gap: 14 }}>
      {redemptions.length ? (
        <Card pad={0} gap={0} style={{ paddingHorizontal: 14 }}>
          {redemptions.map((r, i) => (
            <RedemptionRow key={r.id} r={r} last={i === redemptions.length - 1} onOpen={() => setOpen(r)} />
          ))}
        </Card>
      ) : null}
      {saplings.length ? (
        <View style={{ gap: 8 }}>
          <Txt size={13} w={600}>
            {t('saplings')}
          </Txt>
          <Card pad={0} gap={0} style={{ paddingHorizontal: 14 }}>
            {saplings.map((o, i) => (
              <SaplingOrderRow key={o.id} o={o} last={i === saplings.length - 1} />
            ))}
          </Card>
        </View>
      ) : null}
      {open ? <OrderSheet r={open} onClose={() => setOpen(null)} /> : null}
    </View>
  );
}

function RedemptionRow({ r, last, onOpen }: { r: StoreOrder; last: boolean; onOpen: () => void }) {
  const t = useTranslations('store.orders');
  const { c, f } = useCz();
  return (
    <Tap label={r.product?.name ?? t('item')} onPress={onOpen} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.line, textAlign: 'start' }}>
      <ProductArt photo={r.product?.photo_url ?? null} emoji={r.product?.emoji ?? null} size={44} label={r.product?.name ?? ''} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Txt size={13.5} w={600} lines={1}>
          {r.product?.name ?? t('item')}
        </Txt>
        <Txt size={11.5} dim lines={1}>
          {`${r.partner?.name ?? ''} · ${f.date(r.created_at)} · ${t('pts', { pts: f.num(r.points) })}`}
        </Txt>
      </View>
      <StatusTag status={r.status} />
    </Tap>
  );
}

function SaplingOrderRow({ o, last }: { o: SaplingOrderOut; last: boolean }) {
  const t = useTranslations('store.orders');
  const { c, f } = useCz();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.line }}>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Txt size={13.5} w={600} lines={1}>
          {`${o.name ?? t('item')} × ${f.loc(o.qty)}`}
        </Txt>
        <Txt size={11.5} dim>
          {`${f.date(o.created_at)} · ${f.tk(o.total_bdt)}`}
        </Txt>
      </View>
      {o.status === 'paid' ? (
        <Tap label={t('invoice')} onPress={() => openPdf(saplingInvoiceUrl(o.id))} style={{ minHeight: 36, justifyContent: 'center', paddingHorizontal: 6 }}>
          <Txt size={12} w={600} color={c.leaf}>
            {t('invoice')}
          </Txt>
        </Tap>
      ) : null}
      <StatusTag status={o.status} />
    </View>
  );
}

function OrderSheet({ r, onClose }: { r: StoreOrder; onClose: () => void }) {
  const t = useTranslations('store.orders');
  const { f } = useCz();
  return (
    <BottomSheet open onClose={onClose} title={r.product?.name ?? t('item')} sub={r.partner?.name ?? undefined}>
      <View style={{ gap: 12 }}>
        {r.voucher ? (
          <VoucherCard order={r} />
        ) : (
          <Note tone={r.status === 'collected' ? 'lime' : 'navy'} icon={r.status === 'collected' ? I.check : I.clock}>
            {r.status === 'collected' ? t('delivered') : t('delivering', { address: r.delivery_address ?? '' })}
          </Note>
        )}
        <Txt size={12.5} dim>
          {t('spent', { pts: f.num(r.points), date: f.date(r.created_at) })}
        </Txt>
      </View>
    </BottomSheet>
  );
}
