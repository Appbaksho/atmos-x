'use client';
/** Session, local accounts (§4.5) and Presentation mode (§5.5). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { setPrefs } from '@/lib/prefs-store';

import { listAccounts, loginAccount, readSession, registerAccount, writeSession, type PublicAccount } from '../local/accounts';
import { currentContext, refreshDataContext, type DataContext } from '../local/context';
import { resetDemo } from '../local/demo';
import { COLL, readValue, writeValue } from '../local/store';
import { DEMO_NAMESPACE } from '../seed';
import type { Locale, User } from '../types';
import { useDataContext } from './context';
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
export function useAuth() {
  const qc = useQueryClient();
  const after = async () => {
    const ctx = await refreshDataContext();
    await qc.invalidateQueries({ queryKey: qk.accounts() });
    await qc.invalidateQueries({ queryKey: qk.local(ctx.ns) });
    return ctx;
  };

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
