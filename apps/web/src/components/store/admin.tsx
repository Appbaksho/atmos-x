'use client';
/**
 * Admin (prompt-v1 §6.10 M2, M14, M16): review company documents, create and certify credit lots
 * (Sold/Retired stay blocked in the database until a certified registration is recorded), confirm
 * bank transfers, and allocate verified trees to paid tree packages.
 */
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { BottomSheet, Card, CzButton, EmptyState, ErrorState, Field, GhostButton, I, Note, Screen, ScreenHeader, Seg, SkeletonCard, Tap, Txt, View, toast, useCz } from '@/components/cz';
import { adminDocumentUrl, useAdminCompanies, useAdminOrders, useAllocateTrees, useCertifyLot, useConfirmTransfer, useCreateLot, useCreditLots, useReviewCompany, useSession } from '@/lib/data/hooks';
import type { CompanyInfo, CompanyStatus, CreditLotOut } from '@/lib/data/types';

import { StatusTag, openPdf, useStoreError } from './shared';

type Tab = 'companies' | 'lots' | 'transfers';

export function AdminScreen() {
  const t = useTranslations('store.admin');
  const session = useSession();
  const [tab, setTab] = useState<Tab>('companies');
  if (session.role !== 'admin') {
    return (
      <Screen>
        <ScreenHeader title={t('title')} />
        <EmptyState icon={I.lock} title={t('only')} />
      </Screen>
    );
  }
  return (
    <Screen>
      <ScreenHeader title={t('title')} sub={t('sub')} />
      <Seg
        value={tab}
        onChange={setTab}
        tone="card"
        label={t('title')}
        options={[
          { label: t('tabCompanies'), value: 'companies' },
          { label: t('tabLots'), value: 'lots' },
          { label: t('tabTransfers'), value: 'transfers' },
        ]}
      />
      {tab === 'companies' ? <Companies /> : tab === 'lots' ? <Lots /> : <Transfers />}
    </Screen>
  );
}

/* ───────────────────────────── M2 company review ───────────────────────────── */

function Companies() {
  const t = useTranslations('store.admin');
  const ts = useTranslations('store.status');
  const [status, setStatus] = useState<CompanyStatus>('pending');
  const q = useAdminCompanies(status);
  return (
    <View style={{ gap: 12 }}>
      <Seg
        value={status}
        onChange={setStatus}
        label={t('tabCompanies')}
        options={(['pending', 'approved', 'rejected'] as const).map((s) => ({ label: ts(s), value: s }))}
      />
      {q.isPending ? (
        <SkeletonCard lines={3} height={160} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data.length ? (
        q.data.map((c) => <CompanyCard key={c.id} c={c} />)
      ) : (
        <EmptyState icon={I.check} title={t('noCompanies')} />
      )}
    </View>
  );
}

function CompanyCard({ c }: { c: CompanyInfo }) {
  const t = useTranslations('store.admin');
  const td = useTranslations('store.company.doc');
  const { f } = useCz();
  const review = useReviewCompany();
  const errText = useStoreError();
  const [note, setNote] = useState('');
  const act = (approve: boolean) => {
    if (!approve && note.trim().length < 3) return toast(t('noteNeeded'), { tone: 'warn' });
    review.mutate({ id: c.id, approve, note: note.trim() || null }, { onSuccess: () => toast(approve ? t('approved') : t('rejected'), { tone: 'success' }), onError: (e) => toast(errText(e), { tone: 'warn' }) });
  };
  return (
    <Card gap={8}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <Txt size={14.5} w={600} style={{ flex: 1, minWidth: 0 }}>
          {c.name}
        </Txt>
        <StatusTag status={c.status} />
      </View>
      <Txt size={12.5} dim>{`${c.industry} · ${t('tl')}: ${c.trade_licence} · ${t('tin')}: ${c.tin_bin}`}</Txt>
      <Txt size={12.5} dim>{[c.contact_name, c.contact_email, c.contact_phone].filter(Boolean).join(' · ')}</Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {c.documents.map((d) => (
          <GhostButton key={d.id} label={`${td(d.kind)} · ${f.num(Math.ceil(d.size / 1024))} KB`} height={36} onPress={() => openPdf(adminDocumentUrl(c.id, d.id))} style={{ paddingHorizontal: 12 }} />
        ))}
      </View>
      {c.status === 'pending' ? (
        <>
          <Field label={t('note')} value={note} onChangeText={setNote} maxLength={500} hint={t('noteHint')} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <CzButton label={t('approve')} size="sm" icon="check" busy={review.isPending} onPress={() => act(true)} style={{ flex: 1 }} />
            <GhostButton label={t('reject')} height={38} disabled={review.isPending} onPress={() => act(false)} style={{ flex: 1 }} />
          </View>
        </>
      ) : c.review_note ? (
        <Txt size={12} dim>
          {c.review_note}
        </Txt>
      ) : null}
    </Card>
  );
}

/* ───────────────────────────── M16 credit lots ───────────────────────────── */

function Lots() {
  const t = useTranslations('store.admin');
  const { f } = useCz();
  const q = useCreditLots();
  const create = useCreateLot();
  const allocate = useAllocateTrees();
  const errText = useStoreError();
  const [ids, setIds] = useState('');
  const [tonnes, setTonnes] = useState('');
  const [project, setProject] = useState('');
  const [certifying, setCertifying] = useState<CreditLotOut | null>(null);
  const submit = () => {
    const treeIds = ids
      .split(/[\s,]+/)
      .map((x) => x.trim())
      .filter(Boolean);
    const tn = Number(tonnes);
    if (!treeIds.length || !(tn > 0)) return toast(t('lotFill'), { tone: 'warn' });
    create.mutate(
      { tree_ids: treeIds, tonnes: tn, project_id: project.trim() || null },
      {
        onSuccess: () => {
          setIds('');
          setTonnes('');
          toast(t('lotCreated'), { tone: 'success' });
        },
        onError: (e) => toast(errText(e), { tone: 'warn' }),
      },
    );
  };
  return (
    <View style={{ gap: 12 }}>
      <Note tone="warn" icon={I.info}>
        {t('lotRule')}
      </Note>
      {q.isPending ? (
        <SkeletonCard lines={3} height={160} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data.length ? (
        q.data.map((l) => (
          <Card key={l.id} gap={6}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <Txt size={14} w={600}>{`${l.serial_prefix} · ${t('tonnes', { n: f.dec(l.tonnes, 0) })}`}</Txt>
              <StatusTag status={l.state} />
            </View>
            <Txt size={12} dim>
              {[l.project_id && t('project', { id: l.project_id }), l.standard, l.registry_project_id, l.auditor, l.certified_at && f.date(l.certified_at)].filter(Boolean).join(' · ') || t('uncertified')}
            </Txt>
            {l.state === 'estimated' ? <GhostButton label={t('certify')} height={38} onPress={() => setCertifying(l)} style={{ alignSelf: 'flex-start', paddingHorizontal: 14 }} /> : null}
          </Card>
        ))
      ) : (
        <EmptyState icon={I.tree} title={t('noLots')} />
      )}
      <Card gap={10}>
        <Txt size={14} w={600}>
          {t('newLot')}
        </Txt>
        <Field label={t('treeIds')} value={ids} onChangeText={setIds} multiline hint={t('treeIdsHint')} />
        <Field label={t('tonnesL')} value={tonnes} onChangeText={setTonnes} keyboardType="decimal-pad" maxLength={10} />
        <Field label={t('projectL')} value={project} onChangeText={setProject} maxLength={80} hint={t('projectHint')} />
        <CzButton label={t('createLot')} icon="plus" size="md" busy={create.isPending} onPress={submit} />
      </Card>
      <Card gap={8}>
        <Txt size={14} w={600}>
          {t('allocateTitle')}
        </Txt>
        <Txt size={12.5} dim>
          {t('allocateSub')}
        </Txt>
        <GhostButton label={t('allocate')} disabled={allocate.isPending} onPress={() => allocate.mutate(undefined, { onSuccess: (r) => toast(t('allocated', { n: f.num(r.allocated) }), { tone: 'success' }), onError: (e) => toast(errText(e), { tone: 'warn' }) })} />
      </Card>
      {certifying ? <CertifySheet lot={certifying} onClose={() => setCertifying(null)} /> : null}
    </View>
  );
}

function CertifySheet({ lot, onClose }: { lot: CreditLotOut; onClose: () => void }) {
  const t = useTranslations('store.admin');
  const certify = useCertifyLot();
  const errText = useStoreError();
  const [standard, setStandard] = useState('');
  const [registry, setRegistry] = useState('');
  const [auditor, setAuditor] = useState('');
  const submit = () => {
    if (standard.trim().length < 2 || registry.trim().length < 2 || auditor.trim().length < 2) return toast(t('certifyFill'), { tone: 'warn' });
    certify.mutate(
      { id: lot.id, standard: standard.trim(), registry_project_id: registry.trim(), auditor: auditor.trim() },
      {
        onSuccess: () => {
          toast(t('certified'), { tone: 'success' });
          onClose();
        },
        onError: (e) => toast(errText(e), { tone: 'warn' }),
      },
    );
  };
  return (
    <BottomSheet open onClose={onClose} title={t('certify')} sub={lot.serial_prefix} footer={<CzButton label={t('certify')} icon="check" busy={certify.isPending} onPress={submit} />}>
      <View style={{ gap: 12 }}>
        <Note tone="warn" icon={I.warn}>
          {t('certifyWarn')}
        </Note>
        <Field label={t('standard')} value={standard} onChangeText={setStandard} maxLength={40} hint={t('standardHint')} />
        <Field label={t('registry')} value={registry} onChangeText={setRegistry} maxLength={80} />
        <Field label={t('auditor')} value={auditor} onChangeText={setAuditor} maxLength={120} />
      </View>
    </BottomSheet>
  );
}

/* ───────────────────────────── M14 bank transfers ───────────────────────────── */

function Transfers() {
  const t = useTranslations('store.admin');
  const tp = useTranslations('store.company');
  const { c, f } = useCz();
  const q = useAdminOrders();
  const confirm = useConfirmTransfer();
  const errText = useStoreError();
  if (q.isPending) return <SkeletonCard lines={3} height={160} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data.length) return <EmptyState icon={I.check} title={t('noTransfers')} />;
  return (
    <Card pad={0} gap={0} style={{ paddingHorizontal: 14 }}>
      {q.data.map((o, i) => (
        <View key={o.id} style={{ paddingVertical: 12, gap: 6, borderBottomWidth: i === q.data.length - 1 ? 0 : 1, borderBottomColor: c.line }}>
          <Txt size={13.5} w={600}>{`${tp(`pkg.${o.package}.name`)} × ${f.num(o.qty)} · ${f.tk(o.total)}`}</Txt>
          <Txt size={11.5} dim>{`${o.tran_id} · ${f.date(o.created_at)}`}</Txt>
          <Tap
            label={t('confirmTransfer')}
            disabled={confirm.isPending}
            onPress={() => confirm.mutate(o.id, { onSuccess: () => toast(t('transferConfirmed'), { tone: 'success' }), onError: (e) => toast(errText(e), { tone: 'warn' }) })}
            style={{ minHeight: 40, justifyContent: 'center', alignSelf: 'flex-start' }}>
            <Txt size={12.5} w={600} color={c.leaf}>
              {t('confirmTransfer')}
            </Txt>
          </Tap>
        </View>
      ))}
    </Card>
  );
}
