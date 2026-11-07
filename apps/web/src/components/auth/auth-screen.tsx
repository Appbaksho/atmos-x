'use client';
/**
 * /auth/login and /auth/register (outside the app shell). Accounts live on the Atmos X server
 * (prompt-v1 §6.2): email + password, phone OTP and Google. Signing up from a guest session keeps
 * everything the guest did. "Continue with Google" is disabled ("coming soon") when the server has
 * no Google client; linking Google to an existing email account asks for that account's password.
 */
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Card, CzButton, Field, GhostButton, I, Icon, Note, R, Screen, ScreenHeader, Seg, Spinner, Tap, Txt, View, goBack, toast, useCz } from '@/components/cz';
import { useRouter } from '@/i18n/navigation';
import { DataError, useAuth, useGoogleSignIn, usePhoneSignIn, useSession } from '@/lib/data/hooks';
import type { Locale } from '@/lib/data/types';
import { href } from '@/lib/routes';

export type AuthMode = 'login' | 'register';

const EYE = 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z';
const EYE_OFF = `${EYE}M4 4l16 16`;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Only same-app, locale-less paths ("/app/…", "/join/…"). */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/api')) return href('S04');
  return next;
}

type Err = { field?: 'name' | 'email' | 'password'; msg: string } | null;

export function AuthScreen({ mode, next: rawNext }: { mode: AuthMode; next?: string | null }) {
  const t = useTranslations('auth');
  const { c, lang } = useCz();
  const router = useRouter();
  const session = useSession();
  const { register, upgrade, login, logout, continueAsGuest } = useAuth();
  const phoneSignIn = usePhoneSignIn();
  const next = safeNext(rawNext);
  const [byPhone, setByPhone] = useState(false);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState<{ phone: string; dev: boolean } | null>(null);
  const [linkPw, setLinkPw] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState<Err>(null);
  const up = mode === 'register';

  const errText = (e: unknown): Err => {
    if (e instanceof DataError && e.status === 0) return { msg: t('err.auth.offline') };
    if (e instanceof DataError && (e.status === 429 || e.code === 'rate_limited') && !t.has(`err.${e.code}`)) return { msg: t('err.auth.rate_limited') };
    if (e instanceof DataError && t.has(`err.${e.code}`)) {
      const field =
        e.code === 'auth.email_taken' || e.code === 'auth.invalid_email' || e.code === 'auth.email_invalid'
          ? 'email'
          : e.code === 'auth.weak_password' || e.code === 'auth.password_short'
            ? 'password'
            : e.code === 'auth.name_required'
              ? 'name'
              : undefined;
      return { field, msg: t(`err.${e.code}`) };
    }
    return { msg: t('err.generic') };
  };

  const done = (welcome: string) => {
    toast(welcome, { tone: 'success' });
    router.replace(next);
  };
  const google = useGoogleSignIn({
    lang: lang as Locale,
    onSuccess: ({ user, created }) => done(t(created ? 'welcome' : 'welcomeBack', { name: user.display_name })),
    onError: (e) => setErr(errText(e)),
  });
  const busy = register.isPending || upgrade.isPending || login.isPending || google.isPending || phoneSignIn.start.isPending || phoneSignIn.verify.isPending;

  const sendCode = (e?: React.FormEvent) => {
    e?.preventDefault();
    setErr(null);
    if (phone.replace(/\D/g, '').length < 8) return setErr({ msg: t('err.auth.phone_invalid') });
    phoneSignIn.start.mutate(phone.trim(), {
      onSuccess: (r) => {
        setSent({ phone: r.phone, dev: !!r.dev_console });
        setCode('');
      },
      onError: (e2) => setErr(errText(e2)),
    });
  };

  const verifyCode = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!sent) return;
    setErr(null);
    if (!/^\d{6}$/.test(code.trim())) return setErr({ msg: t('err.auth.otp_wrong') });
    phoneSignIn.verify.mutate(
      { phone: sent.phone, code: code.trim(), lang: lang as Locale },
      { onSuccess: ({ user, created }) => done(t(created ? 'welcome' : 'welcomeBack', { name: user.display_name })), onError: (e2) => setErr(errText(e2)) },
    );
  };

  const switchMode = (m: AuthMode) => {
    setErr(null);
    if (m !== mode) router.replace(href(m === 'register' ? 'register' : 'login', undefined, rawNext ? { next: rawNext } : undefined));
  };

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (up && name.trim().length < 2) return setErr({ field: 'name', msg: t('err.name') });
    if (!EMAIL_RE.test(email.trim())) return setErr({ field: 'email', msg: t('err.email') });
    if (password.length < 8) return setErr({ field: 'password', msg: t('err.password') });
    setErr(null);
    if (up) {
      const input = { display_name: name.trim(), email: email.trim(), password, lang: lang as Locale };
      const m = session.isGuest ? upgrade : register;
      m.mutate(input, { onSuccess: (u) => done(t('welcome', { name: u.display_name })), onError: (e2) => setErr(errText(e2)) });
    } else {
      login.mutate({ email: email.trim(), password }, { onSuccess: (u) => done(t('welcomeBack', { name: u.display_name })), onError: (e2) => setErr(errText(e2)) });
    }
  };

  const guest = () => continueAsGuest.mutate(undefined, { onSuccess: () => router.replace(next) });

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 4 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/atmosx-logo.png" alt="Atmos X" width={32} height={32} style={{ borderRadius: 9 }} />
      <Txt display size={15}>
        Atmos X
      </Txt>
    </View>
  );

  // Already signed in (a local account, or Nadia in Presentation mode)
  if (session.ready && !session.isGuest) {
    return (
      <Screen gap={16} style={{ paddingBottom: 40 }}>
        {header}
        <ScreenHeader title={t('signedInTitle')} sub={t('signedInAs', { name: session.user.display_name })} onBack={goBack} />
        {session.presentation ? <Note icon={I.info}>{t('presentationNote')}</Note> : null}
        <CzButton label={t('continue')} icon="arrow" onPress={() => router.replace(next)} />
        {!session.presentation ? (
          <GhostButton label={t('switch')} height={46} disabled={logout.isPending} onPress={() => logout.mutate()} />
        ) : null}
      </Screen>
    );
  }

  return (
    <Screen gap={16} style={{ paddingBottom: 40 }}>
      {header}
      <ScreenHeader title={up ? t('titleUp') : t('titleIn')} sub={t('sub')} onBack={goBack} />
      <Seg<AuthMode>
        tone="card"
        height={40}
        label={t('modeLabel')}
        value={mode}
        onChange={switchMode}
        options={[
          { label: t('create'), value: 'register' },
          { label: t('signIn'), value: 'login' },
        ]}
      />

      {google.linkToken ? (
        <Card gap={12}>
          <Txt w={700} size={15}>
            {t('linkTitle')}
          </Txt>
          <Txt size={13} dim>
            {t('linkBody')}
          </Txt>
          <Field label={t('password')} value={linkPw} onChangeText={setLinkPw} secureTextEntry autoComplete="current-password" />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <CzButton label={t('linkButton')} icon="check" busy={google.isPending} onPress={() => google.link(linkPw)} />
            <GhostButton label={t('notNow')} height={46} onPress={google.cancelLink} />
          </View>
        </Card>
      ) : null}

      {byPhone ? (
        <form onSubmit={sent ? verifyCode : sendCode} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card gap={14}>
            <Field
              label={t('phone')}
              value={phone}
              onChangeText={(v) => {
                setPhone(v);
                setSent(null);
              }}
              placeholder={t('phonePh')}
              type="tel"
              keyboardType="phone-pad"
              autoComplete="tel"
            />
            {sent ? (
              <Field
                label={t('code')}
                value={code}
                onChangeText={setCode}
                placeholder={t('codePh')}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                inputMode="numeric"
              />
            ) : null}
          </Card>
          {sent ? (
            <Txt size={12} dim center>
              {t('codeSent', { phone: sent.phone })}
              {sent.dev ? ` ${t('devCode')}` : ''}
            </Txt>
          ) : null}
          {err ? (
            <Note tone="danger" icon={I.warn}>
              {err.msg}
            </Note>
          ) : null}
          <CzButton label={busy ? t('submitting') : sent ? t('verify') : t('sendCode')} icon="check" type="submit" busy={busy} />
          <GhostButton label={t('useEmail')} height={44} onPress={() => (setByPhone(false), setErr(null))} />
        </form>
      ) : (
            <form onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Card gap={14}>
          {up ? (
            <Field
              label={t('name')}
              value={name}
              onChangeText={setName}
              placeholder={t('namePh')}
              autoCapitalize="words"
              autoComplete="name"
              error={err?.field === 'name' ? err.msg : null}
            />
          ) : null}
          <Field
            label={t('email')}
            value={email}
            onChangeText={setEmail}
            placeholder={t('emailPh')}
            autoCapitalize="none"
            keyboardType="email-address"
            type="email"
            autoComplete={up ? 'email' : 'username'}
            spellCheck={false}
            error={err?.field === 'email' ? err.msg : null}
          />
          <View>
            <Field
              label={t('password')}
              value={password}
              onChangeText={setPassword}
              placeholder={t('passwordPh')}
              secureTextEntry={!show}
              autoComplete={up ? 'new-password' : 'current-password'}
              error={err?.field === 'password' ? err.msg : null}
              style={{ paddingInlineEnd: 52 }}
            />
            <Tap
              label={show ? t('hidePassword') : t('showPassword')}
              onPress={() => setShow((s) => !s)}
              style={{ position: 'absolute', end: 3, top: 26, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Icon d={show ? EYE_OFF : EYE} size={18} sw={2} color={c.ink2} />
            </Tap>
          </View>
        </Card>
        {err && !err.field ? (
          <Note tone="danger" icon={I.warn}>
            {err.msg}
          </Note>
        ) : null}
        <CzButton label={busy ? t('submitting') : up ? t('create') : t('signIn')} icon="check" type="submit" busy={busy} />
      </form>
      )}

      <Txt size={11.5} dim center>
        {up ? `${t('deviceNote')} ${session.isGuest ? t('carryNote') : ''}` : t('deviceNote')}
      </Txt>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: c.line }} />
        <Txt size={12} dim>
          {t('or')}
        </Txt>
        <View style={{ flex: 1, height: 1, backgroundColor: c.line }} />
      </View>

      <Tap
        label={google.available || google.configLoading ? t('google') : `${t('google')} (${t('soon')})`}
        disabled={!google.ready || busy}
        haptic
        onPress={() => {
          setErr(null);
          google.start();
        }}
        style={{ height: 52, borderRadius: R.pill, borderWidth: 1.5, borderColor: c.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: google.ready ? 1 : 0.6 }}>
        {google.isPending ? <Spinner /> : <GoogleG />}
        <Txt size={14} w={600}>
          {google.isPending ? t('googleBusy') : t('google')}
        </Txt>
        {!google.available && !google.configLoading ? (
          <View style={{ height: 22, paddingHorizontal: 8, borderRadius: R.pill, backgroundColor: c.soft, justifyContent: 'center' }}>
            <Txt size={10.5} w={700} dim>
              {t('soon')}
            </Txt>
          </View>
        ) : null}
      </Tap>
      {google.available ? (
        <Txt size={11.5} dim center>
          {t('googleNote')}
        </Txt>
      ) : null}

      {!byPhone ? <GhostButton label={t('usePhone')} height={46} onPress={() => (setByPhone(true), setErr(null))} /> : null}
      <GhostButton label={t('guest')} height={46} onPress={guest} disabled={continueAsGuest.isPending} />
      <Txt size={11.5} dim center>
        {t('locationNote')}
      </Txt>
    </Screen>
  );
}

function GoogleG() {
  return (
    <svg width={18} height={18} viewBox="0 0 48 48" aria-hidden focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.8 6C12.4 13.7 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z" />
      <path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.8-6z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.2-8.5 2.2-6.3 0-11.6-4.2-13.5-9.9l-7.8 6C6.6 42.6 14.6 48 24 48z" />
    </svg>
  );
}
