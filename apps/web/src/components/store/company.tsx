'use client';
/**
 * Company account (prompt-v1 §6.10): register with private documents (M1), wait for review (M2),
 * then overview (M8), buy packages (M9, M14), emissions profile (M3), billing (M13) and
 * certificates and reports (M12). Tree CO₂ is always "an estimate, not an offset" (M18); carbon
 * credits stay disabled until a certified lot exists (M6, M16).
 */
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { BottomSheet, Card, CzButton, EmptyState, ErrorState, Field, GhostButton, I, Note, Screen, ScreenHeader, Seg, SkeletonCard, StatTile, Tap, Txt, View, href, requireAccount, toast, useCz } from '@/components/cz';
import {
  companyCertificateUrl,
  companyInvoiceUrl,
  companyReportUrl,
  goToPayment,
  useCompany,
  useCompanyCertificates,
  useCompanyInvoices,
  useCompanyOrder,
  useCompanyOverview,
  useCompanyPackages,
  useEmissions,
  useRegisterCompany,
  useSession,
  useSetEmissions,
} from '@/lib/data/hooks';
import type { CompanyInfo, CompanyPackage } from '@/lib/data/types';

import { StatusTag, openPdf, useStoreError } from './shared';

type Tab = 'overview' | 'buy' | 'emissions' | 'billing';
const PAYMENT_TONE: Record<string, 'lime' | 'warn' | 'danger'> = { paid: 'lime', already: 'lime', failed: 'danger', cancelled: 'warn', invalid: 'danger', unknown: 'warn' };

export function CompanyPortal() {
  const t = useTranslations('store.company');
  const session = useSession();
  const q = useCompany();
  const payment = useSearchParams().get('payment');
  let body: React.ReactNode;
  if (session.isGuest) body = <EmptyState icon={I.lock} title={t('guest')} sub={t('guestSub')} action={t('signUp')} onAction={() => requireAccount(t('feature'))} />;
  else if (q.isPending) body = <SkeletonCard lines={4} height={240} />;
  else if (q.isError) body = <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  else if (!q.data) body = <Register />;
  else if (q.data.status !== 'approved') body = <Waiting c={q.data} />;
  else body = <Dashboard c={q.data} />;
  return (
    <Screen>
      <ScreenHeader title={q.data?.name ?? t('title')} sub={q.data ? t('title') : t('sub')} />
      {payment ? (
        <Note tone={PAYMENT_TONE[payment] ?? 'warn'} icon={payment === 'paid' || payment === 'already' ? I.check : I.info}>
          {t.has(`payment.${payment}`) ? t(`payment.${payment}`) : t('payment.unknown')}
        </Note>
      ) : null}
      {body}
    </Screen>
  );
}

/* ───────────────────────────── M1 register ───────────────────────────── */

function FileField({ label, hint, file, onFile }: { label: string; hint: string; file: File | null; onFile: (f: File | null) => void }) {
  const { c } = useCz();
  return (
    <View style={{ gap: 6 }}>
      <Txt size={13} w={600} as="label">
        {label}
        <input type="file" accept="application/pdf,image/jpeg,image/png" onChange={(e) => onFile(e.target.files?.[0] ?? null)} style={{ display: 'block', marginTop: 6, fontSize: 13, color: c.ink, maxWidth: '100%' }} />
      </Txt>
      <Txt size={11.5} dim>
        {file ? `${file.name} · ${Math.ceil(file.size / 1024)} KB` : hint}
      </Txt>
    </View>
  );
}

function Register() {
  const t = useTranslations('store.company');
  const reg = useRegisterCompany();
  const errText = useStoreError();
  const [v, setV] = useState({ name: '', trade_licence: '', tin_bin: '', contact_name: '', contact_email: '', contact_phone: '', industry: '' });
  const [tl, setTl] = useState<File | null>(null);
  const [tin, setTin] = useState<File | null>(null);
  const [other, setOther] = useState<File | null>(null);
  const set = (k: keyof typeof v) => (x: string) => setV({ ...v, [k]: x });
  const tooBig = [tl, tin, other].some((f) => f && f.size > 10 * 1024 * 1024);
  const submit = () => {
    if (Object.entries(v).some(([k, x]) => k !== 'contact_phone' && x.trim().length < 2)) return toast(t('fillIn'), { tone: 'warn' });
    if (!tl || !tin) return toast(t('docsNeeded'), { tone: 'warn' });
    if (tooBig) return toast(t('docTooBig'), { tone: 'warn' });
    reg.mutate({ ...v, trade_licence_doc: tl, tin_bin_doc: tin, other_doc: other }, { onSuccess: () => toast(t('registered'), { tone: 'success' }), onError: (e) => toast(errText(e), { tone: 'warn' }) });
  };
  return (
    <View style={{ gap: 14 }}>
      <Card tone="limeSoft" gap={6}>
        <Txt size={15} w={600}>
          {t('pitchTitle')}
        </Txt>
        <Txt size={13}>{t('pitch')}</Txt>
      </Card>
      <Card gap={12}>
        <Txt size={14} w={600} as="h2">
          {t('registerTitle')}
        </Txt>
        <Field label={t('f.name')} value={v.name} onChangeText={set('name')} maxLength={160} autoComplete="organization" />
        <Field label={t('f.tradeLicence')} value={v.trade_licence} onChangeText={set('trade_licence')} maxLength={80} />
        <Field label={t('f.tinBin')} value={v.tin_bin} onChangeText={set('tin_bin')} maxLength={40} />
        <Field label={t('f.industry')} value={v.industry} onChangeText={set('industry')} maxLength={60} hint={t('f.industryHint')} />
        <Field label={t('f.contactName')} value={v.contact_name} onChangeText={set('contact_name')} maxLength={120} autoComplete="name" />
        <Field label={t('f.contactEmail')} value={v.contact_email} onChangeText={set('contact_email')} maxLength={320} type="email" autoComplete="email" />
        <Field label={t('f.contactPhone')} value={v.contact_phone} onChangeText={set('contact_phone')} maxLength={24} type="tel" autoComplete="tel" />
      </Card>
      <Card gap={12}>
        <Txt size={14} w={600} as="h2">
          {t('docsTitle')}
        </Txt>
        <FileField label={t('f.tradeLicenceDoc')} hint={t('docHint')} file={tl} onFile={setTl} />
        <FileField label={t('f.tinBinDoc')} hint={t('docHint')} file={tin} onFile={setTin} />
        <FileField label={t('f.otherDoc')} hint={t('docHintOptional')} file={other} onFile={setOther} />
        <Txt size={11.5} dim>
          {t('docsPrivate')}
        </Txt>
      </Card>
      <CzButton label={t('submit')} icon="check" busy={reg.isPending} onPress={submit} />
    </View>
  );
}

/* ───────────────────────────── M2 waiting / rejected ───────────────────────────── */

function Waiting({ c }: { c: CompanyInfo }) {
  const t = useTranslations('store.company');
  const td = useTranslations('store.company.doc');
  return (
    <View style={{ gap: 12 }}>
      {c.status === 'pending' ? (
        <Note tone="navy" icon={I.clock}>
          {t('pending')}
        </Note>
      ) : (
        <Note tone="danger" icon={I.warn}>
          {c.review_note ? t('rejectedWhy', { note: c.review_note }) : t('rejected')}
        </Note>
      )}
      <Card gap={8}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Txt size={14} w={600}>
            {c.name}
          </Txt>
          <StatusTag status={c.status} />
        </View>
        <Txt size={12.5} dim>{`${t('f.tradeLicence')}: ${c.trade_licence} · ${t('f.tinBin')}: ${c.tin_bin}`}</Txt>
        <Txt size={12.5} dim>{`${c.contact_name} · ${c.contact_email}`}</Txt>
        <Txt size={12.5} dim>
          {c.documents.map((d) => td(d.kind)).join(' · ')}
        </Txt>
      </Card>
    </View>
  );
}

/* ───────────────────────────── dashboard ───────────────────────────── */

function Dashboard({ c }: { c: CompanyInfo }) {
  const t = useTranslations('store.company');
  const [tab, setTab] = useState<Tab>('overview');
  return (
    <View style={{ gap: 14 }}>
      <Seg
        value={tab}
        onChange={setTab}
        tone="card"
        label={t('title')}
        options={[
          { label: t('tabOverview'), value: 'overview' },
          { label: t('tabBuy'), value: 'buy' },
          { label: t('tabEmissions'), value: 'emissions' },
          { label: t('tabBilling'), value: 'billing' },
        ]}
      />
      {tab === 'overview' ? <Overview /> : tab === 'buy' ? <Buy /> : tab === 'emissions' ? <Emissions /> : <Billing c={c} />}
    </View>
  );
}

function Overview() {
  const t = useTranslations('store.company');
  const { f } = useCz();
  const q = useCompanyOverview(true);
  const certs = useCompanyCertificates(true);
  if (q.isPending) return <SkeletonCard lines={4} height={220} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const o = q.data;
  const tiles: [string, string, string?][] = [
    [t('ov.funded'), f.num(o.trees_funded)],
    [t('ov.allocated'), f.num(o.trees_allocated)],
    [t('ov.alive'), f.num(o.trees_alive), o.survival_rate != null ? t('ov.survival', { pct: f.pct(o.survival_rate * 100) }) : undefined],
    [t('ov.co2Est'), t('tonnes', { n: f.dec(o.co2e_estimated_t, 2) }), t('ov.estimate')],
    [t('ov.co2Cert'), t('tonnes', { n: f.dec(o.co2e_certified_t, 0) })],
    [t('ov.people'), f.num(o.people_reached)],
    [t('ov.redeemed'), f.num(o.products_redeemed)],
  ];
  return (
    <View style={{ gap: 12 }}>
      <View style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
        {tiles.map(([label, value, sub]) => (
          <StatTile key={label} label={label} value={value} sub={sub} />
        ))}
      </View>
      <Note tone="warn" icon={I.info}>
        {t('estimateLine')}
      </Note>
      <CzButton label={t('report')} icon="arrow" size="md" onPress={() => openPdf(companyReportUrl())} />
      {o.has_store_listing ? <GhostButton label={t('toPartner')} href={href('partner')} /> : null}
      <Card gap={8}>
        <Txt size={14} w={600}>
          {t('certificates')}
        </Txt>
        {certs.data?.filter((x) => x.kind === 'retirement_record').length ? (
          certs.data
            .filter((x) => x.kind === 'retirement_record')
            .map((x) => (
              <Tap key={x.id} label={t('certA11y', { from: x.serial_from ?? '', to: x.serial_to ?? '' })} onPress={() => openPdf(companyCertificateUrl(x.id))} style={{ minHeight: 44, justifyContent: 'center', textAlign: 'start' }}>
                <Txt size={12.5} w={600}>{`${x.serial_from} – ${x.serial_to}`}</Txt>
                <Txt size={11.5} dim>
                  {x.retired_at ? t('retiredOn', { date: f.date(x.retired_at) }) : ''}
                </Txt>
              </Tap>
            ))
        ) : (
          <Txt size={12.5} dim>
            {t('noCertificates')}
          </Txt>
        )}
      </Card>
    </View>
  );
}

/* ───────────────────────────── M9 buy ───────────────────────────── */

function Buy() {
  const t = useTranslations('store.company');
  const { f } = useCz();
  const q = useCompanyPackages(true);
  const [pick, setPick] = useState<CompanyPackage | null>(null);
  if (q.isPending) return <SkeletonCard lines={3} height={240} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  return (
    <View style={{ gap: 12 }}>
      {q.data.map((p) => (
        <Card key={p.id} gap={8} style={{ opacity: p.enabled ? 1 : 0.7 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
            <Txt size={15} w={600}>
              {t(`pkg.${p.id}.name`)}
            </Txt>
            <Txt size={13} w={700} num>
              {t(`unit.${p.unit}`, { price: f.tk(p.unit_price) })}
            </Txt>
          </View>
          <Txt size={12.5} dim>
            {t(`pkg.${p.id}.desc`)}
          </Txt>
          {p.id === 'tree_impact' ? (
            <Note tone="warn" icon={I.info}>
              {t('estimateLine')}
            </Note>
          ) : p.id === 'carbon_credits' ? (
            <Note tone={p.enabled ? 'lime' : 'navy'} icon={p.enabled ? I.check : I.lock}>
              {p.enabled ? t('creditsAvailable', { n: f.dec(p.available_tonnes ?? 0, 0) }) : t('creditsDisabled')}
            </Note>
          ) : null}
          <CzButton label={p.enabled ? t('choose') : t('notYet')} size="sm" icon="plus" disabled={!p.enabled} onPress={() => setPick(p)} style={{ alignSelf: 'flex-start' }} />
        </Card>
      ))}
      {pick ? <OrderSheet p={pick} onClose={() => setPick(null)} /> : null}
    </View>
  );
}

function OrderSheet({ p, onClose }: { p: CompanyPackage; onClose: () => void }) {
  const t = useTranslations('store.company');
  const { f } = useCz();
  const order = useCompanyOrder();
  const errText = useStoreError();
  const [qty, setQty] = useState(p.id === 'tree_impact' ? '100' : '1');
  const [method, setMethod] = useState<'sslcommerz' | 'bank_transfer'>('sslcommerz');
  const n = Math.max(0, Math.floor(Number(qty) || 0));
  const subtotal = n * p.unit_price;
  const vat = Math.round(subtotal * p.vat_rate * 100) / 100;
  const total = subtotal + vat;
  const transferOk = total >= p.bank_transfer_min;
  const submit = () => {
    if (n < 1) return toast(t('qtyNeeded'), { tone: 'warn' });
    order.mutate(
      { package: p.id, qty: n, payment_method: method },
      {
        onSuccess: (o) => {
          if (o.payment_url) goToPayment(o.payment_url);
          else {
            toast(t('transferPlaced'), { tone: 'success' });
            onClose();
          }
        },
        onError: (e) => toast(errText(e), { tone: 'warn' }),
      },
    );
  };
  return (
    <BottomSheet open onClose={onClose} title={t(`pkg.${p.id}.name`)} footer={<CzButton label={method === 'sslcommerz' ? t('payOnline', { total: f.tk(total) }) : t('placeTransfer')} icon="arrow" busy={order.isPending} onPress={submit} />}>
      <View style={{ gap: 12 }}>
        <Field label={t(`qty.${p.unit}`)} value={qty} onChangeText={setQty} keyboardType="number-pad" maxLength={6} />
        {p.id === 'tree_impact' && n > 0 ? (
          <Txt size={12.5} dim>
            {t('treeEstimate', { n: f.num(n), kg: f.num(n * (p.co2_kg_per_tree_year ?? 0)) })}
          </Txt>
        ) : null}
        <Seg
          value={method}
          onChange={setMethod}
          label={t('method')}
          options={[
            { label: t('online'), value: 'sslcommerz' },
            { label: t('transfer'), value: 'bank_transfer' },
          ]}
        />
        <Txt size={12} dim>
          {method === 'sslcommerz' ? t('onlineSub') : transferOk ? t('transferSub') : t('transferMin', { min: f.tk(p.bank_transfer_min) })}
        </Txt>
        <View style={{ gap: 6 }}>
          <Line k={t('subtotal')} v={f.tk(subtotal)} />
          <Line k={t('vat', { pct: f.pct(p.vat_rate * 100) })} v={f.tk(vat)} />
          <Line k={t('total')} v={f.tk(total)} bold />
        </View>
        {p.id === 'tree_impact' ? (
          <Txt size={11.5} dim>
            {t('held')}
          </Txt>
        ) : null}
      </View>
    </BottomSheet>
  );
}

function Line({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
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

/* ───────────────────────────── M3 emissions ───────────────────────────── */

function Emissions() {
  const t = useTranslations('store.company');
  const { c, f } = useCz();
  const q = useEmissions(true);
  const save = useSetEmissions();
  const errText = useStoreError();
  const [year, setYear] = useState(String(new Date().getFullYear() - 1));
  const [tonnes, setTonnes] = useState('');
  const [target, setTarget] = useState('');
  const [note, setNote] = useState('');
  const submit = () => {
    const y = Number(year);
    const tn = Number(tonnes);
    if (!(y >= 2000 && y <= 2100) || !(tn >= 0) || tonnes === '') return toast(t('fillIn'), { tone: 'warn' });
    save.mutate(
      { year: y, tonnes_co2e: tn, offset_target_t: target ? Number(target) : null, source_note: note.trim() || null },
      { onSuccess: () => toast(t('saved'), { tone: 'success' }), onError: (e) => toast(errText(e), { tone: 'warn' }) },
    );
  };
  return (
    <View style={{ gap: 12 }}>
      <Note tone="navy" icon={I.info}>
        {t('emissionsLabel')}
      </Note>
      {q.isPending ? (
        <SkeletonCard lines={2} height={100} />
      ) : q.isError ? (
        <ErrorState compact error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data.length ? (
        <Card pad={0} gap={0} style={{ paddingHorizontal: 14 }}>
          {q.data.map((r, i) => (
            <View key={r.year} style={{ paddingVertical: 12, gap: 2, borderBottomWidth: i === q.data.length - 1 ? 0 : 1, borderBottomColor: c.line }}>
              <Txt size={13.5} w={600}>{`${f.loc(r.year)} · ${t('tonnes', { n: f.num(r.tonnes_co2e) })}`}</Txt>
              <Txt size={12} dim>
                {[r.offset_target_t != null ? t('target', { n: f.num(r.offset_target_t) }) : null, r.source_note, t('ownFigure')].filter(Boolean).join(' · ')}
              </Txt>
            </View>
          ))}
        </Card>
      ) : (
        <EmptyState icon={I.trend} title={t('noEmissions')} />
      )}
      <Card gap={10}>
        <Field label={t('f.year')} value={year} onChangeText={setYear} keyboardType="number-pad" maxLength={4} />
        <Field label={t('f.tonnes')} value={tonnes} onChangeText={setTonnes} keyboardType="decimal-pad" maxLength={12} />
        <Field label={t('f.target')} value={target} onChangeText={setTarget} keyboardType="decimal-pad" maxLength={12} />
        <Field label={t('f.source')} value={note} onChangeText={setNote} maxLength={300} hint={t('f.sourceHint')} />
        <CzButton label={t('save')} icon="check" size="md" busy={save.isPending} onPress={submit} />
      </Card>
    </View>
  );
}

/* ───────────────────────────── M13 billing ───────────────────────────── */

function Billing({ c }: { c: CompanyInfo }) {
  const t = useTranslations('store.company');
  const { c: pal, f } = useCz();
  const inv = useCompanyInvoices(true);
  const ov = useCompanyOverview(true);
  return (
    <View style={{ gap: 12 }}>
      <Card gap={6}>
        <Txt size={14} w={600}>
          {t('invoices')}
        </Txt>
        {inv.isPending ? (
          <SkeletonCard lines={2} height={80} />
        ) : inv.isError ? (
          <ErrorState compact error={inv.error} onRetry={() => void inv.refetch()} />
        ) : inv.data.length ? (
          inv.data.map((i) => (
            <Tap key={i.id} label={t('invoiceA11y', { n: i.number })} onPress={() => openPdf(companyInvoiceUrl(i.id))} style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderTopWidth: 1, borderTopColor: pal.line }}>
              <View style={{ gap: 2 }}>
                <Txt size={13} w={600}>
                  {i.number}
                </Txt>
                <Txt size={11.5} dim>
                  {f.date(i.created_at)}
                </Txt>
              </View>
              <Txt size={13} num w={600}>
                {f.tk(i.total)}
              </Txt>
            </Tap>
          ))
        ) : (
          <Txt size={12.5} dim>
            {t('noInvoices')}
          </Txt>
        )}
      </Card>
      <Card gap={6}>
        <Txt size={14} w={600}>
          {t('orders')}
        </Txt>
        {ov.data?.orders.length ? (
          ov.data.orders.map((o) => (
            <View key={o.id} style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderTopWidth: 1, borderTopColor: pal.line, paddingVertical: 6 }}>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Txt size={13} w={600} lines={1}>{`${t(`pkg.${o.package}.name`)} × ${f.num(o.qty)}`}</Txt>
                <Txt size={11.5} dim>{`${f.date(o.created_at)} · ${f.tk(o.total)} · ${o.payment_method === 'bank_transfer' ? t('transfer') : t('online')}`}</Txt>
              </View>
              <StatusTag status={o.status} />
            </View>
          ))
        ) : (
          <Txt size={12.5} dim>
            {t('noOrders')}
          </Txt>
        )}
      </Card>
      <Txt size={11.5} dim>
        {t('billTo', { name: c.name, tl: c.trade_licence, tin: c.tin_bin })}
      </Txt>
    </View>
  );
}
