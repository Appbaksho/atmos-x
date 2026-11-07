'use client';
/** Session and sign-in against the API (prompt-v1 §6.2): email, phone OTP, Google, guest, demo. */
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { api, ApiFieldError, call } from '@/lib/api/client';
import { setPrefs } from '@/lib/prefs-store';

import { DataError } from '../errors';
import { googleCodeClient, loadGoogleIdentity, type GoogleCodeClient, type GoogleCodeResult } from '../google';
import { adoptSession, refreshDataContext, type DataContext, type Me } from '../local/context';
import type { Locale, User } from '../types';
import { useDataContext } from './context';
import { shouldRetry } from './http';
import { qk } from './keys';

export function userFromContext(ctx: DataContext): User {
  return {
    id: ctx.userId,
    role: ctx.kind === 'guest' ? 'guest' : ctx.role === 'admin' ? 'admin' : 'user',
    email: ctx.email,
    display_name: ctx.displayName,
    avatar_url: ctx.avatarUrl,
    created_at: ctx.createdAt ?? new Date(0).toISOString(),
  };
}

export type SessionState = {
  /** false until prefs + session are read on the client */
  ready: boolean;
  user: User;
  isGuest: boolean;
  presentation: boolean;
  /** query-key namespace: `user:<id>` */
  ns: string;
  role: DataContext['role'];
  offline: boolean;
};

export function useSession(): SessionState {
  const ctx = useDataContext();
  return {
    ready: ctx.ready,
    user: userFromContext(ctx),
    isGuest: ctx.kind === 'guest',
    presentation: ctx.presentation,
    ns: ctx.ns,
    role: ctx.role,
    offline: ctx.offline,
  };
}

/** The current user (role 'guest' when not signed up; Nadia in Presentation mode). */
export function useMe(): User {
  return userFromContext(useDataContext());
}

/** V0 listed local device profiles; accounts now live on the server. Kept for screen compatibility. */
export function useAccounts() {
  return useQuery<{ id: string; email: string; display_name: string }[]>({ queryKey: qk.accounts(), queryFn: async () => [] });
}

export type RegisterInput = { display_name: string; email: string; password: string; lang: Locale };

async function afterSession(qc: QueryClient, user?: Me): Promise<User> {
  const ctx = user ? await adoptSession(user) : await refreshDataContext();
  await qc.invalidateQueries({ queryKey: qk.all });
  return userFromContext(ctx);
}

/**
 * register / login / logout / continueAsGuest / upgrade. Registering from a guest session upgrades
 * that guest in place on the server, so drafts and settings carry over.
 */
export function useAuth() {
  const qc = useQueryClient();

  const register = useMutation<User, Error, RegisterInput>({
    mutationFn: async (input) => {
      const r = await call(api.POST('/api/v1/auth/register', { body: input }));
      return afterSession(qc, r.user);
    },
  });

  const upgrade = register;

  const login = useMutation<User, Error, { email: string; password: string }>({
    mutationFn: async (body) => {
      const r = await call(api.POST('/api/v1/auth/login', { body }));
      return afterSession(qc, r.user);
    },
  });

  const logout = useMutation<void, Error, void>({
    mutationFn: async () => {
      await setPrefs({ presentation: false });
      await call(api.POST('/api/v1/auth/logout'));
      await afterSession(qc);
    },
  });

  const continueAsGuest = useMutation<void, Error, void>({
    mutationFn: async () => {
      // A visitor is already a server guest; nothing to do unless signed in.
      const ctx = await refreshDataContext();
      if (ctx.kind !== 'guest') {
        await call(api.POST('/api/v1/auth/logout'));
        await afterSession(qc);
      }
    },
  });

  return { register, login, logout, continueAsGuest, upgrade };
}

/** Phone sign-in: start() sends a 6-digit code, verify() signs in (creating the account if new). */
export function usePhoneSignIn() {
  const qc = useQueryClient();
  const start = useMutation<{ phone: string; expires_in: number; dev_console?: boolean }, Error, string>({
    mutationFn: (phone) => call(api.POST('/api/v1/auth/otp/start', { body: { phone } })),
  });
  const verify = useMutation<{ user: User; created: boolean }, Error, { phone: string; code: string; lang: Locale }>({
    mutationFn: async (body) => {
      const r = await call(api.POST('/api/v1/auth/otp/verify', { body }));
      return { user: await afterSession(qc, r.user), created: !!r.created };
    },
  });
  return { start, verify };
}

export type GoogleSignInResult = { user: User; created: boolean };

/**
 * "Continue with Google": the popup returns a one-time code and POST /auth/google trades it for a
 * session. If the email already has a password account, the server answers 409 with a link token;
 * `linkToken` is then set and `link(password)` finishes the sign-in. `start()` must run straight
 * from the click so the popup is not blocked.
 */
export function useGoogleSignIn(opts: { lang: Locale; onSuccess: (r: GoogleSignInResult) => void; onError: (e: DataError) => void }) {
  const qc = useQueryClient();
  const handlers = useRef(opts);
  useEffect(() => {
    handlers.current = opts;
  });
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const config = useQuery({
    queryKey: qk.googleAuth(),
    queryFn: () => call(api.GET('/api/v1/auth/google/config')),
    staleTime: Infinity,
    retry: shouldRetry,
  });
  const clientId = config.data?.enabled ? (config.data.client_id ?? null) : null;

  const exchange = useMutation<GoogleSignInResult, Error, string>({
    mutationFn: async (code) => {
      const r = await call(
        api.POST('/api/v1/auth/google', {
          body: { code, lang: handlers.current.lang },
          headers: { 'X-Requested-With': 'XmlHttpRequest' },
        }),
      );
      return { user: await afterSession(qc, r.user), created: !!r.created };
    },
  });

  const linkM = useMutation<GoogleSignInResult, Error, string>({
    mutationFn: async (password) => {
      const r = await call(api.POST('/api/v1/auth/google/link', { body: { link_token: linkToken ?? '', password } }));
      setLinkToken(null);
      return { user: await afterSession(qc, r.user), created: false };
    },
  });

  const { mutate: exchangeCode } = exchange;
  const onResult = useCallback(
    (r: GoogleCodeResult) => {
      if ('code' in r) {
        exchangeCode(r.code, {
          onSuccess: (out) => handlers.current.onSuccess(out),
          onError: (e) => {
            if (e instanceof ApiFieldError && e.code === 'auth.link_requires_password' && e.fields.link_token) {
              setLinkToken(e.fields.link_token);
              return;
            }
            handlers.current.onError(e instanceof DataError ? e : new DataError('auth.google_failed', e.message, 0));
          },
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

  const link = useCallback(
    (password: string) =>
      linkM.mutate(password, {
        onSuccess: (out) => handlers.current.onSuccess(out),
        onError: (e) => handlers.current.onError(e instanceof DataError ? e : new DataError('auth.google_failed', e.message, 0)),
      }),
    [linkM],
  );

  return {
    available: !!clientId,
    ready: ready && !!clientId,
    configLoading: config.isPending,
    isPending: exchange.isPending || linkM.isPending,
    start,
    linkToken,
    link,
    cancelLink: () => setLinkToken(null),
  };
}

/**
 * Presentation mode (prompt-v1 §8.4). enable() switches to a fresh server demo user cloned from
 * Nadia's story; disable() returns to the previous session. reset() starts a new demo user.
 */
export function usePresentation() {
  const ctx = useDataContext();
  const qc = useQueryClient();
  const enable = useMutation<void, Error, void>({ mutationFn: async () => void (await setPrefs({ presentation: true })) });
  const disable = useMutation<void, Error, void>({ mutationFn: async () => void (await setPrefs({ presentation: false })) });
  const reset = useMutation<void, Error, void>({
    mutationFn: async () => {
      const r = await call(api.POST('/api/v1/auth/demo', { body: { lang: ctx.lang } }));
      await afterSession(qc, r.user);
    },
  });
  return { enabled: ctx.presentation, ready: ctx.ready, enable, disable, reset };
}
