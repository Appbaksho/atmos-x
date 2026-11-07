'use client';
/**
 * Points store, saplings, partner portal, company marketplace and admin (prompt-v1 §6.9–§6.10).
 * Every number comes from the server: balances from the points ledger, prices within the M22 band,
 * VAT from the server's rate. Online payment returns a gateway URL the browser is sent to.
 */
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { postForm } from '@/lib/api/client';

import type {
  AdminOrder,
  CompanyCertificate,
  CompanyInfo,
  CompanyInvoice,
  CompanyOrder,
  CompanyOverview,
  CompanyPackage,
  CompanyRegisterInput,
  CompanyStatus,
  CreditLotOut,
  EmissionsRow,
  LatLng,
  MyOrders,
  PackageId,
  PartnerPortal,
  PartnerProduct,
  PartnerProductInput,
  PartnerProductPatch,
  SaplingListing,
  SaplingOrderOut,
  StoreFilter,
  StoreListing,
  StoreOrder,
  StorePartner,
  StoreProduct,
} from '../types';
import { useDataContext } from './context';
import { getJSON, request, shouldRetry } from './http';
import { API } from './heat';
import { qk } from './keys';

async function send<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await request(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return (res.status === 204 ? undefined : await res.json()) as T;
}

const enc = encodeURIComponent;

/** Store data depends on the namespace (demo people see the demo pilot partner only). */
const sk = {
  root: (ns: string) => ['atmos', 'local', ns, 'store'] as const,
  partners: (ns: string) => ['atmos', 'local', ns, 'store', 'partners'] as const,
  products: (ns: string, f: StoreFilter | null) => ['atmos', 'local', ns, 'store', 'products', f ?? 'all'] as const,
  product: (ns: string, id: string) => ['atmos', 'local', ns, 'store', 'product', id] as const,
  orders: (ns: string) => ['atmos', 'local', ns, 'store', 'orders'] as const,
  saplings: (ns: string, p: LatLng | null) => ['atmos', 'local', ns, 'store', 'saplings', p ? Math.round(p.lat * 100) / 100 : null, p ? Math.round(p.lng * 100) / 100 : null] as const,
  partnerMe: (ns: string) => ['atmos', 'local', ns, 'partner', 'me'] as const,
  partner: (ns: string) => ['atmos', 'local', ns, 'partner'] as const,
  company: (ns: string) => ['atmos', 'local', ns, 'company'] as const,
  admin: (ns: string) => ['atmos', 'local', ns, 'admin'] as const,
};

function afterSpend(qc: QueryClient, ns: string) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: sk.root(ns) }),
    qc.invalidateQueries({ queryKey: qk.stats(ns) }),
    qc.invalidateQueries({ queryKey: qk.notifications(ns) }),
  ]);
}

/** Send the browser to the payment gateway (full page load; it comes back to ?payment=). */
export function goToPayment(url: string) {
  window.location.assign(url);
}

/* ───────────────────────────── points store ───────────────────────────── */

export function useStorePartners() {
  const ctx = useDataContext();
  return useQuery<StorePartner[]>({
    queryKey: sk.partners(ctx.ns),
    enabled: ctx.ready,
    retry: shouldRetry,
    queryFn: ({ signal }) => getJSON<StorePartner[]>(`${API}/store/partners`, undefined, signal),
  });
}

export function useStoreProducts(filter: StoreFilter | null = null) {
  const ctx = useDataContext();
  return useQuery<StoreListing>({
    queryKey: sk.products(ctx.ns, filter),
    enabled: ctx.ready,
    retry: shouldRetry,
    queryFn: ({ signal }) => getJSON<StoreListing>(`${API}/store/products`, { filter: filter ?? undefined }, signal),
  });
}

export function useStoreProduct(id: string | null | undefined) {
  const ctx = useDataContext();
  return useQuery<StoreProduct>({
    queryKey: sk.product(ctx.ns, id ?? ''),
    enabled: ctx.ready && !!id,
    retry: shouldRetry,
    queryFn: ({ signal }) => getJSON<StoreProduct>(`${API}/store/products/${enc(id!)}`, undefined, signal),
  });
}

/** One redemption: points come off at once, a voucher (pickup) or a delivery order is created. */
export function useRedeem() {
  const ctx = useDataContext();
  const qc = useQueryClient();
  return useMutation<StoreOrder, Error, { id: string; delivery_address?: string | null }>({
    mutationFn: ({ id, delivery_address }) => send<StoreOrder>('POST', `/store/products/${enc(id)}/redeem`, { delivery_address: delivery_address ?? null }),
    onSuccess: () => afterSpend(qc, ctx.ns),
  });
}

export function useMyOrders() {
  const ctx = useDataContext();
  return useQuery<MyOrders>({
    queryKey: sk.orders(ctx.ns),
    enabled: ctx.ready,
    retry: shouldRetry,
    queryFn: ({ signal }) => (ctx.kind === 'guest' ? Promise.resolve({ redemptions: [], saplings: [] }) : getJSON<MyOrders>(`${API}/orders/mine`, undefined, signal)),
  });
}

/* ───────────────────────────── saplings ───────────────────────────── */

export function useSaplings(point: LatLng | null) {
  const ctx = useDataContext();
  return useQuery<SaplingListing>({
    queryKey: sk.saplings(ctx.ns, point),
    enabled: ctx.ready,
    retry: shouldRetry,
    queryFn: ({ signal }) => getJSON<SaplingListing>(`${API}/saplings/products`, point ? { lat: point.lat, lng: point.lng } : undefined, signal),
  });
}

export function useOrderSaplings() {
  const ctx = useDataContext();
  const qc = useQueryClient();
  return useMutation<SaplingOrderOut, Error, { product_id: string; qty: number; delivery_address?: string | null }>({
    mutationFn: (body) => send<SaplingOrderOut>('POST', '/saplings/orders', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: sk.orders(ctx.ns) }),
  });
}

export const saplingInvoiceUrl = (orderId: string) => `${API}/saplings/orders/${enc(orderId)}/invoice.pdf`;

/* ───────────────────────────── partner portal ───────────────────────────── */

/** The partner this person works for, or null. Never 403s. */
export function usePartnerMe() {
  const ctx = useDataContext();
  return useQuery<StorePartner | null>({
    queryKey: sk.partnerMe(ctx.ns),
    enabled: ctx.ready,
    retry: shouldRetry,
    staleTime: 5 * 60_000,
    queryFn: async ({ signal }) => (ctx.kind === 'guest' ? null : (await getJSON<{ partner: StorePartner | null }>(`${API}/partner/me`, undefined, signal)).partner),
  });
}

export function usePartnerPortal(enabled = true) {
  const ctx = useDataContext();
  return useQuery<PartnerPortal>({
    queryKey: [...sk.partner(ctx.ns), 'products'],
    enabled: ctx.ready && enabled,
    retry: shouldRetry,
    queryFn: ({ signal }) => getJSON<PartnerPortal>(`${API}/partner/products`, undefined, signal),
  });
}

export function useSavePartnerProduct() {
  const ctx = useDataContext();
  const qc = useQueryClient();
  return useMutation<PartnerProduct, Error, { id?: string; add?: PartnerProductInput; patch?: PartnerProductPatch }>({
    mutationFn: ({ id, add, patch }) => (id ? send<PartnerProduct>('PATCH', `/partner/products/${enc(id)}`, patch ?? {}) : send<PartnerProduct>('POST', '/partner/products', add)),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: sk.partner(ctx.ns) }), qc.invalidateQueries({ queryKey: sk.root(ctx.ns) })]),
  });
}

export function usePartnerRedemptions(enabled = true) {
  const ctx = useDataContext();
  return useQuery<StoreOrder[]>({
    queryKey: [...sk.partner(ctx.ns), 'redemptions'],
    enabled: ctx.ready && enabled,
    retry: shouldRetry,
    refetchInterval: 60_000,
    queryFn: ({ signal }) => getJSON<StoreOrder[]>(`${API}/partner/redemptions`, undefined, signal),
  });
}

/** Mark a voucher collected (codes are case-insensitive; spaces and dashes are ignored). */
export function useCollectVoucher() {
  const ctx = useDataContext();
  const qc = useQueryClient();
  return useMutation<StoreOrder, Error, { code: string; outlet_id?: string | null }>({
    mutationFn: ({ code, outlet_id }) => send<StoreOrder>('POST', `/partner/vouchers/${enc(normalizeVoucher(code))}/collect`, { outlet_id: outlet_id ?? null }),
    onSuccess: () => qc.invalidateQueries({ queryKey: sk.partner(ctx.ns) }),
  });
}

export function useMarkDelivered() {
  const ctx = useDataContext();
  const qc = useQueryClient();
  return useMutation<StoreOrder, Error, string>({
    mutationFn: (id) => send<StoreOrder>('POST', `/partner/redemptions/${enc(id)}/delivered`),
    onSuccess: () => qc.invalidateQueries({ queryKey: sk.partner(ctx.ns) }),
  });
}

export const partnerReportUrl = () => `${API}/partner/report`;

export function normalizeVoucher(code: string): string {
  return code.replace(/[\s-]+/g, '').toUpperCase();
}

/* ───────────────────────────── company ───────────────────────────── */

export function useCompany() {
  const ctx = useDataContext();
  return useQuery<CompanyInfo | null>({
    queryKey: [...sk.company(ctx.ns), 'me'],
    enabled: ctx.ready,
    retry: shouldRetry,
    queryFn: async ({ signal }) => (ctx.kind === 'guest' ? null : (await getJSON<{ company: CompanyInfo | null }>(`${API}/company/me`, undefined, signal)).company),
  });
}

export function useRegisterCompany() {
  const ctx = useDataContext();
  const qc = useQueryClient();
  return useMutation<CompanyInfo, Error, CompanyRegisterInput>({
    mutationFn: (input) => {
      const form = new FormData();
      for (const k of ['name', 'trade_licence', 'tin_bin', 'contact_name', 'contact_email', 'industry'] as const) form.set(k, input[k].trim());
      if (input.contact_phone?.trim()) form.set('contact_phone', input.contact_phone.trim());
      form.set('trade_licence_doc', input.trade_licence_doc);
      form.set('tin_bin_doc', input.tin_bin_doc);
      if (input.other_doc) form.set('other_doc', input.other_doc);
      return postForm<CompanyInfo>(`${API}/company/register`, form);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: sk.company(ctx.ns) }),
  });
}

export function useUpdateCompany() {
  const ctx = useDataContext();
  const qc = useQueryClient();
  return useMutation<{ company: CompanyInfo }, Error, Partial<Omit<CompanyInfo, 'id' | 'status' | 'documents' | 'review_note' | 'approved_at'>>>({
    mutationFn: (patch) => send('PATCH', '/company/me', patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: sk.company(ctx.ns) }),
  });
}

export function useCompanyOverview(enabled: boolean) {
  const ctx = useDataContext();
  return useQuery<CompanyOverview>({
    queryKey: [...sk.company(ctx.ns), 'overview'],
    enabled: ctx.ready && enabled,
    retry: shouldRetry,
    queryFn: ({ signal }) => getJSON<CompanyOverview>(`${API}/company/overview`, undefined, signal),
  });
}

export function useEmissions(enabled: boolean) {
  const ctx = useDataContext();
  return useQuery<EmissionsRow[]>({
    queryKey: [...sk.company(ctx.ns), 'emissions'],
    enabled: ctx.ready && enabled,
    retry: shouldRetry,
    queryFn: ({ signal }) => getJSON<EmissionsRow[]>(`${API}/company/emissions`, undefined, signal),
  });
}

export function useSetEmissions() {
  const ctx = useDataContext();
  const qc = useQueryClient();
  return useMutation<EmissionsRow[], Error, { year: number; tonnes_co2e: number; offset_target_t?: number | null; source_note?: string | null }>({
    mutationFn: (body) => send<EmissionsRow[]>('PATCH', '/company/emissions', body),
    onSuccess: (rows) => qc.setQueryData([...sk.company(ctx.ns), 'emissions'], rows),
  });
}

export function useCompanyPackages(enabled: boolean) {
  const ctx = useDataContext();
  return useQuery<CompanyPackage[]>({
    queryKey: [...sk.company(ctx.ns), 'packages'],
    enabled: ctx.ready && enabled,
    retry: shouldRetry,
    queryFn: ({ signal }) => getJSON<CompanyPackage[]>(`${API}/company/packages`, undefined, signal),
  });
}

export function useCompanyOrder() {
  const ctx = useDataContext();
  const qc = useQueryClient();
  return useMutation<CompanyOrder, Error, { package: PackageId; qty: number; payment_method: 'sslcommerz' | 'bank_transfer' }>({
    mutationFn: (body) => send<CompanyOrder>('POST', '/company/orders', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: sk.company(ctx.ns) }),
  });
}

export function useCompanyInvoices(enabled: boolean) {
  const ctx = useDataContext();
  return useQuery<CompanyInvoice[]>({
    queryKey: [...sk.company(ctx.ns), 'invoices'],
    enabled: ctx.ready && enabled,
    retry: shouldRetry,
    queryFn: ({ signal }) => getJSON<CompanyInvoice[]>(`${API}/company/invoices`, undefined, signal),
  });
}

export function useCompanyCertificates(enabled: boolean) {
  const ctx = useDataContext();
  return useQuery<CompanyCertificate[]>({
    queryKey: [...sk.company(ctx.ns), 'certificates'],
    enabled: ctx.ready && enabled,
    retry: shouldRetry,
    queryFn: ({ signal }) => getJSON<CompanyCertificate[]>(`${API}/company/certificates`, undefined, signal),
  });
}

export const companyInvoiceUrl = (id: string) => `${API}/company/invoices/${enc(id)}.pdf`;
export const companyCertificateUrl = (id: string) => `${API}/company/certificates/${enc(id)}.pdf`;
export const companyReportUrl = () => `${API}/company/report.pdf`;

/* ───────────────────────────── admin ───────────────────────────── */

export function useAdminCompanies(status: CompanyStatus, enabled = true) {
  const ctx = useDataContext();
  return useQuery<CompanyInfo[]>({
    queryKey: [...sk.admin(ctx.ns), 'companies', status],
    enabled: ctx.ready && enabled,
    retry: shouldRetry,
    queryFn: ({ signal }) => getJSON<CompanyInfo[]>(`${API}/admin/companies`, { status }, signal),
  });
}

export function useReviewCompany() {
  const ctx = useDataContext();
  const qc = useQueryClient();
  return useMutation<CompanyInfo, Error, { id: string; approve: boolean; note?: string | null }>({
    mutationFn: ({ id, approve, note }) => send<CompanyInfo>('POST', `/admin/companies/${enc(id)}/approve`, { approve, note: note ?? null }),
    onSuccess: () => qc.invalidateQueries({ queryKey: sk.admin(ctx.ns) }),
  });
}

export const adminDocumentUrl = (companyId: string, docId: string) => `${API}/admin/companies/${enc(companyId)}/documents/${enc(docId)}`;

export function useCreditLots(enabled = true) {
  const ctx = useDataContext();
  return useQuery<CreditLotOut[]>({
    queryKey: [...sk.admin(ctx.ns), 'lots'],
    enabled: ctx.ready && enabled,
    retry: shouldRetry,
    queryFn: ({ signal }) => getJSON<CreditLotOut[]>(`${API}/admin/credit-lots`, undefined, signal),
  });
}

export function useCreateLot() {
  const ctx = useDataContext();
  const qc = useQueryClient();
  return useMutation<CreditLotOut, Error, { tree_ids: string[]; tonnes: number; project_id?: string | null }>({
    mutationFn: (body) => send<CreditLotOut>('POST', '/admin/credit-lots', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: sk.admin(ctx.ns) }),
  });
}

export function useCertifyLot() {
  const ctx = useDataContext();
  const qc = useQueryClient();
  return useMutation<CreditLotOut, Error, { id: string; standard: string; registry_project_id: string; auditor: string }>({
    mutationFn: ({ id, ...body }) => send<CreditLotOut>('POST', `/admin/credit-lots/${enc(id)}/certify`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: sk.admin(ctx.ns) }),
  });
}

export function useAdminOrders(enabled = true) {
  const ctx = useDataContext();
  return useQuery<AdminOrder[]>({
    queryKey: [...sk.admin(ctx.ns), 'orders'],
    enabled: ctx.ready && enabled,
    retry: shouldRetry,
    queryFn: ({ signal }) => getJSON<AdminOrder[]>(`${API}/admin/orders`, { status: 'awaiting_transfer' }, signal),
  });
}

export function useConfirmTransfer() {
  const ctx = useDataContext();
  const qc = useQueryClient();
  return useMutation<CompanyOrder, Error, string>({
    mutationFn: (id) => send<CompanyOrder>('POST', `/admin/orders/${enc(id)}/confirm-transfer`),
    onSuccess: () => qc.invalidateQueries({ queryKey: sk.admin(ctx.ns) }),
  });
}

export function useAllocateTrees() {
  return useMutation<{ allocated: number }, Error, void>({
    mutationFn: () => send<{ allocated: number }>('POST', '/admin/allocate'),
  });
}
