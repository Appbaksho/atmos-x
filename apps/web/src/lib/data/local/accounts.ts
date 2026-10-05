/**
 * Local "accounts" (prompt-v0.md §4.5): the account lives on this device. Passwords are hashed with
 * WebCrypto PBKDF2-SHA256 and never stored in plain text. Login switches between local profiles,
 * logout returns to guest. v1 replaces this with server auth behind the same hooks.
 */
import { DataError } from '../errors';
import type { Locale } from '../types';
import { getKV, withLock } from './kv';
import { newId } from './ids';

export type PasswordHash = { algo: 'PBKDF2-SHA256'; iterations: number; salt: string; hash: string };

/** A sign-in provider linked to the account (v1: auth_identities). */
export type Identity = { provider: 'google'; subject: string };

export type LocalAccount = {
  id: string;
  email: string;
  display_name: string;
  lang: Locale;
  created_at: string;
  /** Absent on accounts created with Google */
  password?: PasswordHash;
  identities?: Identity[];
  avatar_url?: string | null;
};

export type PublicAccount = Omit<LocalAccount, 'password'>;
export type Session = { profile_id: string | null };

const ACCOUNTS = 'global:accounts';
const SESSION = 'global:session';
export const PBKDF2_ITERATIONS = 150_000;
export const MIN_PASSWORD = 8;

const b64 = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s);
};
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new DataError('auth.insecure_context', 'Accounts need HTTPS (WebCrypto is unavailable)', 400);
  return s;
}

export async function hashPassword(password: string, saltB64?: string, iterations = PBKDF2_ITERATIONS): Promise<PasswordHash> {
  const salt = saltB64 ? unb64(saltB64) : globalThis.crypto.getRandomValues(new Uint8Array(16));
  const material = await subtle().importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle().deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, material, 256);
  return { algo: 'PBKDF2-SHA256', iterations, salt: b64(salt), hash: b64(bits) };
}

export async function verifyPassword(password: string, rec: PasswordHash): Promise<boolean> {
  const again = await hashPassword(password, rec.salt, rec.iterations);
  // constant-time-ish compare
  let diff = again.hash.length ^ rec.hash.length;
  for (let i = 0; i < Math.min(again.hash.length, rec.hash.length); i++) diff |= again.hash.charCodeAt(i) ^ rec.hash.charCodeAt(i);
  return diff === 0;
}

const normEmail = (e: string) => e.trim().toLowerCase();
const isEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const toPublic = (a: LocalAccount): PublicAccount => ({
  id: a.id,
  email: a.email,
  display_name: a.display_name,
  lang: a.lang,
  created_at: a.created_at,
  identities: a.identities ?? [],
  avatar_url: a.avatar_url ?? null,
});

export async function listAccounts(): Promise<PublicAccount[]> {
  const all = (await (await getKV()).get<LocalAccount[]>(ACCOUNTS)) ?? [];
  return all.map(toPublic);
}

export async function getAccount(id: string): Promise<PublicAccount | null> {
  return (await listAccounts()).find((a) => a.id === id) ?? null;
}

export async function registerAccount(input: { display_name: string; email: string; password: string; lang: Locale }): Promise<PublicAccount> {
  const email = normEmail(input.email);
  const display_name = input.display_name.trim();
  if (!display_name) throw new DataError('auth.name_required', 'Enter your name', 400);
  if (!isEmail(email)) throw new DataError('auth.invalid_email', 'Enter a valid email', 400);
  if (input.password.length < MIN_PASSWORD) throw new DataError('auth.weak_password', `Use at least ${MIN_PASSWORD} characters`, 400);
  const password = await hashPassword(input.password);
  return withLock(ACCOUNTS, async () => {
    const kv = await getKV();
    const all = (await kv.get<LocalAccount[]>(ACCOUNTS)) ?? [];
    if (all.some((a) => a.email === email)) throw new DataError('auth.email_taken', 'An account with this email already exists on this device', 409);
    const acc: LocalAccount = { id: newId('p'), email, display_name, lang: input.lang, created_at: new Date().toISOString(), password };
    await kv.set(ACCOUNTS, [...all, acc]);
    return toPublic(acc);
  });
}

export async function loginAccount(emailIn: string, password: string): Promise<PublicAccount> {
  const email = normEmail(emailIn);
  const all = (await (await getKV()).get<LocalAccount[]>(ACCOUNTS)) ?? [];
  const acc = all.find((a) => a.email === email);
  if (acc && !acc.password) throw new DataError('auth.use_google', 'This account signs in with Google', 401);
  if (!acc?.password || !(await verifyPassword(password, acc.password))) {
    throw new DataError('auth.invalid_credentials', 'Email or password is wrong', 401);
  }
  return toPublic(acc);
}

/**
 * Sign in with a Google identity the server verified: the account already linked to this Google
 * subject, else the account with the same (Google-verified) email, which gets linked, else a new
 * account without a password.
 */
export async function signInWithGoogle(g: { subject: string; email: string; display_name: string; avatar_url: string | null; lang: Locale }): Promise<{ account: PublicAccount; created: boolean }> {
  const email = normEmail(g.email);
  if (!g.subject || !isEmail(email)) throw new DataError('auth.google_failed', 'Google did not return a usable identity', 400);
  const google: Identity = { provider: 'google', subject: g.subject };
  return withLock(ACCOUNTS, async () => {
    const kv = await getKV();
    const all = (await kv.get<LocalAccount[]>(ACCOUNTS)) ?? [];
    const linked = all.find((a) => a.identities?.some((i) => i.provider === 'google' && i.subject === g.subject));
    if (linked) return { account: toPublic(linked), created: false };
    const same = all.find((a) => a.email === email);
    if (same) {
      const next: LocalAccount = { ...same, identities: [...(same.identities ?? []), google], avatar_url: same.avatar_url ?? g.avatar_url };
      await kv.set(ACCOUNTS, all.map((a) => (a.id === same.id ? next : a)));
      return { account: toPublic(next), created: false };
    }
    const acc: LocalAccount = {
      id: newId('p'),
      email,
      display_name: g.display_name.trim() || email.split('@')[0],
      lang: g.lang,
      created_at: new Date().toISOString(),
      identities: [google],
      avatar_url: g.avatar_url,
    };
    await kv.set(ACCOUNTS, [...all, acc]);
    return { account: toPublic(acc), created: true };
  });
}

export async function updateAccount(id: string, patch: Partial<Pick<LocalAccount, 'display_name' | 'lang'>>): Promise<void> {
  await withLock(ACCOUNTS, async () => {
    const kv = await getKV();
    const all = (await kv.get<LocalAccount[]>(ACCOUNTS)) ?? [];
    await kv.set(ACCOUNTS, all.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  });
}

export async function readSession(): Promise<Session> {
  return (await (await getKV()).get<Session>(SESSION)) ?? { profile_id: null };
}

export async function writeSession(s: Session): Promise<void> {
  await (await getKV()).set(SESSION, s);
}
