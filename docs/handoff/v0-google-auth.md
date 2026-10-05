# v0 handoff: "Continue with Google"

Status: **built and tested against a mock Google; the real popup still needs a Google OAuth client.** Without `GOOGLE_OAUTH_CLIENT_ID` + `GOOGLE_OAUTH_CLIENT_SECRET` the button stays disabled ("coming soon"), exactly as before.

## How it works
1. `/auth/login` and `/auth/register` call `useGoogleSignIn()` (`lib/data/hooks/session.ts`). It reads `GET /api/v0/auth/google` (`{ enabled, client_id }`) and preloads Google Identity Services (`lib/data/google.ts`), so the popup opens straight from the click and isn't blocked.
2. The GIS **code client** (popup, scopes `openid email profile`) returns a one-time code.
3. `POST /api/v0/auth/google` (`server/auth/google.ts`) checks `X-Requested-With: XmlHttpRequest` (Google's CSRF guidance for popup mode), then exchanges the code at Google's token endpoint with the server-only secret. It tries `redirect_uri=postmessage` first, then the page origin on `redirect_uri_mismatch`.
4. The server checks the ID token claims: `aud` = our client id, `iss` is Google, `exp`, and a verified email. The token comes straight from Google over TLS, so per OIDC §3.1.3.7 no signature check is needed. Nothing is stored server-side.
5. The client calls `signInWithGoogle()` (`lib/data/local/accounts.ts`). It reuses the account linked to that Google `sub`, else links the account with the same email, else creates a passwordless account. Guest Ask usage carries over, as in `upgrade`. Accounts now carry `identities: [{ provider: 'google', subject }]` and `avatar_url`, the same shape as v1's `auth_identities`.
6. Email login to a Google-only account returns `auth.use_google`.

## Setup
DEV-CHECKLIST §1.6. Every origin the app is opened from must be an **Authorized JavaScript origin**; a quick tunnel's URL changes every run. `GOOGLE_OAUTH_TOKEN_URL` is a test-only override (mock token server).

## Errors (auth namespace, all 10 locales)
`err.auth.{use_google, google_failed, google_popup_blocked, google_unverified, google_not_configured, google_unavailable}`, plus `googleBusy` and `googleNote`. Closing the popup is silent.

## Tests
- `server/auth/google.test.ts`: claim checks, the exchange request, the redirect_uri fallback, error mapping.
- `local/accounts.test.ts`: create, reuse, link by email, `use_google`.

## Known gaps
- Not run against real Google yet (no client id). The first real run should confirm the `postmessage` exchange; the origin fallback covers the other case.
- The account is still per device (v0). Signing in with Google on a second device creates a separate local profile there.
- Linking by email trusts the device: someone who registered a password account with your email on the same device would get linked. That's acceptable for v0's device-only accounts; v1 should require the password to link.
