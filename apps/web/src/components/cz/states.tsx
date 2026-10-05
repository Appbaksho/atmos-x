'use client';
/**
 * Loading / error / empty states and data-honesty chips used by every screen
 * (prompt-v0 §4.7: loading, error with retry, empty, guest-restricted).
 */
import { useTranslations } from 'next-intl';
import React from 'react';

import { DataError, isGuestRestricted } from '@/lib/data/errors';
import type { Meta, Source } from '@/lib/data/types';
import { useCz } from '@/lib/prefs';

import { requireAccount } from './account';
import { I } from './icons';
import { rn, type StyleProp } from './style';
import { B, R } from './tokens';
import { Card, CzButton, GhostButton, Icon, Txt, View } from './ui';

/* ───────────────────────────── Skeleton ───────────────────────────── */

/** Shimmering placeholder block. Wrap a group in a container with aria-busy. */
export function Skeleton({ w = '100%', h = 16, r = 10, style }: { w?: number | string; h?: number | string; r?: number; style?: StyleProp }) {
  const { c } = useCz();
  return <div aria-hidden className="cz-skeleton" style={rn([{ width: w, height: h, borderRadius: r, backgroundColor: c.soft, flexShrink: 0 }, style])} />;
}

/** A few lines of text skeleton (last line shorter). */
export function SkeletonText({ lines = 3, size = 14, gap = 8 }: { lines?: number; size?: number; gap?: number }) {
  return (
    <View style={{ gap }}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} h={Math.round(size * 0.9)} w={i === lines - 1 && lines > 1 ? '60%' : '100%'} r={6} />
      ))}
    </View>
  );
}

/** Card-shaped skeleton (title line + body lines), matching Card padding/radius. */
export function SkeletonCard({ lines = 3, height, style }: { lines?: number; height?: number; style?: StyleProp }) {
  const t = useTranslations('common');
  return (
    <Card style={[height ? { height } : null, style]} label={t('loading')}>
      <div aria-busy="true" className="cz-view" style={{ gap: 12 }}>
        <Skeleton w="45%" h={14} r={6} />
        <SkeletonText lines={lines} />
      </div>
    </Card>
  );
}

/* ───────────────────────────── Error ───────────────────────────── */

/**
 * Error card with retry. Pass the caught `error`: GuestRestrictedError shows the account CTA,
 * RateLimitedError shows the daily-limit text, anything else the generic message.
 */
export function ErrorState({
  error,
  onRetry,
  title,
  body,
  compact,
  style,
}: {
  error?: unknown;
  onRetry?: () => void;
  title?: string;
  body?: string;
  /** Inline strip instead of a card */
  compact?: boolean;
  style?: StyleProp;
}) {
  const t = useTranslations('common');
  const tAcc = useTranslations('common.account');
  const guest = isGuestRestricted(error);
  const limited = error instanceof DataError && error.code === 'rate_limited';
  const msg = body ?? (guest ? tAcc('body') : limited ? t('limitReached') : t('error.body'));
  const head = title ?? (guest ? tAcc('title') : t('error.title'));

  if (compact) {
    return (
      <View role="alert" style={[{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, backgroundColor: 'rgba(229,83,61,0.12)' }, style]}>
        <Icon d={I.warn} size={18} color={B.red} sw={2} />
        <Txt size={12.5} style={{ flex: 1 }}>
          {msg}
        </Txt>
        {onRetry && !guest ? (
          <GhostButton label={t('retry')} onPress={onRetry} height={36} style={{ paddingHorizontal: 12 }} />
        ) : null}
      </View>
    );
  }

  return (
    <Card style={[{ alignItems: 'center', paddingVertical: 24 }, style]} gap={10}>
      <div role="alert" className="cz-view" style={{ alignItems: 'center', gap: 10, width: '100%' }}>
        <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: guest ? B.navy : 'rgba(229,83,61,0.14)', alignItems: 'center', justifyContent: 'center' }}>
          <Icon d={guest ? I.lock : I.warn} size={22} color={guest ? B.lime : B.red} sw={2} />
        </View>
        <Txt size={15} w={600} center>
          {head}
        </Txt>
        <Txt size={13} dim center>
          {msg}
        </Txt>
        {guest ? (
          <CzButton label={tAcc('create')} icon="check" size="md" onPress={() => requireAccount()} style={{ alignSelf: 'stretch', marginTop: 4 }} />
        ) : onRetry ? (
          <GhostButton label={t('retry')} onPress={onRetry} height={46} style={{ alignSelf: 'stretch', marginTop: 4 }} />
        ) : null}
      </div>
    </Card>
  );
}

/* ───────────────────────────── Empty ───────────────────────────── */

/** Friendly empty state with an optional primary action. */
export function EmptyState({
  title,
  sub,
  icon = I.sparkleOne,
  emoji,
  action,
  onAction,
  actionHref,
  tone = 'card',
  style,
}: {
  title?: string;
  sub?: string;
  /** Stroke icon path */
  icon?: string;
  emoji?: string;
  /** CTA label */
  action?: string;
  onAction?: () => void;
  actionHref?: string;
  tone?: 'card' | 'soft' | 'limeSoft';
  style?: StyleProp;
}) {
  const { c } = useCz();
  const t = useTranslations('common');
  return (
    <Card tone={tone} style={[{ alignItems: 'center', paddingVertical: 28 }, style]} gap={10}>
      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: c.limeSoft, alignItems: 'center', justifyContent: 'center' }}>
        {emoji ? (
          <span aria-hidden style={{ fontSize: 26, lineHeight: 1 }}>
            {emoji}
          </span>
        ) : (
          <Icon d={icon} size={24} color={c.leaf} sw={2} />
        )}
      </View>
      <Txt size={15} w={600} center>
        {title ?? t('empty.title')}
      </Txt>
      {sub ? (
        <Txt size={13} dim center style={{ maxWidth: 320 }}>
          {sub}
        </Txt>
      ) : null}
      {action ? <CzButton label={action} size="md" onPress={onAction} href={actionHref} style={{ marginTop: 6 }} /> : null}
    </Card>
  );
}

/* ───────────────────────────── Source chips ───────────────────────────── */

const AI_IDS = /^(ai|openai|gpt|llm)/i;
const DEMO_IDS = /^(demo|seed)/i;

/**
 * Data-honesty chips (prompt-v0 §1 rule 5): one chip per `meta.sources` entry (linked when it has
 * a url), plus "cached" when `meta.live === false`. Sources whose id starts with `ai`/`openai`
 * render as "AI estimate", `demo`/`seed` as "Demo community". `ai` / `demo` props add those chips
 * explicitly (e.g. for AI-filled plan values or seeded community data).
 */
export function SourceChips({
  meta,
  sources,
  ai,
  demo,
  tone = 'default',
  style,
}: {
  meta?: Meta | null;
  sources?: Source[];
  ai?: boolean;
  demo?: boolean;
  /** `glass` over photos / the map */
  tone?: 'default' | 'glass';
  style?: StyleProp;
}) {
  const { c, f } = useCz();
  const t = useTranslations('common.sources');
  const list = [...(meta?.sources ?? []), ...(sources ?? [])];
  const seen = new Set<string>();
  const chips: { key: string; text: string; url?: string; title?: string; kind: 'src' | 'ai' | 'demo' | 'cached' }[] = [];
  for (const s of list) {
    const kind = AI_IDS.test(s.id) ? 'ai' : DEMO_IDS.test(s.id) ? 'demo' : 'src';
    const text = kind === 'ai' ? t('ai') : kind === 'demo' ? t('demo') : s.name;
    if (seen.has(text)) continue;
    seen.add(text);
    chips.push({ key: s.id, text, url: s.url, title: s.as_of ? `${s.name} · ${f.date(s.as_of)}` : s.name, kind });
  }
  if (ai && !seen.has(t('ai'))) chips.push({ key: 'ai', text: t('ai'), kind: 'ai' });
  if (demo && !seen.has(t('demo'))) chips.push({ key: 'demo', text: t('demo'), kind: 'demo' });
  if (meta && meta.live === false) chips.push({ key: 'cached', text: t('cached'), kind: 'cached', title: f.date(meta.generated_at, { dateStyle: 'medium', timeStyle: 'short' }) });
  if (!chips.length) return null;

  const glass = tone === 'glass';
  return (
    <ul aria-label={t('label')} className="cz-view" style={rn([{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, listStyle: 'none', margin: 0, padding: 0 }, style])}>
      {chips.map((x) => {
        const dot = x.kind === 'ai' ? (c.dark ? B.lime : B.blue) : x.kind === 'demo' ? B.orange : x.kind === 'cached' ? B.orangeInk : B.green;
        const body = (
          <>
            <span aria-hidden style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dot, flexShrink: 0 }} />
            <Txt size={10.5} w={600} color={glass ? B.white : c.ink2} lines={1}>
              {x.text}
            </Txt>
          </>
        );
        const chipStyle = rn({
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          height: 22,
          paddingHorizontal: 8,
          borderRadius: R.pill,
          backgroundColor: glass ? B.glassDark : x.kind === 'cached' ? 'rgba(242,154,56,0.16)' : c.soft,
          borderWidth: glass ? 1 : 0,
          borderColor: B.glassLine,
          textDecoration: 'none',
          maxWidth: '100%',
        });
        return (
          <li key={x.key} style={{ display: 'flex', minWidth: 0 }}>
            {x.url ? (
              <a href={x.url} target="_blank" rel="noopener noreferrer" title={x.title} className="cz-tap" style={chipStyle}>
                {body}
              </a>
            ) : (
              <span title={x.title} style={chipStyle}>
                {body}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Visually hidden text for screen readers. */
export function VisuallyHidden({ children }: { children: React.ReactNode }) {
  return <span className="sr-only">{children}</span>;
}
