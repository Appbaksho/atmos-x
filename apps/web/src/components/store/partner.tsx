'use client';
/**
 * Partner portal (prompt-v1 §6.9 S11–S13, §6.10 M10–M11): add products with a points price inside
 * the M22 band, see redemptions, collect vouchers by code or by scanning the QR, mark deliveries,
 * and download the CSR impact report.
 */
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { B, BottomSheet, Card, CzButton, EmptyState, ErrorState, Field, GhostButton, I, Note, Screen, ScreenHeader, Seg, SkeletonCard, Stepper, Tap, Txt, View, href, toast, useCz, useMounted } from '@/components/cz';
import { normalizeVoucher, partnerReportUrl, useCollectVoucher, useMarkDelivered, usePartnerMe, usePartnerPortal, usePartnerRedemptions, useSavePartnerProduct, useSession } from '@/lib/data/hooks';
import type { PartnerPortal as Portal, PartnerProduct, StoreCategory, StoreOrder } from '@/lib/data/types';

import { MONO, ProductArt, StatusTag, openPdf, useStoreError } from './shared';

type Tab = 'products' | 'redemptions' | 'report';
const CATS: StoreCategory[] = ['food', 'home', 'garden', 'vouchers'];

/** M22 on the client, for the hint only (the server enforces it). */
export function priceBand(value: number, rule: Portal['price_rule']): [number, number] {
  const mid = value * rule.points_per_bdt;
  return [Math.max(1, Math.floor(mid * (1 - rule.tolerance))), Math.max(1, Math.round(mid * (1 + rule.tolerance)))];
}

export function PartnerPortal() {
  const t = useTranslations('store.partner');
  const session = useSession();
  const me = usePartnerMe();
  const [tab, setTab] = useState<Tab>('products');
  if (me.isPending) {
    return (
      <Screen>
        <ScreenHeader title={t('title')} />
        <SkeletonCard lines={3} height={200} />
      </Screen>
    );
  }
  if (me.isError) {
    return (
      <Screen>
        <ScreenHeader title={t('title')} />
        <ErrorState error={me.error} onRetry={() => void me.refetch()} />
      </Screen>
    );
  }
  if (!me.data) {
    return (
      <Screen>
        <ScreenHeader title={t('title')} />
        <EmptyState icon={I.lock} title={t('notPartner')} sub={session.isGuest ? t('notPartnerGuest') : t('notPartnerSub')} action={t('toCompany')} actionHref={href('company')} />
      </Screen>
    );
  }
  return (
    <Screen>
      <ScreenHeader title={me.data.name} sub={t('title')} />
      <Seg
        value={tab}
        onChange={setTab}
        tone="card"
        label={t('title')}
        options={[
          { label: t('tabProducts'), value: 'products' },
          { label: t('tabRedemptions'), value: 'redemptions' },
          { label: t('tabReport'), value: 'report' },
        ]}
      />
      {tab === 'products' ? <Products /> : tab === 'redemptions' ? <Redemptions /> : <Report />}
    </Screen>
  );
}

/* ───────────────────────────── products (S11) ───────────────────────────── */

function Products() {
  const t = useTranslations('store.partner');
  const { f } = useCz();
  const q = usePartnerPortal();
  const [editing, setEditing] = useState<PartnerProduct | 'new' | null>(null);
  if (q.isPending) return <SkeletonCard lines={3} height={200} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const rule = q.data.price_rule;
  return (
    <View style={{ gap: 12 }}>
      <Note tone="navy" icon={I.info}>
        {t('rule', { rate: f.loc(rule.points_per_bdt), pct: f.pct(rule.tolerance * 100) })}
      </Note>
      <CzButton label={t('add')} icon="plus" size="md" onPress={() => setEditing('new')} />
      {q.data.products.length ? (
        q.data.products.map((p) => (
          <Card key={p.id} pad={12} onPress={() => setEditing(p)} label={t('editA11y', { name: p.name })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, opacity: p.active ? 1 : 0.6 }}>
            <ProductArt photo={p.photo_url} emoji={p.emoji} size={48} label={p.name} />
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Txt size={13.5} w={600} lines={1}>
                {p.name}
              </Txt>
              <Txt size={12} dim>
                {t('row', { pts: f.num(p.points_price), stock: f.num(p.stock), value: f.tk(p.declared_value_bdt) })}
              </Txt>
            </View>
            {!p.active ? <StatusTag status="paused" /> : null}
          </Card>
        ))
      ) : (
        <EmptyState icon={I.plus} title={t('noProducts')} sub={t('noProductsSub')} />
      )}
      {editing ? <ProductSheet key={editing === 'new' ? 'new' : editing.id} product={editing === 'new' ? null : editing} rule={rule} onClose={() => setEditing(null)} /> : null}
    </View>
  );
}

function ProductSheet({ product, rule, onClose }: { product: PartnerProduct | null; rule: Portal['price_rule']; onClose: () => void }) {
  const t = useTranslations('store.partner');
  const tc = useTranslations('store.filter');
  const { f } = useCz();
  const save = useSavePartnerProduct();
  const errText = useStoreError();
  const [name, setName] = useState(product?.name ?? '');
  const [desc, setDesc] = useState(product?.description ?? '');
  const [cat, setCat] = useState<StoreCategory>(product?.category ?? 'food');
  const [emoji, setEmoji] = useState(product?.emoji ?? '');
  const [value, setValue] = useState(product ? String(product.declared_value_bdt) : '');
  const [price, setPrice] = useState(product ? String(product.points_price) : '');
  const [stock, setStock] = useState(product?.stock ?? 10);
  const [fulfilment, setFulfilment] = useState<'pickup' | 'delivery'>(product?.fulfilment ?? 'pickup');
  const [area, setArea] = useState(product?.delivery_area ?? '');
  const [terms, setTerms] = useState(product?.terms ?? '');
  const [limit, setLimit] = useState(product?.monthly_limit ?? 2);
  const [active, setActive] = useState(product?.active ?? true);
  const v = Number(value);
  const band = v > 0 ? priceBand(v, rule) : null;
  const p = Number(price);
  const inBand = band ? p >= band[0] && p <= band[1] : false;
  const submit = () => {
    if (name.trim().length < 2 || !(v > 0) || !(p > 0)) return toast(t('fillIn'), { tone: 'warn' });
    if (!inBand && band) return toast(t('outOfBand', { lo: f.num(band[0]), hi: f.num(band[1]) }), { tone: 'warn' });
    const done = {
      onSuccess: () => {
        toast(t('saved'), { tone: 'success' });
        onClose();
      },
      onError: (e: Error) => toast(errText(e), { tone: 'warn' }),
    };
    if (product) save.mutate({ id: product.id, patch: { name: name.trim(), description: desc.trim() || null, points_price: p, declared_value_bdt: v, stock, terms: terms.trim() || null, active } }, done);
    else
      save.mutate(
        {
          add: {
            name: name.trim(),
            description: desc.trim() || null,
            category: cat,
            emoji: emoji.trim() || null,
            points_price: p,
            declared_value_bdt: v,
            stock,
            fulfilment,
            delivery_area: fulfilment === 'delivery' ? area.trim() || null : null,
            terms: terms.trim() || null,
            monthly_limit: limit,
          },
        },
        done,
      );
  };
  return (
    <BottomSheet open onClose={onClose} title={product ? t('edit') : t('add')} footer={<CzButton label={t('save')} icon="check" busy={save.isPending} onPress={submit} />}>
      <View style={{ gap: 12 }}>
        <Field label={t('name')} value={name} onChangeText={setName} maxLength={120} />
        {!product ? (
          <>
            <Seg value={cat} onChange={setCat} label={t('category')} options={CATS.map((c) => ({ label: tc(c), value: c }))} />
            <Field label={t('emoji')} value={emoji} onChangeText={setEmoji} maxLength={8} hint={t('emojiHint')} />
          </>
        ) : null}
        <Field label={t('desc')} value={desc} onChangeText={setDesc} multiline maxLength={1000} />
        <Field label={t('value')} value={value} onChangeText={setValue} keyboardType="decimal-pad" maxLength={9} hint={t('valueHint')} />
        <Field
          label={t('price')}
          value={price}
          onChangeText={setPrice}
          keyboardType="number-pad"
          maxLength={7}
          hint={band ? t('band', { lo: f.num(band[0]), hi: f.num(band[1]) }) : t('bandNeedsValue')}
          error={price && band && !inBand ? t('outOfBand', { lo: f.num(band[0]), hi: f.num(band[1]) }) : undefined}
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Txt size={13.5} w={600}>
            {t('stock')}
          </Txt>
          <Stepper value={f.num(stock)} label={t('stock')} onDec={() => setStock(Math.max(0, stock - (stock > 20 ? 10 : 1)))} onInc={() => setStock(stock + (stock >= 20 ? 10 : 1))} decDisabled={stock <= 0} />
        </View>
        {!product ? (
          <>
            <Seg
              value={fulfilment}
              onChange={setFulfilment}
              label={t('fulfilment')}
              options={[
                { label: t('pickup'), value: 'pickup' },
                { label: t('delivery'), value: 'delivery' },
              ]}
            />
            {fulfilment === 'delivery' ? <Field label={t('area')} value={area} onChangeText={setArea} maxLength={200} /> : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Txt size={13.5} w={600}>
                {t('limit')}
              </Txt>
              <Stepper value={f.loc(limit)} label={t('limit')} onDec={() => setLimit(Math.max(1, limit - 1))} onInc={() => setLimit(Math.min(20, limit + 1))} decDisabled={limit <= 1} incDisabled={limit >= 20} />
            </View>
          </>
        ) : (
          <Seg
            value={active ? 'on' : 'off'}
            onChange={(x) => setActive(x === 'on')}
            label={t('listed')}
            options={[
              { label: t('listedOn'), value: 'on' },
              { label: t('listedOff'), value: 'off' },
            ]}
          />
        )}
        <Field label={t('terms')} value={terms} onChangeText={setTerms} multiline maxLength={1000} />
      </View>
    </BottomSheet>
  );
}

/* ───────────────────────────── redemptions (S12) ───────────────────────────── */

function Redemptions() {
  const t = useTranslations('store.partner');
  const q = usePartnerRedemptions();
  return (
    <View style={{ gap: 12 }}>
      <CollectCard />
      {q.isPending ? (
        <SkeletonCard lines={3} height={180} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data.length ? (
        <Card pad={0} gap={0} style={{ paddingHorizontal: 14 }}>
          {q.data.map((r, i) => (
            <RedemptionRow key={r.id} r={r} last={i === q.data.length - 1} />
          ))}
        </Card>
      ) : (
        <EmptyState icon={I.clock} title={t('noRedemptions')} />
      )}
    </View>
  );
}

function RedemptionRow({ r, last }: { r: StoreOrder; last: boolean }) {
  const t = useTranslations('store.partner');
  const { c, f } = useCz();
  const delivered = useMarkDelivered();
  const errText = useStoreError();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.line }}>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Txt size={13.5} w={600} lines={1}>
          {r.product?.name ?? ''}
        </Txt>
        <Txt size={11.5} dim lines={2}>
          {[f.date(r.created_at), r.voucher ? r.voucher.code : null, r.delivery_address].filter(Boolean).join(' · ')}
        </Txt>
      </View>
      {r.status === 'processing' ? (
        <GhostButton label={t('markDelivered')} height={36} onPress={() => delivered.mutate(r.id, { onSuccess: () => toast(t('deliveredOk'), { tone: 'success' }), onError: (e) => toast(errText(e), { tone: 'warn' }) })} style={{ paddingHorizontal: 10 }} />
      ) : (
        <StatusTag status={r.status} />
      )}
    </View>
  );
}

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };
type DetectorCtor = new (opts: { formats: string[] }) => Detector;

function CollectCard() {
  const t = useTranslations('store.partner');
  const collect = useCollectVoucher();
  const errText = useStoreError();
  const [code, setCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const mounted = useMounted();
  const canScan = mounted && 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia;
  const submit = (raw = code) => {
    const c = normalizeVoucher(raw);
    if (c.length < 6) return toast(t('codeShort'), { tone: 'warn' });
    collect.mutate(
      { code: c },
      {
        onSuccess: (o) => {
          setCode('');
          toast(t('collectedOk', { name: o.product?.name ?? '' }), { tone: 'success' });
        },
        onError: (e) => toast(errText(e), { tone: 'warn' }),
      },
    );
  };
  return (
    <Card gap={10}>
      <Txt size={14} w={600}>
        {t('collectTitle')}
      </Txt>
      <Field label={t('code')} value={code} onChangeText={setCode} maxLength={14} autoCapitalize="characters" style={{ fontFamily: MONO, letterSpacing: 2 }} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <CzButton label={t('collect')} size="md" icon="check" busy={collect.isPending} onPress={() => submit()} style={{ flex: 1 }} />
        {canScan ? <GhostButton label={t('scan')} height={46} onPress={() => setScanning(true)} style={{ paddingHorizontal: 14 }} /> : null}
      </View>
      {scanning ? (
        <Scanner
          onClose={() => setScanning(false)}
          onCode={(c) => {
            setScanning(false);
            setCode(c);
            submit(c);
          }}
        />
      ) : null}
    </Card>
  );
}

/** Camera + BarcodeDetector (Chromium). Browsers without it type the code instead. */
function Scanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const t = useTranslations('store.partner');
  const video = useRef<HTMLVideoElement>(null);
  const found = useRef(onCode);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    found.current = onCode;
  }, [onCode]);
  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer = 0;
    let alive = true;
    const Ctor = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
    if (!Ctor) return;
    const detector = new Ctor({ formats: ['qr_code'] });
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then(async (s) => {
        if (!alive) return s.getTracks().forEach((x) => x.stop());
        stream = s;
        if (!video.current) return;
        video.current.srcObject = s;
        await video.current.play().catch(() => undefined);
        const tick = async () => {
          if (!alive || !video.current) return;
          try {
            const hits = await detector.detect(video.current);
            if (hits[0]?.rawValue) return found.current(hits[0].rawValue);
          } catch {
            /* frame not ready */
          }
          timer = window.setTimeout(tick, 250);
        };
        void tick();
      })
      .catch(() => setFailed(true));
    return () => {
      alive = false;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((x) => x.stop());
    };
  }, []);
  return (
    <BottomSheet open onClose={onClose} title={t('scan')} sub={t('scanSub')}>
      {failed ? (
        <Note tone="warn" icon={I.camera}>
          {t('noCamera')}
        </Note>
      ) : (
        <video ref={video} muted playsInline aria-label={t('scan')} style={{ width: '100%', borderRadius: 16, backgroundColor: B.navy }} />
      )}
    </BottomSheet>
  );
}

/* ───────────────────────────── report (S13) ───────────────────────────── */

function Report() {
  const t = useTranslations('store.partner');
  return (
    <Card gap={10}>
      <Txt size={15} w={600}>
        {t('reportTitle')}
      </Txt>
      <Txt size={13} dim>
        {t('reportSub')}
      </Txt>
      <CzButton label={t('download')} icon="arrow" size="md" onPress={() => openPdf(partnerReportUrl())} />
      <Tap label={t('toCompany')} href={href('company')} style={{ minHeight: 40, justifyContent: 'center' }}>
        <Txt size={12.5} w={600}>
          {t('toCompany')}
        </Txt>
      </Tap>
    </Card>
  );
}
