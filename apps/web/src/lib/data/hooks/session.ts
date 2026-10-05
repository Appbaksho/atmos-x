'use client';
/** Session, local accounts (§4.5) and Presentation mode (§5.5). */
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { setPrefs } from '@/lib/prefs-store';

import { DataError } from '../errors';
import { googleCodeClient, loadGoogleIdentity, type GoogleCodeClient, type GoogleCodeResult } from '../google';
import { listAccounts, loginAccount, readSession, registerAccount, signInWithGoogle, writeSession, type PublicAccount } from '../local/accounts';
import { currentContext, refreshDataContext, type DataContext } from '../local/context';
import { resetDemo } from '../local/demo';
import { COLL, readValue, writeValue } from '../local/store';
import { DEMO_NAMESPACE } from '../seed';
import { V0_ROUTES, type GoogleAuthConfig, type GoogleIdentity, type Locale, type User } from '../types';
import { useDataContext } from './context';
import { getJSON, request, shouldRetry } from './http';
import { qk } from './keys';

export function userFromContext(ctx: DataContext): User {
  return {
    id: ctx.userId,
    role: ctx.kind === 'guest' ? 'guest' : 'user',
    email: ctx.email,
    display_name: ctx.displayName,
    avatar_url: null,
    created_at: ctx.createdAt ?? new Date(0).toISOString(),
  };
}

export type SessionState = {
  /** false until prefs + session are read on the client */
  ready: boolean;
  user: User;
  isGuest: boolean;
  presentation: boolean;
  /** storage namespace: `user:<id>`, `demo` or `guest` */
  ns: string;
};

export function useSession(): SessionState {
  const ctx = useDataContext();
  return { ready: ctx.ready, user: userFromContext(ctx), isGuest: ctx.kind === 'guest', presentation: ctx.presentation, ns: ctx.ns };
}

/** The current user (role 'guest' when signed out; Nadia in Presentation mode). */
export function useMe(): User {
  return userFromContext(useDataContext());
}

/** Local profiles on this device (for the login switcher). */
export function useAccounts() {
  return useQuery<PublicAccount[]>({ queryKey: qk.accounts(), queryFn: listAccounts });
}

export type RegisterInput = { display_name: string; email: string; password: string; lang: Locale };

/**
 * register / login / logout / continueAsGuest / upgrade. All switch the namespace and refresh the
 * data context. `upgrade` = register from guest: device prefs are kept as they are, and today's
 * guest Ask usage carries over.
 */
async function afterSessionChange(qc: QueryClient): Promise<DataContext> {
  const ctx = await refreshDataContext();
  await qc.invalidateQueries({ queryKey: qk.accounts() });
  await qc.invalidateQueries({ queryKey: qk.local(ctx.ns) });
  return ctx;
}

export function useAuth() {
  const qc = useQueryClient();
  const after = () => afterSessionChange(qc);

  const register = useMutation<User, Error, RegisterInput>({
    mutationFn: async (input) => {
      const acc = await registerAccount(input);
      await writeSession({ profile_id: acc.id });
      return userFromContext(await after());
    },
  });

  const upgrade = useMutation<User, Error, RegisterInput>({
    mutationFn: async (input) => {
      const before = await currentContext();
      const usage = before.kind === 'guest' ? await readValue(before.ns, COLL.askUsage) : undefined;
      const acc = await registerAccount(input);
      if (usage) await writeValue(`user:${acc.id}`, COLL.askUsage, usage);
      await writeSession({ profile_id: acc.id });
      return userFromContext(await after());
    },
  });

  const login = useMutation<User, Error, { email: string; password: string }>({
    mutationFn: async ({ email, password }) => {
      const acc = await loginAccount(email, password);
      await writeSession({ profile_id: acc.id });
      return userFromContext(await after());
    },
  });

  const logout = useMutation<void, Error, void>({
    mutationFn: async () => {
      await writeSession({ profile_id: null });
      await after();
    },
  });

  const continueAsGuest = useMutation<void, Error, void>({
    mutationFn: async () => {
      const s = await readSession();
      if (s.profile_id) await writeSession({ profile_id: null });
      await after();
    },
  });

  return { register, login, logout, continueAsGuest, upgrade };
}

export type GoogleSignInResult = { user: User; created: boolean };

/**
 * "Continue with Google". Google's popup returns a one-time code, POST /api/v0/auth/google trades it
 * for the verified identity, and the account is created or reused on this device (matched by
 * Google subject, then email). From guest, today's Ask usage carries over, as in `upgrade`.
 * `available` is false until the server has GOOGLE_OAUTH_CLIENT_ID + _SECRET; `start()` must run
 * straight from the click so the popup is not blocked.
 */
export function useGoogleSignIn(opts: { lang: Locale; onSuccess: (r: GoogleSignInResult) => void; onError: (e: DataError) => void }) {
  const qc = useQueryClient();
  const handlers = useRef(opts);
  useEffect(() => {
    handlers.current = opts;
  });
  const config = useQuery<GoogleAuthConfig>({
    queryKey: qk.googleAuth(),
    queryFn: ({ signal }) => getJSON<GoogleAuthConfig>(V0_ROUTES.googleAuth.path, undefined, signal),
    staleTime: Infinity,
    retry: shouldRetry,
  });
  const clientId = config.data?.enabled ? config.data.client_id : null;

  const exchange = useMutation<GoogleSignInResult, Error, string>({
    mutationFn: async (code) => {
      const res = await request(V0_ROUTES.googleAuthExchange.path, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json', 'X-Requested-With': 'XmlHttpRequest' },
        body: JSON.stringify({ code }),
      });
      const id = (await res.json()) as GoogleIdentity;
      const before = await currentContext();
      const usage = before.kind === 'guest' ? await readValue(before.ns, COLL.askUsage) : undefined;
      const { account, created } = await signInWithGoogle({ ...id, lang: handlers.current.lang });
      if (created && usage) await writeValue(`user:${account.id}`, COLL.askUsage, usage);
      await writeSession({ profile_id: account.id });
      return { user: userFromContext(await afterSessionChange(qc)), created };
    },
  });

  const { mutate: exchangeCode } = exchange;
  const onResult = useCallback(
    (r: GoogleCodeResult) => {
      if ('code' in r) {
        exchangeCode(r.code, {
          onSuccess: (out) => handlers.current.onSuccess(out),
          onError: (e) => handlers.current.onError(e instanceof DataError ? e : new DataError('auth.google_failed', e.message, 0)),
        });
      } else if ('error' in r) handlers.current.onError(new DataError(r.error, 'Google sign-in did not finish', 0));
    },
    [exchangeCode],
  );

  const client = useRef<GoogleCodeClient | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!clientId) return;
    let alive = true;
    loadGoogleIdentity()
      .then(() => {
        if (!alive) return;
        client.current = googleCodeClient(clientId, onResult);
        setReady(true);
      })
      .catch(() => alive && setReady(false));
    return () => {
      alive = false;
    };
  }, [clientId, onResult]);

  const start = useCallback(() => {
    if (!client.current) return handlers.current.onError(new DataError('auth.google_unavailable', 'Google sign-in is not ready', 0));
    client.current.requestCode();
  }, []);

  return { available: !!clientId, ready: ready && !!clientId, configLoading: config.isPending, isPending: exchange.isPending, start };
}

/**
 * Presentation mode. enable() loads Nadia's story into the "demo" namespace on first use; the
 * caller pins the focus location to DEMO_POINT. disable() returns to the user's own data (kept in
 * its own namespace). reset() reloads the story from scratch.
 * Setting prefs.presentation directly (prefs context, ?demo=1) has the same effect.
 */
export function usePresentation() {
  const ctx = useDataContext();
  const qc = useQueryClient();
  const enable = useMutation<void, Error, void>({ mutationFn: async () => void (await setPrefs({ presentation: true })) });
  const disable = useMutation<void, Error, void>({ mutationFn: async () => void (await setPrefs({ presentation: false })) });
  const reset = useMutation<void, Error, void>({
    mutationFn: async () => {
      await resetDemo();
      await qc.resetQueries({ queryKey: qk.local(DEMO_NAMESPACE) });
    },
  });
  return { enabled: ctx.presentation, ready: ctx.ready, enable, disable, reset };
}
