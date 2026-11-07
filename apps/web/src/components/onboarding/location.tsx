'use client';
/**
 * S03 · Location & radius, step 2 of 2 (port of screens/onboarding/location.tsx): a real map with
 * the scan circle, place search (GET /api/v0/geo/search, static fallback) or GPS, the radius slider,
 * then the first scan. The progress steps advance while useZones really runs; finishing sets
 * prefs.onboarded and goes to Home.
 */
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { useDebounced } from '@/components/cz/hooks';
import { B, R } from '@/components/cz/tokens';
import { Bar, CzButton, I, Icon, IconBtn, LightStatusBar, Note, Spinner, Tap, Txt, View } from '@/components/cz/ui';
import { H3_RES, ringCount } from '@/components/map/geo';
import { MapAttribution, MapView } from '@/components/map/map-view-lazy';
import { RadiusControl, useRadiusLabel } from '@/components/map/radius-control';
import { clampRadius, useScan } from '@/components/map/use-scan';
import { useSession } from '@/lib/data/hooks';
import type { Place } from '@/lib/data/types';
import { useLocation } from '@/lib/location';
import { useCz } from '@/lib/prefs';
import { goBack, goReplace } from '@/lib/routes';

export function SearchBox() {
  const t = useTranslations('onboarding.location');
  const { search, setFocus, pinned } = useLocation();
  const { fw } = useCz();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [found, setFound] = useState<{ q: string; list: Place[] }>({ q: '', list: [] });
  const dq = useDebounced(q, 300);
  const active = dq.trim().length >= 2;
  const busy = active && found.q !== dq;
  const results = active && found.q === dq ? found.list : [];

  useEffect(() => {
    if (dq.trim().length < 2) return;
    const ctl = new AbortController();
    search(dq, ctl.signal).then((list) => {
      if (!ctl.signal.aborted) setFound({ q: dq, list });
    });
    return () => ctl.abort();
  }, [dq, search]);

  const pick = (p: Place) => {
    setFocus(p.location, [p.name, p.admin].filter(Boolean).join(', '));
    setQ('');
    setOpen(false);
  };

  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <View style={{ height: 48, borderRadius: R.pill, borderWidth: 1, borderColor: B.glassLine, backgroundColor: 'rgba(0,24,46,0.45)', flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 }}>
        <Icon d={I.search} size={18} color={B.white} />
        <input
          type="search"
          value={q}
          disabled={pinned}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={t('search')}
          aria-label={t('searchLabel')}
          role="combobox"
          aria-expanded={open && results.length > 0}
          aria-controls="cz-place-results"
          aria-autocomplete="list"
          style={{ flex: 1, minWidth: 0, height: '100%', background: 'transparent', border: 0, outline: 'none', color: B.white, fontSize: 14, ...fw(400) }}
          className="cz-search-input"
        />
        {busy ? <Spinner size={16} color={B.lime} /> : null}
      </View>
      {open && active && !busy ? (
        <ul
          id="cz-place-results"
          role="listbox"
          style={{ position: 'absolute', top: 54, insetInline: 0, margin: 0, padding: 6, listStyle: 'none', borderRadius: 20, backgroundColor: 'rgba(0,24,46,0.92)', border: `1px solid ${B.glassLine}`, zIndex: 5, maxHeight: 280, overflowY: 'auto' }}>
          {results.length ? (
            results.map((p, i) => (
              <li key={`${p.name}-${i}`} role="option" aria-selected={false}>
                <Tap label={[p.name, p.admin, p.country].filter(Boolean).join(', ')} onPress={() => pick(p)} style={{ minHeight: 44, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, justifyContent: 'center', textAlign: 'start' }}>
                  <Txt size={14} w={600} color={B.white}>
                    {p.name}
                  </Txt>
                  <Txt size={11.5} color="rgba(255,255,255,0.7)">
                    {[p.admin, p.country].filter(Boolean).join(', ')}
                  </Txt>
                </Tap>
              </li>
            ))
          ) : (
            <li style={{ padding: 12 }}>
              <Txt size={13} color="rgba(255,255,255,0.8)">
                {t('noResults')}
              </Txt>
            </li>
          )}
        </ul>
      ) : null}
    </View>
  );
}

export function LocationScreen() {
  const { c, f, prefs, setPref, setPrefs } = useCz();
  const t = useTranslations('onboarding.location');
  const rl = useRadiusLabel();
  const tc = useTranslations('common');
  const loc = useLocation();
  const session = useSession();
  const [drag, setR] = useState<number | null>(null);
  const radius = clampRadius(drag ?? prefs.radius_m, session.isGuest);
  const [step, setStep] = useState(-1);
  const [slow, setSlow] = useState(false);
  const scan = useScan(radius, step >= 0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // Hex count from the scan once it answers (H4); the ring formula until then.
  const n = scan.data?.scan.cell_count ?? ringCount(radius);
  const res = H3_RES;
  const place = loc.placeName ?? tc('location.finding');
  const coords = `${f.loc(Math.abs(loc.focus.lat).toFixed(4))}° ${loc.focus.lat >= 0 ? 'N' : 'S'}, ${f.loc(Math.abs(loc.focus.lng).toFixed(4))}° ${loc.focus.lng >= 0 ? 'E' : 'W'}`;

  const finish = () => {
    // Navigate only once `onboarded` is set, or the onboarding gate bounces /app back to S01.
    void setPrefs({ onboarded: true, radius_m: radius }).then(() => goReplace('S04'));
  };

  // Steps 0–2 advance on a timer; the last one waits for the real scan (max ~14 s, then the map finishes it).
  useEffect(() => {
    if (step < 3) return;
    if (scan.data || scan.error) {
      const id = setTimeout(finish, 500);
      return () => clearTimeout(id);
    }
    const id = setTimeout(() => setSlow(true), 9000);
    const id2 = setTimeout(finish, 14000);
    return () => {
      clearTimeout(id);
      clearTimeout(id2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- finish is stable enough for this flow
  }, [step, scan.data, scan.error]);

  const start = () => {
    setPref('radius_m', radius);
    setStep(0);
    [700, 1400, 2100].forEach((ms, i) => timers.current.push(setTimeout(() => setStep(i + 1), ms)));
  };

  const steps: [string, string][] = [
    [t('s1t'), t('s1d', { n: f.num(n), res: f.loc(res) })],
    [t('s2t'), t('s2d')],
    [t('s3t'), t('s3d')],
    [t('s4t'), t('s4d')],
  ];
  const note = loc.pinned ? t('demoPinned') : loc.device && !loc.custom ? t('using') : t('picked');

  return (
    <main id="main" className="cz-view" style={{ minHeight: '100dvh', backgroundColor: c.bg }}>
      <LightStatusBar />
      <View style={{ flex: 1, minHeight: 300, marginBottom: -30, position: 'relative' }}>
        <MapView
          label={t('mapA11y', { place })}
          center={loc.focus}
          radiusM={radius}
          me={loc.focus}
          scanning={step >= 0}
          hexes={step >= 3 ? scan.data?.hexes : null}
          zones={step >= 3 ? scan.data?.zones : null}
          animateKey={step >= 3 && scan.data ? scan.data.meta.generated_at : null}
          padding={{ top: 90, bottom: 60, left: 30, right: 30 }}
          style={{ position: 'absolute', inset: 0 }}
        />
        <div aria-hidden style={{ position: 'absolute', top: 0, insetInline: 0, height: 140, background: 'linear-gradient(to bottom, rgba(0,16,32,0.55), rgba(0,16,32,0))', pointerEvents: 'none' }} />
        <View style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 12px)', start: 16, end: 16, flexDirection: 'row', gap: 8, zIndex: 2 }}>
          <IconBtn d={f.backPath} label={t('back')} onPress={goBack} tone="glassDark" size={48} />
          <SearchBox />
        </View>
        <View style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 72px)', start: 0, end: 0, alignItems: 'center', pointerEvents: 'none' }}>
          <View style={{ backgroundColor: B.lime, paddingHorizontal: 10, paddingVertical: 4, borderRadius: R.pill }}>
            <Txt size={12} w={600} color={B.navy} num>
              {rl(radius)}
            </Txt>
          </View>
        </View>
        <MapAttribution style={{ position: 'absolute', bottom: 40, start: 10 }} />
      </View>

      <View style={{ borderTopStartRadius: 30, borderTopEndRadius: 30, paddingTop: 22, paddingHorizontal: 20, paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 28px)', gap: 16, backgroundColor: c.card, zIndex: 3, width: '100%', maxWidth: 640, marginInline: 'auto' }}>
        {step < 0 ? (
          <>
            <View style={{ gap: 4 }}>
              <Txt display size={18} as="h1">
                {t('title')}
              </Txt>
              <Txt size={13.5} dim>
                {place} · {coords}
              </Txt>
            </View>
            <Note icon={I.checkSm}>
              <Txt size={13} style={{ lineHeight: 18 }}>
                {loc.error ? tc(`location.${loc.error === 'denied' ? 'denied' : 'unavailable'}`) : note}
              </Txt>
            </Note>
            <RadiusControl value={radius} onChange={setR} guest={session.isGuest} sub={t('cells', { n: f.num(n), r: rl(radius) })} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 2 }}>
              {!loc.pinned ? (
                <Tap label={t('useLoc')} onPress={() => void loc.refresh().then((p) => p && loc.setFocus(p))} disabled={loc.loading} style={{ height: 54, paddingHorizontal: 18, borderRadius: R.pill, borderWidth: 1, borderColor: c.line, backgroundColor: c.card, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {loc.loading ? <Spinner size="small" color={c.ink} /> : <Icon d={I.target} size={18} />}
                  <Txt size={14} w={600}>
                    {t('useLoc')}
                  </Txt>
                </Tap>
              ) : null}
              <CzButton label={t('scan', { r: rl(radius) })} icon="compass" onPress={start} style={{ flexGrow: 1, minWidth: 150, height: 54 }} />
            </View>
            <Txt size={11.5} dim center style={{ lineHeight: 17 }}>
              {t('privacy')}
            </Txt>
            {!loc.pinned ? (
              <Tap
                role="link"
                label={t('demo')}
                onPress={() => void setPrefs({ presentation: true, onboarded: true }).then(() => goReplace('S04'))}
                style={{ alignSelf: 'center', minHeight: 36, justifyContent: 'center' }}>
                <Txt size={13} w={600} color={c.leaf}>
                  {t('demo')}
                </Txt>
              </Tap>
            ) : null}
          </>
        ) : (
          <View style={{ gap: 16 }} aria-live="polite">
            <Txt display size={18} as="h1">
              {t('scanning', { n: f.num(n) })}
            </Txt>
            <Bar pct={Math.min(100, (step + 1) * 25)} />
            {steps.map(([title, d], i) => {
              const done = i < step || (i === 3 && !!scan.data);
              const cur = i === step && !done;
              return (
                <View key={title} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? B.lime : c.soft }}>
                    {done ? <Icon d={I.check} size={14} color={B.navy} sw={3} /> : cur ? <span style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.ink }} /> : null}
                  </View>
                  <View style={{ flex: 1, gap: 1 }}>
                    <Txt size={14} w={600} style={{ opacity: i <= step ? 1 : 0.5 }}>
                      {title}
                    </Txt>
                    <Txt size={12} dim>
                      {d}
                    </Txt>
                  </View>
                </View>
              );
            })}
            {slow ? (
              <Txt size={12} dim>
                {t('slow')}
              </Txt>
            ) : null}
          </View>
        )}
      </View>
    </main>
  );
}
