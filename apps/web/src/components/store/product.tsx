'use client';
/**
 * S6–S9 · Product detail and redeem: details, partner, pickup outlets or delivery area, terms;
 * confirm the points; then a voucher code + QR valid for 14 days, or a delivery order.
 * Spending runs in one database transaction on the server (S14), with monthly limits (S15).
 */
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { B, BottomSheet, Card, CzButton, EmptyState, Field, I, Icon, Note, R, Screen, ScreenHeader, SkeletonCard, Tag, Txt, View, href, requireAccount, toast, useCz } from '@/components/cz';
import { useMyStats, useRedeem, useSession, useStoreProduct } from '@/lib/data/hooks';
import type { StoreOrder, StoreProduct } from '@/lib/data/types';

import { ProductArt, VoucherCard, useStoreError } from './shared';

export function ProductPage({ id }: { id: string }) {
  const t = useTranslations('store');
  const q = useStoreProduct(id);
  if (q.isPending) {
    return (
      <Screen>
        <ScreenHeader title={t('title')} />
        <SkeletonCard lines={4} height={280} />
      </Screen>
    );
  }
  if (q.isError || !q.data) {
    return (
      <Screen>
        <ScreenHeader title={t('title')} />
        <EmptyState icon={I.search} title={t('product.notFound')} action={t('product.back')} actionHref={href('store')} />
      </Screen>
    );
  }
  return <ProductBody p={q.data} />;
}

function ProductBody({ p }: { p: StoreProduct }) {
  const t = useTranslations('store');
  const { c, f } = useCz();
  const session = useSession();
  const stats = useMyStats();
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState<StoreOrder | null>(null);
  const spendable = stats.data?.points.spendable ?? null;
  const short = spendable != null && spendable < p.points_price;
  const out = p.stock <= 0;
  const start = () => (session.isGuest ? requireAccount(t('feature')) : setConfirming(true));
  return (
    <Screen>
      <ScreenHeader title={p.name} sub={p.partner?.name} />
      <ProductArt photo={p.photo_url} emoji={p.emoji} size="100%" label={p.name} />
      <Card gap={10}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <Txt size={24} w={700} num>
            {t('pts', { pts: f.num(p.points_price) })}
          </Txt>
          <Tag label={p.fulfilment === 'pickup' ? t('pickup') : t('delivery')} size="sm" />
        </View>
        <Txt size={12.5} dim>
          {out ? t('soldOut') : t('left', { n: f.num(p.stock) })}
          {' · '}
          {t('product.limit', { n: f.loc(p.monthly_limit) })}
        </Txt>
        {p.description ? <Txt size={14}>{p.description}</Txt> : null}
      </Card>

      {p.partner ? (
        <Card pad={12} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <ProductArt photo={p.partner.logo_url} emoji={p.partner.logo_emoji ?? '🏪'} size={40} label={p.partner.name} />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Txt size={13.5} w={600}>
              {p.partner.name}
            </Txt>
            <Txt size={12} dim>
              {p.partner.csr_line || t('csrLine', { name: p.partner.name })}
            </Txt>
          </View>
        </Card>
      ) : null}

      <Card gap={8}>
        <Txt size={13} w={600}>
          {p.fulfilment === 'pickup' ? t('product.outlets') : t('product.deliveryArea')}
        </Txt>
        {p.fulfilment === 'pickup' ? (
          p.outlets.length ? (
            p.outlets.map((o) => (
              <View key={o.id} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                <Icon d={I.pin} size={15} sw={2} color={c.leaf} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt size={13}>{o.name}</Txt>
                  {o.address ? (
                    <Txt size={12} dim>
                      {o.address}
                    </Txt>
                  ) : null}
                </View>
              </View>
            ))
          ) : (
            <Txt size={12.5} dim>
              {t('product.noOutlets')}
            </Txt>
          )
        ) : (
          <Txt size={13}>{p.delivery_area || t('product.anyArea')}</Txt>
        )}
        {p.terms ? (
          <>
            <Txt size={13} w={600} style={{ paddingTop: 6 }}>
              {t('product.terms')}
            </Txt>
            <Txt size={12.5} dim>
              {p.terms}
            </Txt>
          </>
        ) : null}
      </Card>

      {p.is_demo ? (
        <Note tone="navy" icon={I.info}>
          {t('product.demo')}
        </Note>
      ) : null}
      {short && !out ? (
        <Note tone="warn" icon={I.info}>
          {t('product.short', { pts: f.num(p.points_price - (spendable ?? 0)) })}
        </Note>
      ) : null}
      <CzButton label={out ? t('soldOut') : t('product.redeem')} icon="check" disabled={out || short} onPress={start} />
      <Txt size={11.5} dim center>
        {t('terms')}
      </Txt>

      {confirming ? (
        <ConfirmSheet
          p={p}
          spendable={spendable}
          onClose={() => setConfirming(false)}
          onDone={(o) => {
            setConfirming(false);
            setDone(o);
          }}
        />
      ) : null}
      {done ? (
        <BottomSheet open onClose={() => setDone(null)} title={t('done.title')} sub={p.name} footer={<CzButton label={t('done.orders')} href={href('store', undefined, { tab: 'orders' })} />}>
          <View style={{ gap: 12 }}>
            {done.voucher ? (
              <VoucherCard order={done} />
            ) : (
              <Note tone="lime" icon={I.check}>
                {t('done.delivery')}
              </Note>
            )}
          </View>
        </BottomSheet>
      ) : null}
    </Screen>
  );
}

function ConfirmSheet({ p, spendable, onClose, onDone }: { p: StoreProduct; spendable: number | null; onClose: () => void; onDone: (o: StoreOrder) => void }) {
  const t = useTranslations('store');
  const { c, f } = useCz();
  const redeem = useRedeem();
  const errText = useStoreError();
  const [address, setAddress] = useState('');
  const delivery = p.fulfilment === 'delivery';
  const go = () => {
    if (delivery && address.trim().length < 6) return toast(t('confirm.addressNeeded'), { tone: 'warn' });
    redeem.mutate({ id: p.id, delivery_address: delivery ? address.trim() : null }, { onSuccess: onDone, onError: (e) => toast(errText(e), { tone: 'warn' }) });
  };
  return (
    <BottomSheet open onClose={onClose} title={t('confirm.title')} sub={p.name} footer={<CzButton label={t('confirm.cta', { pts: f.num(p.points_price) })} icon="check" busy={redeem.isPending} onPress={go} />}>
      <View style={{ gap: 14 }}>
        <View style={{ backgroundColor: c.soft, borderRadius: R.lg, padding: 14, gap: 6 }}>
          <Line k={t('confirm.spend')} v={t('pts', { pts: f.num(p.points_price) })} />
          {spendable != null ? <Line k={t('confirm.after')} v={t('pts', { pts: f.num(Math.max(0, spendable - p.points_price)) })} /> : null}
        </View>
        {delivery ? <Field label={t('confirm.address')} value={address} onChangeText={setAddress} multiline maxLength={500} hint={p.delivery_area ? t('confirm.area', { area: p.delivery_area }) : undefined} /> : null}
        <Txt size={12} dim>
          {delivery ? t('confirm.deliveryNote') : t('confirm.pickupNote')}
        </Txt>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
          <Icon d={I.info} size={14} sw={2} color={B.orangeInk} />
          <Txt size={11.5} dim style={{ flex: 1 }}>
            {t('confirm.final')}
          </Txt>
        </View>
      </View>
    </BottomSheet>
  );
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <Txt size={13} dim>
        {k}
      </Txt>
      <Txt size={13} w={600} num>
        {v}
      </Txt>
    </View>
  );
}
