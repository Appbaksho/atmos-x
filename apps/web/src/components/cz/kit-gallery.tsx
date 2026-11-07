'use client';
/**
 * /dev/kit: every kit component in light/dark × LTR/RTL (four scoped panels side by side), plus
 * global controls for sheets, toasts and the account gate. Dev-only page: demo strings are
 * intentionally inline (not user-facing).
 */
import { useTranslations } from 'next-intl';
import React, { useState } from 'react';

import { LOCALE_NAMES } from '@/i18n/routing';
import { LOCALES, type Meta } from '@/lib/data/types';
import { CzScope, useCz } from '@/lib/prefs';
import { href } from '@/lib/routes';

import { requireAccount } from './account';
import { I } from './icons';
import { BottomSheet, Drawer } from './sheet';
import { EmptyState, ErrorState, Skeleton, SkeletonCard, SkeletonText, SourceChips } from './states';
import { toast } from './toast';
import { AQI_COLORS, AQI_FG, AVATARS, B, HEAT_RISK, heatColor, heatFg, type HeatRiskKey } from './tokens';
import {
  Avatar,
  Bar,
  Card,
  Check,
  CzButton,
  CzSlider,
  Divider,
  Field,
  FilterChip,
  GhostButton,
  GlassPill,
  HeatBadge,
  HScroll,
  Icon,
  IconBtn,
  Label,
  ListRow,
  Note,
  OptionRow,
  Photo,
  PillButton,
  RadioDot,
  Ring,
  ScreenHeader,
  SectionTitle,
  Seg,
  Spinner,
  StatTile,
  Stepper,
  Tag,
  Tap,
  Txt,
  View,
} from './ui';

const PHOTO = 'https://images.unsplash.com/photo-1688881577496-ed998541f3e4?auto=format&fit=crop&w=800&h=500&q=70';
const META_LIVE: Meta = { live: true, generated_at: '2026-10-05T08:00:00Z', sources: [{ id: 'open-meteo', name: 'Open-Meteo', url: 'https://open-meteo.com' }, { id: 'osm', name: 'OpenStreetMap', url: 'https://www.openstreetmap.org/copyright' }] };
const META_CACHED: Meta = { live: false, generated_at: '2026-10-04T06:30:00Z', sources: [{ id: 'openai', name: 'OpenAI' }, { id: 'seed', name: 'Seed' }] };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      <SectionTitle title={title} />
      {children}
    </View>
  );
}

function Row({ children, wrap = true, gap = 8 }: { children: React.ReactNode; wrap?: boolean; gap?: number }) {
  return <View style={{ flexDirection: 'row', flexWrap: wrap ? 'wrap' : 'nowrap', alignItems: 'center', gap }}>{children}</View>;
}

function KitBody() {
  const { c, f } = useCz();
  const [seg, setSeg] = useState<'day' | 'night'>('day');
  const [chip, setChip] = useState(true);
  const [slider, setSlider] = useState(500);
  const [count, setCount] = useState(12);
  const [opt, setOpt] = useState('a');
  const [checked, setChecked] = useState(true);
  const [text, setText] = useState('');

  return (
    <View style={{ gap: 22, padding: 16 }}>
      <ScreenHeader title="Screen header" sub="Subtitle · Mohammadpur" right={<IconBtn d={I.bell} label="Notifications" badge />} />
      <ScreenHeader title="Tab root (big)" back={false} big />

      <Section title="Text">
        <Txt display size={21}>
          Display 21 Lemon/Milk
        </Txt>
        <Txt size={16} w={600}>
          Body 16 / 600
        </Txt>
        <Txt size={14}>Body 14 / 400. The quick brown fox jumps over the lazy dog.</Txt>
        <Txt size={12} dim>
          Dim 12 secondary ink
        </Txt>
        <Label>Uppercase label</Label>
        <Txt size={24} num>
          {f.deg(34)} · {f.dC(-1.5)} · {f.tk(12400)} · {f.dist(1350)} · {f.pct(38)}
        </Txt>
        <Txt size={13} lines={1}>
          One line clamp: a very long sentence that should be cut with an ellipsis when it runs out of room in this card.
        </Txt>
      </Section>

      <Section title="Buttons">
        <CzButton label="Set a cooling goal" onPress={() => toast('Primary pressed', { tone: 'success' })} />
        <CzButton label="Log action" icon="camera" variant="navy" size="md" />
        <Row>
          <CzButton label="Small" icon="plus" size="sm" />
          <CzButton label="Busy" busy size="sm" />
          <CzButton label="Disabled" disabled size="sm" icon="check" />
        </Row>
        <GhostButton label="See projection" />
        <Row>
          <PillButton label="Set goal" />
          <PillButton label="Add to goal" tone="lime" />
          <PillButton label="Card pill" tone="card" />
        </Row>
        <Row>
          <IconBtn d={I.search} label="Search" />
          <IconBtn d={I.plus} label="Add" tone="lime" />
          <IconBtn d={I.sparkle} label="Ask" tone="navy" />
          <IconBtn d={f.backPath} label="Back" />
          <IconBtn d={I.bell} label="Alerts" badge />
        </Row>
      </Section>

      <Section title="Cards & rows">
        <Card>
          <Txt w={600}>Card (radius 24, padding 16)</Txt>
          <Divider />
          <ListRow label="Row one" onPress={() => toast('Row pressed')}>
            <Avatar ini="NR" bg={AVATARS[0][0]} fg={AVATARS[0][1]} />
            <View style={{ flex: 1 }}>
              <Txt w={600}>Nadia Rahman</Txt>
              <Txt size={12} dim>
                Pressable list row
              </Txt>
            </View>
            <Icon d={f.fwdPath} size={16} color={c.ink2} />
          </ListRow>
          <ListRow last>
            <HeatBadge score={82} />
            <Txt style={{ flex: 1 }}>Static row, last (no divider)</Txt>
          </ListRow>
        </Card>
        <Card tone="navy">
          <Txt color={B.white} w={600}>
            Navy hero card
          </Txt>
          <Txt color={B.white} size={12} style={{ opacity: 0.8 }}>
            Bordered in dark mode
          </Txt>
        </Card>
        <Row wrap={false}>
          <Card tone="soft" style={{ flex: 1 }}>
            <Txt size={12}>Soft</Txt>
          </Card>
          <Card tone="limeSoft" style={{ flex: 1 }} onPress={() => toast('Card pressed')} label="Lime soft pressable">
            <Txt size={12}>Lime soft (tap)</Txt>
          </Card>
        </Row>
        <Row wrap={false}>
          <StatTile label="Air" value={f.deg(34)} sub="Open-Meteo" />
          <StatTile label="Feels like" value={f.deg(41)} color={B.red} />
          <StatTile label="Score" value={f.loc(78)} big />
        </Row>
      </Section>

      <Section title="Controls">
        <Seg
          label="Time of day"
          options={[
            { label: 'Day', value: 'day' },
            { label: 'Night', value: 'night' },
          ]}
          value={seg}
          onChange={setSeg}
        />
        <Seg
          tone="card"
          options={[
            { label: 'Week', value: 'day' },
            { label: 'Month', value: 'night' },
          ]}
          value={seg}
          onChange={setSeg}
        />
        <HScroll label="Filters">
          <FilterChip label="Trees" active={chip} onPress={() => setChip(!chip)} />
          <FilterChip label="Cool roofs" active={!chip} onPress={() => setChip(!chip)} />
          <FilterChip label="Shade" />
          <FilterChip label="Water" />
          <FilterChip label="Awareness" />
        </HScroll>
        <Row>
          <Txt size={12} dim>
            Radius {f.dist(slider)}
          </Txt>
          <CzSlider label="Scan radius" min={100} max={1000} step={50} value={slider} onChange={setSlider} valueText={f.dist(slider)} />
        </Row>
        <Stepper label="trees" value={f.loc(count)} onDec={() => setCount(Math.max(0, count - 1))} onInc={() => setCount(count + 1)} />
        <OptionRow title="Option A" sub="With a subtitle" extra="৳ 1,200" selected={opt === 'a'} onPress={() => setOpt('a')} />
        <OptionRow title="Option B" selected={opt === 'b'} onPress={() => setOpt('b')} />
        <Row>
          <RadioDot on />
          <RadioDot on={false} />
          <Tap role="checkbox" selected={checked} label="Check" onPress={() => setChecked(!checked)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}>
            <Check on={checked} />
            <Txt>Checkbox</Txt>
          </Tap>
        </Row>
        <Field label="Name" value={text} onChangeText={setText} placeholder="e.g. Nadia" />
        <Field label="Email" keyboardType="email-address" placeholder="you@example.com" error="Enter a valid email, like you@example.com." />
      </Section>

      <Section title="Data display">
        <Row>
          {[25, 45, 60, 78, 92].map((s) => (
            <HeatBadge key={s} score={s} size={40} />
          ))}
        </Row>
        <Row>
          {AVATARS.map(([bg, fg], i) => (
            <Avatar key={i} ini={['NR', 'RA', 'TK', 'HR', 'DG', 'MZ'][i]} bg={bg} fg={fg} square={i % 2 === 1} />
          ))}
        </Row>
        <Row gap={16}>
          <Ring pct={38} label="Goal progress">
            <Txt size={15} w={700} num>
              {f.pct(38)}
            </Txt>
          </Ring>
          <Ring pct={72} size={56} stroke={7} color={B.lime}>
            <Txt size={12} w={600}>
              {f.loc(72)}
            </Txt>
          </Ring>
          <View style={{ flex: 1, gap: 10 }}>
            <Bar pct={62} label="Progress" />
            <Bar pct={48} marker={60} color={B.orange} />
          </View>
        </Row>
        <Row>
          <Tag label="Tag sm" />
          <Tag label="xs" size="xs" />
          <Tag label="With dot" dot={B.red} size="md" />
          <Tag label="Lime" bg={B.lime} fg={B.limeInk} />
        </Row>
        <Photo src={PHOTO} label="Neighbourhood rooftops" scrim={[[0.4, 0], [1, 0.75]]} style={{ height: 180, borderRadius: 24, justifyContent: 'flex-end', padding: 14, gap: 8 }}>
          <GlassPill>
            <Icon d={I.pin} size={14} color={B.white} />
            <Txt size={12} w={600} color={B.white}>
              Glass pill
            </Txt>
          </GlassPill>
          <SourceChips meta={META_LIVE} tone="glass" />
        </Photo>
        <Note icon={I.info}>Lime note: advice strip.</Note>
        <Note tone="warn" icon={I.warn}>
          Warn note: heat caution.
        </Note>
        <Note tone="danger" icon={I.warn}>
          Danger note: extreme heat.
        </Note>
        <Note tone="navy" icon={I.sparkleOne}>
          Navy note.
        </Note>
      </Section>

      <Section title="Source chips">
        <SourceChips meta={META_LIVE} />
        <SourceChips meta={META_CACHED} />
        <SourceChips estimate demo />
      </Section>

      <Section title="States">
        <Row>
          <Spinner />
          <Spinner size="large" />
        </Row>
        <Skeleton h={120} r={24} />
        <SkeletonText lines={3} />
        <SkeletonCard lines={2} />
        <ErrorState onRetry={() => toast('Retry')} />
        <ErrorState compact onRetry={() => toast('Retry')} />
        <EmptyState title="No trees yet" sub="Plant one and log it to start your 15-day care rhythm." action="Log a tree" onAction={() => toast('Empty CTA')} />
      </Section>

      <Section title="Scales">
        <Row gap={4}>
          {[20, 45, 60, 75, 90].map((s) => (
            <View key={s} style={{ flex: 1, height: 32, borderRadius: 8, backgroundColor: heatColor(s), alignItems: 'center', justifyContent: 'center' }}>
              <Txt size={11} w={700} color={heatFg(s)}>
                {s}
              </Txt>
            </View>
          ))}
        </Row>
        <Row gap={4}>
          {AQI_COLORS.map((col, i) => (
            <View key={col} style={{ flex: 1, height: 32, borderRadius: 8, backgroundColor: col, alignItems: 'center', justifyContent: 'center' }}>
              <Txt size={11} w={700} color={AQI_FG[i]}>
                {i}
              </Txt>
            </View>
          ))}
        </Row>
        <Row gap={4}>
          {(Object.keys(HEAT_RISK) as HeatRiskKey[]).map((k) => (
            <Tag key={k} label={k} bg={HEAT_RISK[k].color} fg={HEAT_RISK[k].fg} />
          ))}
        </Row>
      </Section>

      <Section title="Icons">
        <Row gap={12}>
          {Object.entries(I).map(([k, d]) => (
            <View key={k} style={{ width: 64, alignItems: 'center', gap: 4 }}>
              <Icon d={d} size={22} />
              <Txt size={9.5} dim lines={1}>
                {k}
              </Txt>
            </View>
          ))}
        </Row>
      </Section>
    </View>
  );
}

function Panel({ dark, rtl }: { dark: boolean; rtl: boolean }) {
  return (
    <div className={dark ? 'dark' : 'light'} dir={rtl ? 'rtl' : 'ltr'} style={{ background: 'var(--cz-bg)', color: 'var(--cz-ink)', borderRadius: 28, border: '1px solid var(--cz-line)', overflow: 'hidden', minWidth: 0 }}>
      <CzScope dark={dark} rtl={rtl}>
        <View style={{ padding: 12, paddingBottom: 0 }}>
          <Tag label={`${dark ? 'Dark' : 'Light'} · ${rtl ? 'RTL' : 'LTR'}`} bg={B.navy} fg={B.lime} size="md" />
        </View>
        <KitBody />
      </CzScope>
    </div>
  );
}

export function KitGallery() {
  const { prefs, setPref, lang } = useCz();
  const t = useTranslations('common');
  const [sheet, setSheet] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [mode, setMode] = useState<'four' | 'single'>('four');

  return (
    <main id="main" className="cz-view" style={{ minHeight: '100dvh', padding: 16, gap: 16 }}>
      <Card gap={12}>
        <Txt display size={21} as="h1">
          CoolZone kit
        </Txt>
        <Txt size={12} dim>
          Every component from src/components/cz in light/dark × LTR/RTL. Locale switch re-renders everything with real fonts and copy.
        </Txt>
        <Seg
          tone="soft"
          label="Theme"
          options={[
            { label: 'Light', value: 'light' },
            { label: 'Dark', value: 'dark' },
            { label: 'System', value: 'system' },
          ]}
          value={prefs.theme}
          onChange={(v) => setPref('theme', v)}
        />
        <Seg
          tone="soft"
          label="Layout"
          options={[
            { label: '4 modes', value: 'four' },
            { label: 'Page theme only', value: 'single' },
          ]}
          value={mode}
          onChange={setMode}
        />
        <HScroll label="Locales" padded={false}>
          {LOCALES.map((l) => (
            <FilterChip key={l} label={LOCALE_NAMES[l]} active={l === lang} onPress={() => setPref('lang', l)} />
          ))}
        </HScroll>
        <Row>
          <PillButton label="Bottom sheet" onPress={() => setSheet(true)} />
          <PillButton label="Drawer" tone="lime" onPress={() => setDrawer(true)} />
          <PillButton label="requireAccount()" tone="card" onPress={() => requireAccount()} />
          <PillButton label="Toast" tone="card" onPress={() => toast(t('limitReached'), { tone: 'warn' })} />
          <PillButton label="Open app" tone="card" href={href('S04')} />
        </Row>
      </Card>

      {mode === 'four' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
          <Panel dark={false} rtl={false} />
          <Panel dark={false} rtl />
          <Panel dark rtl={false} />
          <Panel dark rtl />
        </div>
      ) : (
        <div style={{ maxWidth: 480, width: '100%', marginInline: 'auto' }}>
          <KitBody />
        </div>
      )}

      <BottomSheet open={sheet} onClose={() => setSheet(false)} title="Bottom sheet" sub="Centred dialog on desktop">
        <Txt dim>Escape, the scrim and the close button dismiss it. Focus is trapped inside.</Txt>
        <CzButton label="Done" icon="check" onPress={() => setSheet(false)} />
      </BottomSheet>
      <Drawer open={drawer} onClose={() => setDrawer(false)} title="Drawer" sub="Right-hand drawer on desktop" height="76%">
        <Txt dim>Used by Ask Atmos (V0-7).</Txt>
        <SkeletonText lines={4} />
      </Drawer>
    </main>
  );
}
