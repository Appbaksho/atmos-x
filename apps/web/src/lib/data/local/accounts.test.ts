import { beforeEach, describe, expect, it } from 'vitest';

import { hashPassword, listAccounts, loginAccount, registerAccount, signInWithGoogle, verifyPassword } from './accounts';
import { freshStore } from './test-helpers';

describe('local accounts', () => {
  beforeEach(freshStore);

  it('hashes with PBKDF2 and never stores the password', async () => {
    const h = await hashPassword('correct horse', undefined, 1000);
    expect(h.algo).toBe('PBKDF2-SHA256');
    expect(h.hash).not.toContain('correct');
    expect(await verifyPassword('correct horse', h)).toBe(true);
    expect(await verifyPassword('wrong horse', h)).toBe(false);
    const again = await hashPassword('correct horse', undefined, 1000);
    expect(again.salt).not.toBe(h.salt);
  });

  it('registers, rejects duplicates, logs in', async () => {
    const acc = await registerAccount({ display_name: 'Nadia', email: ' Nadia@Example.com ', password: 'longenough', lang: 'bn' });
    expect(acc).toMatchObject({ email: 'nadia@example.com', lang: 'bn' });
    expect(JSON.stringify(await listAccounts())).not.toContain('longenough');
    await expect(registerAccount({ display_name: 'X', email: 'nadia@example.com', password: 'longenough', lang: 'en' })).rejects.toMatchObject({ code: 'auth.email_taken' });
    await expect(registerAccount({ display_name: 'X', email: 'x@y.z', password: 'short', lang: 'en' })).rejects.toMatchObject({ code: 'auth.weak_password' });
    await expect(loginAccount('NADIA@example.com', 'longenough')).resolves.toMatchObject({ id: acc.id });
    await expect(loginAccount('nadia@example.com', 'nope-nope')).rejects.toMatchObject({ code: 'auth.invalid_credentials' });
  }, 20_000);

  const google = { subject: 'g-123', email: 'Rafi@Gmail.com', display_name: 'Rafi', avatar_url: null, lang: 'en' as const };

  it('Google: creates a passwordless account once, then reuses it by subject', async () => {
    const a = await signInWithGoogle(google);
    expect(a.created).toBe(true);
    expect(a.account).toMatchObject({ email: 'rafi@gmail.com', display_name: 'Rafi', identities: [{ provider: 'google', subject: 'g-123' }] });
    const b = await signInWithGoogle({ ...google, email: 'renamed@gmail.com', display_name: 'R' });
    expect(b).toMatchObject({ created: false, account: { id: a.account.id } });
    expect(await listAccounts()).toHaveLength(1);
    await expect(loginAccount('rafi@gmail.com', 'whatever-pass')).rejects.toMatchObject({ code: 'auth.use_google' });
  });

  it('Google: links to an existing local account with the same email', async () => {
    const acc = await registerAccount({ display_name: 'Nadia', email: 'nadia@example.com', password: 'longenough', lang: 'bn' });
    const r = await signInWithGoogle({ ...google, subject: 'g-999', email: 'NADIA@example.com' });
    expect(r).toMatchObject({ created: false, account: { id: acc.id, identities: [{ provider: 'google', subject: 'g-999' }] } });
    await expect(loginAccount('nadia@example.com', 'longenough')).resolves.toMatchObject({ id: acc.id });
  }, 20_000);
});
