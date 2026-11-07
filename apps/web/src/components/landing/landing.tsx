'use client';
/**
 * W1 · Landing page at `/` (prompt-v1 §6.13): hero with "Open the app" and "Install app", the
 * problem, how it works, the NASA data in use (live from GET /sources), features, science notes,
 * credits and attributions. Server-rendered with the sources the page fetched; refreshed on the client.
 */
import { useLocale, useTranslations } from 'next-intl';

import { B, CzButton, GhostButton, I, Icon, LightStatusBar, R, Tap, Txt, View, toast, useCz, useInstall } from '@/components/cz';
import { CREDIT, PHOTO } from '@/components/home/photos';
import { LOCALE_NAMES, routing } from '@/i18n/routing';
import { useSources } from '@/lib/data/hooks';
import type { Locale, SourceEntry, SourcesInfo } from '@/lib/data/types';
import { href } from '@/lib/routes';

const WRAP = { width: '100%', maxWidth: 1120, marginInline: 'auto', paddingInline: 20 } as const;
const STEPS = [
  { key: 'scan', icon: I.search },
  { key: 'understand', icon: I.sun },
  { key: 'plan', icon: I.plan },
  { key: 'act', icon: I.tree },
  { key: 'track', icon: I.trend },
] as const;
const FEATURES = [
  { key: 'map', icon: I.map },
  { key: 'plan', icon: I.target },
  { key: 'trees', icon: I.tree },
  { key: 'community', icon: I.community },
  { key: 'store', icon: I.sparkleOne },
  { key: 'farm', icon: I.drop },
  { key: 'ask', icon: I.sparkle },
  { key: 'air', icon: I.wind },
] as const;
const PROBLEMS = ['concrete', 'nights', 'shade'] as const;

function Section({ id, title, sub, children, tone = 'bg' }: { id: string; title: string; sub?: string; children: React.ReactNode; tone?: 'bg' | 'card' | 'navy' }) {
  const { c } = useCz();
  const bg = tone === 'navy' ? B.navy : tone === 'card' ? c.card : c.bg;
  const ink = tone === 'navy' ? B.white : undefined;
  return (
    <section id={id} aria-labelledby={`${id}-h`} style={{ backgroundColor: bg, paddingBlock: 56 }}>
      <View style={[WRAP, { gap: 24 }]}>
        <View style={{ gap: 8, maxWidth: 720 }}>
          <Txt display size={26} as="h2" id={`${id}-h`} color={ink}>
            {title}
          </Txt>
          {sub ? (
            <Txt size={15} color={ink} dim={!ink} style={ink ? { opacity: 0.85 } : undefined}>
              {sub}
            </Txt>
          ) : null}
        </View>
        {children}
      </View>
    </section>
  );
}

const grid = (min: number) => ({ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(min(${min}px, 100%), 1fr))`, gap: 14 }) as const;

export function Landing({ initial }: { initial: SourcesInfo | null }) {
  const t = useTranslations('landing');
  const ti = useTranslations('common.install');
  const { c, f } = useCz();
  const locale = useLocale() as Locale;
  const ins = useInstall();
  const q = useSources(initial);
  const info = q.data ?? null;
  const nasa = (info?.sources ?? []).filter((s) => s.nasa && s.status === 'active');
  const others = (info?.sources ?? []).filter((s) => !s.nasa && s.status === 'active' && s.kind !== 'derived');
  const credits = (info?.sources ?? []).map((s) => s.credit).filter((x): x is string => !!x);

  return (
    <main id="main" className="cz-view" style={{ backgroundColor: c.bg, minHeight: '100dvh' }}>
      <LightStatusBar />
      {/* ── hero ── */}
      <header style={{ position: 'relative', backgroundColor: B.navy, overflow: 'hidden' }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- decorative, credited in the footer */}
        <img src={PHOTO.neighborhood(1600, 1000)} alt="" aria-hidden fetchPriority="high" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.38 }} />
        <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,24,46,0.55) 0%, rgba(0,24,46,0.85) 70%, #00182E 100%)' }} />
        <View style={[WRAP, { position: 'relative', paddingTop: 'calc(env(safe-area-inset-top, 0px) + 18px)', paddingBottom: 64, gap: 40 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/atmosx-logo.png" alt="Atmos X" width={1415} height={397} style={{ width: 150, height: 'auto' }} />
            <Tap role="link" label={t('open')} href={href('S04')} style={{ minHeight: 40, paddingInline: 16, borderRadius: R.pill, backgroundColor: B.lime, justifyContent: 'center' }}>
              <Txt size={13} w={600} color={B.limeInk}>
                {t('open')}
              </Txt>
            </Tap>
          </View>
          <View style={{ gap: 16, maxWidth: 680 }}>
            <Txt size={12.5} w={600} color={B.lime} style={{ letterSpacing: 0.6, textTransform: 'uppercase' }}>
              {t('eyebrow')}
            </Txt>
            <Txt display size={38} as="h1" color={B.white} style={{ fontSize: 'clamp(24px, 7vw, 44px)', lineHeight: '1.15' }}>
              {t('title')}
            </Txt>
            <Txt size={17} color={B.white} style={{ opacity: 0.9, lineHeight: '1.5' }} as="p">
              {t('sub')}
            </Txt>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            <CzButton label={t('open')} href={href('S04')} icon="arrow" style={{ minWidth: 220 }} />
            {ins.standalone ? null : (
              <GhostButton
                label={t('install')}
                color={B.white}
                style={{ minWidth: 200, borderColor: 'rgba(255,255,255,0.35)' }}
                onPress={() => {
                  if (ins.canPrompt) void ins.prompt();
                  else toast(ti('iosHint'));
                }}
              />
            )}
            <Tap role="link" label={t('demo')} href={href('S04', undefined, { demo: 1 })} style={{ minHeight: 52, justifyContent: 'center', paddingInline: 8 }}>
              <Txt size={14} w={600} color={B.white} style={{ textDecoration: 'underline', textUnderlineOffset: 4 }}>
                {t('demo')}
              </Txt>
            </Tap>
          </View>
          {info ? (
            <Txt size={13} color={B.white} style={{ opacity: 0.8 }}>
              {t('nasaCount', { n: f.loc(info.active_nasa_count) })}
            </Txt>
          ) : null}
        </View>
      </header>

      {/* ── the problem ── */}
      <Section id="problem" title={t('problem.title')} sub={t('problem.sub')}>
        <View style={grid(240)}>
          {PROBLEMS.map((k) => (
            <View key={k} style={{ backgroundColor: c.card, borderRadius: R.xl, padding: 20, gap: 8 }}>
              <Txt size={16} w={600} as="h3">
                {t(`problem.${k}.title`)}
              </Txt>
              <Txt size={14} dim>
                {t(`problem.${k}.body`)}
              </Txt>
            </View>
          ))}
        </View>
      </Section>

      {/* ── how it works ── */}
      <Section id="how" title={t('how.title')} tone="card">
        <ol style={{ ...grid(180), listStyle: 'none', padding: 0, margin: 0 }}>
          {STEPS.map((s, i) => (
            <li key={s.key} className="cz-view" style={{ gap: 10, padding: 16, borderRadius: R.xl, backgroundColor: c.soft }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: B.navy, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon d={s.icon} size={18} sw={1.8} color={B.lime} />
                </View>
                <Txt size={12} w={600} dim>
                  {f.loc(i + 1)}
                </Txt>
              </View>
              <Txt size={15.5} w={600} as="h3">
                {t(`how.${s.key}.title`)}
              </Txt>
              <Txt size={13.5} dim>
                {t(`how.${s.key}.body`)}
              </Txt>
            </li>
          ))}
        </ol>
      </Section>

      {/* ── NASA data in use (live) ── */}
      <Section id="data" title={t('data.title')} sub={info ? t('data.sub', { n: f.loc(info.active_nasa_count) }) : t('data.subNone')} tone="navy">
        {nasa.length ? (
          <View style={grid(260)}>
            {nasa.map((s) => (
              <SourceCard key={s.id} s={s} />
            ))}
          </View>
        ) : (
          <Txt size={14} color={B.white} style={{ opacity: 0.85 }}>
            {t('data.unavailable')}
          </Txt>
        )}
        {others.length ? (
          <View style={{ gap: 8 }}>
            <Txt size={13} w={600} color={B.white}>
              {t('data.others')}
            </Txt>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {others.map((s) => (
                <span key={s.id} style={{ fontSize: 12, color: B.white, border: '1px solid rgba(255,255,255,0.3)', borderRadius: 999, padding: '5px 10px' }}>
                  {s.name}
                </span>
              ))}
            </View>
          </View>
        ) : null}
      </Section>

      {/* ── features ── */}
      <Section id="features" title={t('features.title')}>
        <View style={grid(230)}>
          {FEATURES.map((x) => (
            <View key={x.key} style={{ backgroundColor: c.card, borderRadius: R.xl, padding: 18, gap: 8 }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.limeSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Icon d={x.icon} size={20} sw={1.8} />
              </View>
              <Txt size={15} w={600} as="h3">
                {t(`features.${x.key}.title`)}
              </Txt>
              <Txt size={13.5} dim>
                {t(`features.${x.key}.body`)}
              </Txt>
            </View>
          ))}
        </View>
      </Section>

      {/* ── science notes ── */}
      <Section id="science" title={t('science.title')} tone="card">
        <View style={grid(300)}>
          <View style={{ gap: 8, padding: 18, borderRadius: R.xl, backgroundColor: c.soft }}>
            <Txt size={15} w={600} as="h3">
              {t('science.scoreTitle')}
            </Txt>
            <Txt size={13.5} dim>
              {t('science.scoreBody')}
            </Txt>
            {info ? (
              <code dir="ltr" style={{ fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap', color: c.ink, background: c.card, borderRadius: 10, padding: 10 }}>
                {`${info.heat_score.text}\n${info.heat_score.f}`}
              </code>
            ) : null}
          </View>
          <View style={{ gap: 8, padding: 18, borderRadius: R.xl, backgroundColor: c.soft }}>
            <Txt size={15} w={600} as="h3">
              {t('science.fitTitle')}
            </Txt>
            <Txt size={13.5} dim>
              {info?.driver_fit ? t('science.fitBody', { r2: f.dec(info.driver_fit.r2, 2), n: f.num(info.driver_fit.n) }) : t('science.fitNone')}
            </Txt>
          </View>
          <View style={{ gap: 8, padding: 18, borderRadius: R.xl, backgroundColor: c.soft }}>
            <Txt size={15} w={600} as="h3">
              {t('science.honestTitle')}
            </Txt>
            <Txt size={13.5} dim>
              {t('science.honestBody')}
            </Txt>
          </View>
        </View>
      </Section>

      {/* ── credit + footer ── */}
      <footer style={{ backgroundColor: B.navy, paddingBlock: 40 }}>
        <View style={[WRAP, { gap: 20 }]}>
          <Txt size={15} w={600} color={B.white}>
            {t('credit')}
          </Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <CzButton label={t('open')} href={href('S04')} icon="arrow" size="md" />
            <GhostButton label={t('about')} href={href('about')} color={B.white} height={46} style={{ paddingInline: 18, borderColor: 'rgba(255,255,255,0.35)' }} />
          </View>
          <nav aria-label={t('languages')}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
              {routing.locales.map((l) => (
                <a key={l} href={l === routing.defaultLocale ? '/' : `/${l}`} hrefLang={l} lang={l} aria-current={l === locale ? 'page' : undefined} style={{ fontSize: 12.5, color: l === locale ? B.lime : 'rgba(255,255,255,0.8)', padding: '6px 8px', minHeight: 32 }}>
                  {LOCALE_NAMES[l]}
                </a>
              ))}
            </View>
          </nav>
          <View style={{ gap: 6 }}>
            <Txt size={12} w={600} color={B.white}>
              {t('attributions')}
            </Txt>
            <Txt size={11.5} color="rgba(255,255,255,0.7)">
              {[...new Set(credits), t('osm'), CREDIT.neighborhood].join(' · ')}
            </Txt>
          </View>
        </View>
      </footer>
    </main>
  );
}

function SourceCard({ s }: { s: SourceEntry }) {
  const t = useTranslations('landing');
  const { f } = useCz();
  const date = s.latest_data && /^\d{4}-\d{2}-\d{2}/.test(s.latest_data) ? f.date(s.latest_data.slice(0, 10), { day: 'numeric', month: 'short', year: 'numeric' }) : s.latest_data;
  return (
    <View style={{ gap: 6, padding: 16, borderRadius: R.xl, backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)' }}>
      <Txt size={14} w={600} color={B.white}>
        {s.name}
      </Txt>
      <Txt size={12.5} color="rgba(255,255,255,0.8)">
        {t.has(`use.${s.id}`) ? t(`use.${s.id}`) : s.used_for}
      </Txt>
      <Txt size={11.5} color={B.lime}>
        {[t(`kind.${s.kind}`), s.resolution_m ? t('resolution', { m: f.num(s.resolution_m) }) : null, date ? t('latest', { date }) : null].filter(Boolean).join(' · ')}
      </Txt>
    </View>
  );
}
