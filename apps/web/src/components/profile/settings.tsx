'use client';
/** S22 · Settings: language ×10, °C/°F, area units, theme, farmer mode, Ask on/off, radius, Presentation mode + reset, account, data sources. */
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import {
  B,
  BottomSheet,
  Card,
  CzButton,
  CzSlider,
  GhostButton,
  I,
  Icon,
  ListRow,
  Note,
  R,
  Screen,
  ScreenHeader,
  Seg,
  Tap,
  Txt,
  View,
  go,
  href,
  requireAccount,
  toast,
  useCz,
  type SegOption,
} from '@/components/cz';
import { LOCALE_NAMES } from '@/i18n/routing';
import { GUEST_MAX_RADIUS_M, useAuth, useMe, usePresentation, usePushConfig, usePushState, useSession, useTogglePush } from '@/lib/data/hooks';
import { LOCALES, type Locale } from '@/lib/data/types';
import { initials } from '@/lib/format';

/** One segmented setting. */
function SegRow<V extends string | boolean>({ label, note, options, value, onChange, last }: { label: string; note?: string; options: SegOption<V>[]; value: V; onChange: (v: V) => void; last?: boolean }) {
  const { c } = useCz();
  return (
    <View style={{ gap: 8, paddingVertical: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.line }}>
      <Txt size={13.5} w={600}>
        {label}
      </Txt>
      <Seg options={options} value={value} onChange={onChange} label={label} />
      {note ? (
        <Txt size={11.5} dim>
          {note}
        </Txt>
      ) : null}
    </View>
  );
}

/** Visual switch (the whole row is the control). */
export function SwitchVisual({ on }: { on: boolean }) {
  const { c, f } = useCz();
  return (
    <span aria-hidden className="cz-view" style={{ width: 50, height: 30, borderRadius: 15, backgroundColor: on ? B.lime : c.soft, padding: 3, flexShrink: 0, transition: 'background-color 0.2s' }}>
      <span
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          backgroundColor: B.white,
          boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
          transform: `translateX(${on ? (f.rtl ? -20 : 20) : 0}px)`,
          transition: 'transform 0.2s',
        }}
      />
    </span>
  );
}

export function SettingsScreen() {
  const t = useTranslations('profile.settings');
  const { c, f, prefs, setPref, setLang, lang } = useCz();
  const session = useSession();
  const maxRadius = session.isGuest ? GUEST_MAX_RADIUS_M : 1000;
  const [radius, setRadius] = useState<number | null>(null);
  const r = Math.min(radius ?? prefs.radius_m, maxRadius);

  return (
    <Screen>
      <ScreenHeader title={t('title')} sub={t('liveNote')} />

      {/* Language */}
      <Card gap={10}>
        <Txt size={13.5} w={600} as="h2">
          {t('lang')}
        </Txt>
        <View role="radiogroup" label={t('lang')} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {LOCALES.map((l: Locale) => {
            const on = lang === l;
            return (
              <Tap
                key={l}
                role="radio"
                selected={on}
                label={LOCALE_NAMES[l]}
                haptic
                onPress={() => setLang(l)}
                style={{ minHeight: 40, paddingHorizontal: 14, borderRadius: R.pill, backgroundColor: on ? B.lime : c.soft, justifyContent: 'center' }}>
                <span lang={l} dir="auto">
                  <Txt size={13} w={600} color={on ? B.limeInk : c.ink}>
                    {LOCALE_NAMES[l]}
                  </Txt>
                </span>
              </Tap>
            );
          })}
        </View>
      </Card>

      <Card pad={0} gap={0} style={{ paddingVertical: 6, paddingHorizontal: 16 }}>
        <SegRow
          label={t('units')}
          options={[
            { label: t('unitC'), value: 'C' },
            { label: t('unitF'), value: 'F' },
          ]}
          value={prefs.unit}
          onChange={(v) => setPref('unit', v)}
        />
        <SegRow
          label={t('area')}
          options={[
            { label: t('metric'), value: 'metric' },
            { label: t('imperial'), value: 'imperial' },
          ]}
          value={prefs.area}
          onChange={(v) => setPref('area', v)}
        />
        <SegRow
          label={t('theme')}
          options={[
            { label: t('light'), value: 'light' },
            { label: t('dark'), value: 'dark' },
            { label: t('system'), value: 'system' },
          ]}
          value={prefs.theme}
          onChange={(v) => setPref('theme', v)}
        />
        <SegRow
          label={t('mode')}
          note={t('farmerNote')}
          options={[
            { label: t('city'), value: false },
            { label: t('farmer'), value: true },
          ]}
          value={!!prefs.farmer_mode}
          onChange={(v) => {
            if (v === !!prefs.farmer_mode) return;
            setPref('farmer_mode', v);
            go('S04');
          }}
        />
        <SegRow
          last
          label={t('askL')}
          note={t('askNote')}
          options={[
            { label: t('askShow'), value: true },
            { label: t('askHide'), value: false },
          ]}
          value={prefs.ask_on !== false}
          onChange={(v) => setPref('ask_on', v)}
        />
      </Card>

      {/* Radius */}
      <Card gap={8}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <Txt size={13.5} w={600} as="h2">
            {t('radius')}
          </Txt>
          <Txt size={15} w={600} num>
            {f.dist(r)}
          </Txt>
        </View>
        <CzSlider
          label={t('radius')}
          min={100}
          max={maxRadius}
          step={50}
          value={r}
          valueText={f.dist(r)}
          onChange={setRadius}
          onSlidingComplete={(v) => {
            setPref('radius_m', v);
            setRadius(null);
          }}
        />
        <Txt size={11.5} dim>
          {session.isGuest ? t('radiusGuest', { max: f.dist(GUEST_MAX_RADIUS_M) }) : t('radiusNote')}
        </Txt>
      </Card>

      <PushCard />
      <PresentationCard />
      <AccountCard />

      <View style={{ gap: 8 }}>
        <Txt label as="h2" style={{ paddingHorizontal: 4, paddingTop: 4 }}>
          {t('more')}
        </Txt>
        <Card pad={0} gap={0} style={{ paddingVertical: 4, paddingHorizontal: 16 }}>
          <ListRow label={t('data')} last href={href('about')}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.soft, alignItems: 'center', justifyContent: 'center' }}>
              <Icon d={I.sat} size={18} sw={1.7} />
            </View>
            <Txt size={13.5} w={500} style={{ flex: 1, minWidth: 0 }}>
              {t('data')}
            </Txt>
            <Icon d={f.fwdPath} size={16} sw={2} color={c.ink2} />
          </ListRow>
        </Card>
      </View>

      <Txt size={11} dim center style={{ lineHeight: '18px', paddingVertical: 4, paddingHorizontal: 12 }}>
        {t('footer')}
      </Txt>
    </Screen>
  );
}

/** W2 · Web push: on/off for this browser, with the quiet hours. Disabled when the server has no keys. */
function PushCard() {
  const t = useTranslations('profile.settings.push');
  const { f } = useCz();
  const session = useSession();
  const config = usePushConfig();
  const state = usePushState(config.data);
  const toggle = useTogglePush(config.data);
  const s = state.data;
  const on = s === 'on';
  const usable = s === 'on' || s === 'off';
  const hour = (h: number) => f.time(new Date(2000, 0, 1, h, 0));
  const press = () => {
    if (session.isGuest) return requireAccount(t('feature'));
    toggle.mutate(!on, {
      onSuccess: (r) => toast(r === 'on' ? t('turnedOn') : t('turnedOff'), { tone: 'success' }),
      onError: (e) => toast(t.has(`err.${(e as { code?: string }).code ?? ''}`) ? t(`err.${(e as { code?: string }).code}`) : t('err.generic'), { tone: 'warn' }),
    });
  };
  const note = s === 'unsupported' ? t('unsupported') : s === 'disabled' ? t('disabled') : s === 'denied' ? t('denied') : t('quiet', { from: hour(config.data?.quiet_hours.from ?? 22), to: hour(config.data?.quiet_hours.to ?? 7) });
  return (
    <Card gap={10}>
      <Tap
        role="switch"
        selected={on}
        label={t('title')}
        disabled={!usable || toggle.isPending || state.isPending}
        onPress={press}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, textAlign: 'start', opacity: usable || state.isPending ? 1 : 0.6 }}>
        <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: B.navy, alignItems: 'center', justifyContent: 'center' }}>
          <Icon d={I.bell} size={18} sw={2} color={B.lime} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Txt size={13.5} w={600}>
            {t('title')}
          </Txt>
          <Txt size={11.5} dim>
            {on ? t('on') : t('off')}
          </Txt>
        </View>
        <SwitchVisual on={on} />
      </Tap>
      <Txt size={11.5} dim>
        {note}
      </Txt>
    </Card>
  );
}

function PresentationCard() {
  const t = useTranslations('profile.settings');
  const tc = useTranslations('common');
  const p = usePresentation();
  const [confirm, setConfirm] = useState(false);
  const on = p.enabled;
  return (
    <Card gap={10}>
      <Tap
        role="switch"
        selected={on}
        label={t('presentation')}
        disabled={!p.ready || p.enable.isPending || p.disable.isPending}
        onPress={() => (on ? p.disable.mutate() : p.enable.mutate())}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, textAlign: 'start' }}>
        <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: B.navy, alignItems: 'center', justifyContent: 'center' }}>
          <Icon d={I.sparkleOne} size={18} sw={2} color={B.lime} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Txt size={13.5} w={600}>
            {t('presentation')}
          </Txt>
          <Txt size={11.5} dim>
            {on ? t('presentationOn') : t('presentationOff')}
          </Txt>
        </View>
        <SwitchVisual on={on} />
      </Tap>
      <Txt size={11.5} dim>
        {t('presentationNote')}
      </Txt>
      {on ? <GhostButton label={t('reset')} height={44} onPress={() => setConfirm(true)} /> : null}
      <BottomSheet
        open={confirm}
        onClose={() => setConfirm(false)}
        title={t('resetTitle')}
        footer={
          <View style={{ gap: 8 }}>
            <CzButton
              label={t('reset')}
              variant="navy"
              busy={p.reset.isPending}
              onPress={() =>
                p.reset.mutate(undefined, {
                  onSuccess: () => {
                    setConfirm(false);
                    toast(t('resetDone'), { tone: 'success' });
                  },
                })
              }
            />
            <GhostButton label={tc('cancel')} height={46} onPress={() => setConfirm(false)} />
          </View>
        }>
        <Txt size={13.5} dim>
          {t('resetBody')}
        </Txt>
      </BottomSheet>
    </Card>
  );
}

function AccountCard() {
  const t = useTranslations('profile.settings');
  const { c } = useCz();
  const session = useSession();
  const me = useMe();
  const { logout } = useAuth();
  const next = href('S22');
  return (
    <View style={{ gap: 8 }}>
      <Txt label as="h2" style={{ paddingHorizontal: 4, paddingTop: 4 }}>
        {t('account')}
      </Txt>
      <Card gap={12}>
        {session.isGuest ? (
          <>
            <Txt size={14} w={600}>
              {t('guest')}
            </Txt>
            <Txt size={12.5} dim>
              {t('guestNote')}
            </Txt>
            <CzButton label={t('create')} icon="check" size="md" href={href('register', undefined, { next })} />
            <GhostButton label={t('signIn')} height={44} href={href('login', undefined, { next })} />
          </>
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.limeSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Txt size={15} w={700}>
                  {initials(me.display_name)}
                </Txt>
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                <Txt size={14} w={600} lines={1}>
                  {me.display_name}
                </Txt>
                <Txt size={12} dim lines={1}>
                  {me.email ?? t('signedIn')}
                </Txt>
              </View>
            </View>
            {session.presentation ? (
              <Note icon={I.info}>{t('demoAccount')}</Note>
            ) : (
              <GhostButton
                label={t('logout')}
                height={44}
                color={B.red}
                disabled={logout.isPending}
                onPress={() => logout.mutate(undefined, { onSuccess: () => toast(t('loggedOut')) })}
              />
            )}
          </>
        )}
      </Card>
    </View>
  );
}
