/** IDs and time helpers. `crypto.randomUUID` needs a secure context, so fall back to getRandomValues. */

export function newId(prefix = ''): string {
  const c = globalThis.crypto;
  let id: string;
  if (c && typeof c.randomUUID === 'function') {
    try {
      id = c.randomUUID();
      return prefix ? `${prefix}-${id}` : id;
    } catch {
      // insecure context
    }
  }
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  id = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return prefix ? `${prefix}-${id}` : id;
}

export const DAY_MS = 864e5;

/** Local calendar day `YYYY-MM-DD` (used for daily counters). */
export function dayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDaysIso(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * DAY_MS).toISOString();
}
