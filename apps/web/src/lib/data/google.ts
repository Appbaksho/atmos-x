/**
 * Google Identity Services (GIS) code client for "Continue with Google". Browser only.
 * The script is loaded ahead of the click, because requestCode() opens a popup and browsers only
 * allow that straight from a user gesture.
 */
import { DataError } from './errors';

const GIS_SRC = 'https://accounts.google.com/gsi/client';

type CodeResponse = { code?: string; error?: string; error_description?: string };
type NonOAuthError = { type: 'popup_failed_to_open' | 'popup_closed' | 'unknown'; message?: string };
export type GoogleCodeClient = { requestCode: () => void };
type CodeClientConfig = {
  client_id: string;
  scope: string;
  ux_mode: 'popup';
  select_account?: boolean;
  callback: (r: CodeResponse) => void;
  error_callback?: (e: NonOAuthError) => void;
};

declare global {
  interface Window {
    google?: { accounts?: { oauth2?: { initCodeClient: (cfg: CodeClientConfig) => GoogleCodeClient } } };
  }
}

/** What the popup returned: a code, nothing (closed), or an error code for DataError. */
export type GoogleCodeResult = { code: string } | { closed: true } | { error: string };

let loading: Promise<void> | null = null;

export function loadGoogleIdentity(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new DataError('auth.google_unavailable', 'Google sign-in runs in the browser', 0));
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = GIS_SRC;
    s.async = true;
    s.onload = () => (window.google?.accounts?.oauth2 ? resolve() : reject(new DataError('auth.google_unavailable', 'Google sign-in did not load', 0)));
    s.onerror = () => {
      loading = null;
      s.remove();
      reject(new DataError('auth.google_unavailable', 'Google sign-in could not load', 0));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/** Needs loadGoogleIdentity() first. Asks only for the basic identity (name, email, picture). */
export function googleCodeClient(clientId: string, onResult: (r: GoogleCodeResult) => void): GoogleCodeClient {
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) throw new DataError('auth.google_unavailable', 'Google sign-in is not loaded', 0);
  return oauth2.initCodeClient({
    client_id: clientId,
    scope: 'openid email profile',
    ux_mode: 'popup',
    select_account: true,
    callback: (r) => onResult(r.code ? { code: r.code } : r.error === 'access_denied' ? { closed: true } : { error: 'auth.google_failed' }),
    error_callback: (e) => onResult(e.type === 'popup_closed' ? { closed: true } : { error: e.type === 'popup_failed_to_open' ? 'auth.google_popup_blocked' : 'auth.google_failed' }),
  });
}
