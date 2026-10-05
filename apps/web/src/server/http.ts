import 'server-only';

import { env } from './env';
import { errMsg, logTiming } from './util';

/** Outbound HTTP: every call has a timeout and one retry; Overpass rotates (and hedges) across mirrors. */

export class UpstreamError extends Error {
  status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = 'UpstreamError';
    this.status = status;
  }
}

type FetchOpts = { timeoutMs?: number; retries?: number; init?: RequestInit; signal?: AbortSignal };

async function once(url: string, timeoutMs: number, init: RequestInit = {}, outer?: AbortSignal): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs);
  const onAbort = () => ctrl.abort(outer?.reason);
  outer?.addEventListener('abort', onAbort);
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: { Accept: 'application/json', 'User-Agent': env.userAgent, ...(init.headers ?? {}) },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new UpstreamError(`HTTP ${res.status} from ${new URL(url).host}: ${body.slice(0, 120)}`, res.status);
    }
    return res;
  } catch (e) {
    if (e instanceof UpstreamError) throw e;
    throw new UpstreamError(`${new URL(url).host}: ${ctrl.signal.aborted ? `timeout after ${timeoutMs}ms` : errMsg(e)}`);
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener('abort', onAbort);
  }
}

const retryable = (e: unknown) => !(e instanceof UpstreamError) || e.status == null || e.status >= 500 || e.status === 429;

/** GET/POST JSON with an 8 s timeout and one retry. */
export async function fetchJSON<T>(url: string, opts: FetchOpts = {}): Promise<T> {
  const { timeoutMs = 8000, retries = 1, init, signal } = opts;
  let last: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await once(url, timeoutMs, init, signal);
      return (await res.json()) as T;
    } catch (e) {
      last = e;
      if (!retryable(e) || signal?.aborted) break;
      if (i < retries) await new Promise((r) => setTimeout(r, 300));
    }
  }
  throw last instanceof Error ? last : new UpstreamError(String(last));
}

/**
 * POST an Overpass QL query. Starts on the first mirror; if it has not answered after `hedgeMs`
 * (or fails), the next mirror is tried in parallel. First good answer wins; the rest are aborted.
 */
export async function overpass<T>(query: string, opts: { timeoutMs?: number; hedgeMs?: number } = {}): Promise<T> {
  const { timeoutMs = 25_000, hedgeMs = 6_000 } = opts;
  const mirrors = env.overpassUrls;
  const ctrl = new AbortController();
  const body = `data=${encodeURIComponent(query)}`;
  const errors: string[] = [];
  const t0 = performance.now();

  return new Promise<T>((resolve, reject) => {
    let started = 0;
    let finished = 0;
    let done = false;
    let hedgeTimer: ReturnType<typeof setTimeout> | null = null;

    // Overall deadline across all mirrors (hedged requests must not add up past the budget).
    const deadline = setTimeout(() => {
      if (done) return;
      done = true;
      if (hedgeTimer) clearTimeout(hedgeTimer);
      ctrl.abort(new Error('overpass deadline'));
      reject(new UpstreamError(`Overpass did not answer within ${timeoutMs}ms: ${errors.join(' | ') || 'no response'}`));
    }, timeoutMs);
    const start = () => {
      if (done || started >= mirrors.length) return;
      const idx = started++;
      const url = mirrors[idx];
      if (hedgeTimer) clearTimeout(hedgeTimer);
      hedgeTimer = setTimeout(start, hedgeMs);
      once(url, timeoutMs, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }, ctrl.signal)
        .then((res) => res.json() as Promise<T & { remark?: string }>)
        .then((j) => {
          if (done) return;
          if (j && typeof j === 'object' && 'remark' in j && typeof j.remark === 'string' && /runtime error|timed out|out of memory/i.test(j.remark)) {
            throw new UpstreamError(`overpass remark: ${j.remark.slice(0, 100)}`);
          }
          done = true;
          clearTimeout(deadline);
          if (hedgeTimer) clearTimeout(hedgeTimer);
          logTiming('overpass', t0, `${new URL(url).host}${idx > 0 ? ` (mirror ${idx + 1})` : ''}`);
          ctrl.abort(new Error('another mirror answered'));
          resolve(j);
        })
        .catch((e) => {
          finished++;
          if (done) return;
          errors.push(errMsg(e));
          if (started < mirrors.length) start();
          else if (finished >= started) {
            done = true;
            clearTimeout(deadline);
            if (hedgeTimer) clearTimeout(hedgeTimer);
            reject(new UpstreamError(`Overpass failed on all mirrors: ${errors.join(' | ')}`));
          }
        });
    };
    start();
  });
}

/** Serialises calls so they are at least `gapMs` apart (Nominatim: 1 request per second). */
export function spaced(gapMs: number) {
  let chain: Promise<unknown> = Promise.resolve();
  let last = 0;
  return function run<T>(fn: () => Promise<T>): Promise<T> {
    const next = chain.then(async () => {
      const wait = last + gapMs - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      last = Date.now();
      return fn();
    });
    chain = next.catch(() => {});
    return next;
  };
}
