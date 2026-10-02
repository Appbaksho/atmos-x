import { router } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, View } from 'react-native';

import { Card, CzButton, Field, GhostButton, I, Note, Screen, ScreenHeader, Seg, Txt } from '@/components/cz/ui';
import { B } from '@/constants/cz';
import { useAuth } from '@/context/auth';
import { useCz } from '@/context/prefs';
import { goBack } from '@/lib/cz/routes';

/** Account: sign in / create account (Supabase). Everything except points, clans and leaderboards works without it. */
export default function AuthScreen() {
  const { signIn, signUp, signOut, configured, session, profile } = useAuth();
  const { c } = useCz();
  const [mode, setMode] = useState<'in' | 'up'>('up');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ field?: 'name' | 'email' | 'password'; msg: string } | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async () => {
    setInfo(null);
    if (mode === 'up' && name.trim().length < 2) return setErr({ field: 'name', msg: 'Tell your team what to call you (2+ letters).' });
    if (!email.includes('@')) return setErr({ field: 'email', msg: 'Enter a valid email, like you@example.com.' });
    if (password.length < 6) return setErr({ field: 'password', msg: 'Use at least 6 characters.' });
    setErr(null);
    setBusy(true);
    try {
      if (mode === 'in') {
        await signIn(email, password);
        goBack();
      } else {
        const { needsConfirm } = await signUp(email, password, name);
        if (needsConfirm) {
          setInfo('We sent you a confirmation link. Confirm your email, then sign in.');
          setMode('in');
        } else goBack();
      }
    } catch (e: any) {
      setErr({ msg: `${e?.message ?? 'Something went wrong'}. Check your details and try again.` });
    } finally {
      setBusy(false);
    }
  };

  if (!configured) {
    return (
      <Screen>
        <ScreenHeader title="Account" sub="Sign in to earn points" />
        <Card gap={8}>
          <Txt size={15} w={600}>
            Backend not connected
          </Txt>
          <Txt size={13} dim>
            Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY to .env.local, run the SQL in supabase/migrations, then restart Expo. Heat, air and farmer screens work without an account.
          </Txt>
        </Card>
      </Screen>
    );
  }

  if (session) {
    return (
      <Screen>
        <ScreenHeader title="Account" sub={profile?.display_name ?? session.user.email ?? ''} />
        <Card gap={8}>
          <Txt size={15} w={600}>
            You’re signed in
          </Txt>
          <Txt size={13} dim>
            {session.user.email}
          </Txt>
        </Card>
        <View style={{ height: 12 }} />
        <GhostButton
          label="Sign out"
          onPress={async () => {
            await signOut();
            goBack();
          }}
        />
      </Screen>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <ScreenHeader title={mode === 'up' ? 'Join the cool-down' : 'Welcome back'} sub="Log trees, team up and climb the board" />
        <Seg
          tone="card"
          height={40}
          value={mode}
          onChange={(m) => {
            setMode(m);
            setErr(null);
          }}
          options={[
            { label: 'Create account', value: 'up' },
            { label: 'Sign in', value: 'in' },
          ]}
        />
        <Card gap={14}>
          {mode === 'up' ? (
            <View style={{ gap: 6 }}>
              <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. Nadia" autoCapitalize="words" autoComplete="name" textContentType="name" />
              {err?.field === 'name' ? <FieldError msg={err.msg} /> : null}
            </View>
          ) : null}
          <View style={{ gap: 6 }}>
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
            />
            {err?.field === 'email' ? <FieldError msg={err.msg} /> : null}
          </View>
          <View style={{ gap: 6 }}>
            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="At least 6 characters"
              secureTextEntry
              autoComplete={mode === 'up' ? 'new-password' : 'password'}
              textContentType={mode === 'up' ? 'newPassword' : 'password'}
            />
            {err?.field === 'password' ? <FieldError msg={err.msg} /> : null}
          </View>
        </Card>
        {err && !err.field ? <Note tone="danger" icon={I.warn}>{err.msg}</Note> : null}
        {info ? <Note icon={I.checkSm}>{info}</Note> : null}
        {busy ? (
          <View style={{ height: 56, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={c.leaf} />
          </View>
        ) : (
          <CzButton label={mode === 'up' ? 'Create account' : 'Sign in'} icon="check" onPress={submit} />
        )}
        <Txt size={11.5} dim center>
          Your location is only saved when you log an action.
        </Txt>
        <GhostButton label="Not now" onPress={() => (router.canGoBack() ? router.back() : goBack())} height={46} />
      </Screen>
    </KeyboardAvoidingView>
  );
}

function FieldError({ msg }: { msg: string }) {
  return (
    <Txt size={12} color={B.red} accessibilityRole="text">
      {msg}
    </Txt>
  );
}
