'use client';
/**
 * Ask Atmos (S29) panel (V0-7), rendered by V0-1's slot (src/components/cz/shell/ask-slot.tsx):
 * a bottom sheet on mobile, a right drawer on desktop. It knows the ScreenId and route context,
 * shows suggestion chips per topic (they send the intent id, so they always work), streams the
 * deterministic answer through useAskStream (warnings first in their own style → sentences → source
 * chips → action buttons that navigate only on tap → follow-up chips), shows the "n of 30 today"
 * counter (5 for guests) and 👍 / 👎 feedback. No photo attachment: tree photos go to the check-in.
 */
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';

import { B, BottomSheet, go, href, I, Icon, Note, requireAccount, SourceChips, Spinner, Tap, toast, Txt, useCz, useLocation, View } from '@/components/cz';
import { usePathname } from '@/i18n/navigation';
import { ASK_LIMIT, isGuestRestricted, RateLimitedError, sendAskFeedback, useAskStream, useFields, useSession, type AskMessage } from '@/lib/data/hooks';
import type { AskAction, AskContext, AskIntent, I18nText, ScreenId } from '@/lib/data/types';
import type { RouteId } from '@/lib/routes';

import { useAskScreenContext } from './ask-context';

export type AskPanelProps = { open: boolean; onClose: () => void; screen: ScreenId | null };

type Kind = 'heat' | 'air' | 'farm' | 'tree';

const CHIPS: Record<Kind, AskIntent[]> = {
  heat: ['why_hot', 'temp_now', 'forecast', 'normal'],
  air: ['air_now', 'air_advice', 'forecast'],
  farm: ['farm_alerts', 'forecast', 'temp_now'],
  tree: ['tree_due', 'tree_care', 'species', 'nurseries'],
};
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Render an answer sentence from the `server` namespace: dates → short local days, numbers → local digits; `count` stays a number for plurals. */
function useAskText() {
  const ts = useTranslations('server');
  const { f } = useCz();
  return (x: I18nText | string | null | undefined): string => {
    if (!x) return '';
    if (typeof x === 'string') return x;
    const params: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(x.params ?? {})) {
      if (k === 'count' && typeof v === 'number') params[k] = v;
      else if (typeof v === 'string' && ISO_DAY.test(v)) params[k] = f.date(v, { weekday: 'short', day: 'numeric', month: 'short' });
      else if (typeof v === 'number') params[k] = Number.isInteger(v) ? f.num(v) : f.dec(v, Math.abs(v) < 1 ? 2 : 1);
      else params[k] = v;
    }
    return ts.has(x.code) ? ts(x.code, params) : '';
  };
}

const TREE_SCREENS = new Set<ScreenId>(['S10', 'S11', 'S12', 'S13', 'S14', 'S15', 'S20', 'S21', 'S22']);

function kindFor(screen: ScreenId | null, farmer: boolean, path: string): Kind {
  if (path.startsWith('/app/tree')) return 'tree';
  if (!screen) return farmer ? 'farm' : 'heat';
  if (screen.startsWith('F')) return 'farm';
  if (farmer && (screen === 'S04' || screen === 'S05')) return 'farm';
  if (screen === 'S26' || screen === 'S27' || screen === 'S28') return 'air';
  if (TREE_SCREENS.has(screen)) return 'tree';
  return 'heat';
}

/** Route ids the server can use: zone, tree, field (from /app/farm/alert/[id]?field=). */
function routeContext(path: string): AskContext {
  const zone = /^\/app\/zone\/([^/]+)/.exec(path)?.[1];
  const tree = /^\/app\/tree\/([^/]+)/.exec(path)?.[1];
  const ctx: AskContext = {};
  if (zone) ctx.zone_id = decodeURIComponent(zone);
  if (tree) ctx.tree_id = decodeURIComponent(tree);
  if (path.startsWith('/app/farm') && typeof window !== 'undefined') {
    const field = new URLSearchParams(window.location.search).get('field');
    if (field) ctx.field_id = field;
  }
  return ctx;
}

export function AskPanel({ open, onClose, screen }: AskPanelProps) {
  const { c, f, prefs } = useCz();
  const t = useTranslations('ask');
  const tc = useTranslations('common');
  const path = usePathname();
  const { focus, placeName } = useLocation();
  const session = useSession();
  const published = useAskScreenContext();
  const ask = useAskStream();
  const fields = useFields();
  const [q, setQ] = useState('');
  const [rated, setRated] = useState<Set<string>>(() => new Set());
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const farmer = prefs.farmer_mode;
  const kind = kindFor(screen, farmer, path);
  const effScreen: ScreenId = screen ?? (path.startsWith('/app/tree') ? 'S20' : farmer ? 'F01' : 'S04');
  const field = fields.data?.find((x) => x.id === published?.context?.field_id) ?? fields.data?.[0] ?? null;
  const screenName = t(`screen.${path.startsWith('/app/tree') ? 'tree' : effScreen}`);
  const place = published?.place ?? (kind === 'farm' && field ? field.name : placeName);
  const max = ASK_LIMIT[session.isGuest ? 'guest' : 'user'];
  const used = ask.remaining == null ? 0 : Math.max(0, max - ask.remaining);
  const out = ask.remaining === 0;

  const sugg = useMemo(() => CHIPS[kind].map((id) => ({ id, label: t(`chip.${id}`) })), [t, kind]);

  // Keep the newest tokens in view.
  const last = ask.messages[ask.messages.length - 1];
  useEffect(() => {
    if (!open) return;
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [open, ask.messages.length, last?.parts.length, last?.done]);

  const send = async (text?: string, intent?: AskIntent) => {
    const message = (text ?? q).trim();
    if ((!message && !intent) || ask.streaming) return;
    if (out) return toast(t('outOfMessages'), { tone: 'warn' });
    const context: AskContext = {
      lat: (kind === 'farm' && field ? field.location : focus)?.lat,
      lng: (kind === 'farm' && field ? field.location : focus)?.lng,
      ...(kind === 'farm' && field ? { field_id: field.id } : {}),
      ...routeContext(path),
      ...(published?.context ?? {}),
    };
    setQ('');
    try {
      await ask.send(message, { screen: effScreen, intent, context, crop: field?.crop, stage: field?.stage, farmer });
    } catch (e) {
      if (isGuestRestricted(e)) requireAccount(t('outOfMessages'));
      else if (e instanceof RateLimitedError || (e as { status?: number })?.status === 429) toast(tc('limitReached'), { tone: 'warn' });
    }
  };

  const act = (a: AskAction) => {
    onClose();
    if (a.screen === 'S29') return;
    // Path params (zone, tree, alert ids) and query params share `params`; href() puts the rest in the query.
    const { id, ...query } = a.params ?? {};
    go(a.screen as RouteId, id ? { id } : undefined, Object.keys(query).length ? query : undefined);
  };

  const footer = (
    <View style={{ gap: 6 }}>
      <form
        className="cz-view"
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}>
        <input
          ref={inputRef}
          data-autofocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('ph')}
          aria-label={t('ph')}
          enterKeyHint="send"
          maxLength={500}
          className="cz-ask-input"
          style={{
            flex: 1,
            minWidth: 0,
            height: 44,
            borderRadius: 999,
            border: `1.5px solid ${c.line}`,
            backgroundColor: c.bg,
            color: c.ink,
            paddingInline: 16,
            fontFamily: 'var(--cz-font-body)',
            fontSize: 16,
            fontWeight: 500,
          }}
        />
        {ask.streaming ? (
          <Tap label={t('stop')} onPress={ask.stop} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: B.navy, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <View style={{ width: 14, height: 14, borderRadius: 3, backgroundColor: B.lime }} />
          </Tap>
        ) : (
          <Tap
            label={t('send')}
            haptic
            type="submit"
            disabled={!q.trim()}
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: B.lime, alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: !q.trim() ? 0.55 : 1 }}>
            <Icon d={f.arrowPath} size={18} color={B.limeInk} sw={2} />
          </Tap>
        )}
      </form>
      <Txt size={10.5} dim center num>
        {t(session.isGuest ? 'limitGuest' : 'limit', { n: f.loc(used), max: f.loc(max) })}
      </Txt>
    </View>
  );

  return (
    <>
      <BottomSheet
        open={open}
        onClose={onClose}
        desktop="right"
        height="76%"
        title={tc('askAtmos')}
        sub={t('sub')}
        leading={
          <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: B.navy, alignItems: 'center', justifyContent: 'center', flexShrink: 0, borderWidth: c.dark ? 1 : 0, borderColor: c.line }}>
            <Icon d={I.sparkleOne} size={18} color={B.lime} sw={2} />
          </View>
        }
        footer={footer}>
        {/* Context chip + new chat */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 28, paddingHorizontal: 10, borderRadius: 999, backgroundColor: c.limeSoft, minWidth: 0, flexShrink: 1 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.accent, flexShrink: 0 }} />
            <Txt size={11.5} w={600} lines={1}>
              {place ? `${screenName} · ${place}` : screenName}
            </Txt>
          </View>
          {ask.messages.length ? (
            <Tap label={t('newChat')} onPress={ask.reset} style={{ minHeight: 32, paddingHorizontal: 10, justifyContent: 'center', flexShrink: 0 }}>
              <Txt size={12} w={600} color={c.leaf}>
                {t('newChat')}
              </Txt>
            </Tap>
          ) : null}
        </View>

        {!ask.messages.length ? (
          <>
            <Txt size={13} dim>
              {t('hello')}
            </Txt>
            {kind === 'tree' ? (
              <Tap label={t('photoHint')} href={href('trees')} onPress={onClose} style={{ alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center' }}>
                <Txt size={12} w={600} color={c.leaf}>
                  {t('photoHint')}
                </Txt>
              </Tap>
            ) : null}
            <View style={{ gap: 8 }}>
              {sugg.map((s) => (
                <Tap
                  key={s.id}
                  label={s.label}
                  onPress={() => void send(s.label, s.id)}
                  style={{ alignSelf: 'flex-start', borderWidth: 1.5, borderColor: c.line, backgroundColor: c.card, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 14, minHeight: 44, justifyContent: 'center', textAlign: 'start' }}>
                  <Txt size={13} w={500}>
                    {s.label}
                  </Txt>
                </Tap>
              ))}
            </View>
          </>
        ) : null}

        <div role="log" aria-live="polite" aria-relevant="additions" className="cz-view" style={{ gap: 12 }}>
          {ask.messages.map((m) =>
            m.role === 'user' ? (
              <UserBubble key={m.id} m={m} />
            ) : (
              <BotBubble
                key={m.id}
                m={m}
                rated={rated.has(m.id)}
                onRate={(helpful) => {
                  setRated((s) => new Set(s).add(m.id));
                  if (m.message_id) void sendAskFeedback(m.message_id, helpful).catch(() => undefined);
                }}
                onAct={act}
                onChip={(id) => void send(t(`chip.${id}`), id)}
                onRetry={() => {
                  const i = ask.messages.indexOf(m);
                  const prev = ask.messages[i - 1];
                  if (prev?.role === 'user') void send(prev.text, m.intent && m.intent !== 'unknown' ? (m.intent as AskIntent) : undefined);
                }}
              />
            ),
          )}
        </div>
        <div ref={endRef} aria-hidden style={{ height: 1, flexShrink: 0 }} />
      </BottomSheet>
    </>
  );
}

function UserBubble({ m }: { m: AskMessage }) {
  return (
    <View style={{ alignSelf: 'flex-end', maxWidth: '82%', alignItems: 'flex-end', gap: 4 }}>
      <View style={{ backgroundColor: B.lime, borderRadius: 18, borderBottomEndRadius: 4, paddingVertical: 10, paddingHorizontal: 14 }}>
        <Txt size={13.5} color={B.limeInk}>
          {m.text}
        </Txt>
      </View>
    </View>
  );
}

function BotBubble({
  m,
  rated,
  onRate,
  onAct,
  onRetry,
  onChip,
}: {
  m: AskMessage;
  rated: boolean;
  onRate: (helpful: boolean) => void;
  onAct: (a: AskAction) => void;
  onRetry: () => void;
  onChip: (id: AskIntent) => void;
}) {
  const t = useTranslations('ask');
  const tx = useAskText();
  const { c } = useCz();
  const text = m.parts.map(tx).filter(Boolean).join(' ');
  const waiting = !m.done && !text;
  return (
    <View style={{ alignSelf: 'flex-start', maxWidth: '92%', gap: 6 }}>
      {m.warning ? (
        <View role="alert" style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: B.deepRed }}>
          <Icon d={I.warn} size={16} color={B.white} sw={2.2} style={{ flexShrink: 0, marginTop: 1 }} />
          <Txt size={12} color={B.white} style={{ flex: 1 }}>
            <Txt size={12} w={700} color={B.white} as="strong">
              {m.warning.source === 'BMD' ? t('official') : t('local')}
            </Txt>{' '}
            {tx(m.warning.text)}
          </Txt>
        </View>
      ) : null}
      {m.notices.map((n, i) => (
        <Note key={i} tone="warn" icon={I.info}>
          {tx(n)}
        </Note>
      ))}
      {waiting ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.card, borderRadius: 18, paddingVertical: 10, paddingHorizontal: 14 }}>
          <Spinner size={14} />
          <Txt size={12.5} dim>
            {t('busy')}
          </Txt>
        </View>
      ) : text ? (
        <View style={{ backgroundColor: c.card, borderRadius: 18, borderBottomStartRadius: 4, padding: 12, paddingHorizontal: 14 }}>
          <Txt size={13.5} style={{ whiteSpace: 'pre-wrap' }}>
            {text}
          </Txt>
        </View>
      ) : null}
      {m.error && !text ? (
        <View role="alert" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, backgroundColor: 'rgba(229,83,61,0.12)' }}>
          <Icon d={I.warn} size={16} color={B.red} sw={2} />
          <Txt size={12.5} style={{ flex: 1 }}>
            {m.error.code === 'ask.daily_limit' || m.error.code === 'auth.guest_restricted' ? t('outOfMessages') : t('error')}
          </Txt>
          {m.error.code !== 'ask.daily_limit' && m.error.code !== 'auth.guest_restricted' ? (
            <Tap label={t('retry')} onPress={onRetry} style={{ minHeight: 36, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1.5, borderColor: c.line, justifyContent: 'center' }}>
              <Txt size={12} w={600}>
                {t('retry')}
              </Txt>
            </Tap>
          ) : null}
        </View>
      ) : null}
      {m.sources.length ? <SourceChips sources={m.sources} /> : null}
      {m.done && text ? (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {m.actions.map((a, i) => {
            const label = tx(a.label);
            return (
              <Tap key={i} label={label} haptic onPress={() => onAct(a)} style={{ minHeight: 40, paddingHorizontal: 14, borderRadius: 999, backgroundColor: B.navy, justifyContent: 'center', borderWidth: c.dark ? 1 : 0, borderColor: c.line }}>
                <Txt size={12.5} w={600} color={B.white}>
                  {label}
                </Txt>
              </Tap>
            );
          })}
          {rated ? (
            <Txt size={12} w={600} dim>
              {t('thanks')}
            </Txt>
          ) : (
            <>
              <Tap label={t('helpful')} onPress={() => onRate(true)} style={{ minHeight: 40, minWidth: 40, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1.5, borderColor: c.line, justifyContent: 'center', alignItems: 'center' }}>
                <span aria-hidden style={{ fontSize: 14, lineHeight: 1 }}>
                  👍
                </span>
              </Tap>
              <Tap label={t('notHelpful')} onPress={() => onRate(false)} style={{ minHeight: 40, minWidth: 40, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1.5, borderColor: c.line, justifyContent: 'center', alignItems: 'center' }}>
                <span aria-hidden style={{ fontSize: 14, lineHeight: 1 }}>
                  👎
                </span>
              </Tap>
            </>
          )}
        </View>
      ) : null}
      {m.done && m.suggestions.length ? (
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          {m.suggestions.map((id) => (
            <Tap key={id} label={t(`chip.${id}`)} onPress={() => onChip(id)} style={{ minHeight: 36, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1.5, borderColor: c.line, backgroundColor: c.card, justifyContent: 'center' }}>
              <Txt size={12} w={500}>
                {t(`chip.${id}`)}
              </Txt>
            </Tap>
          ))}
        </View>
      ) : null}
    </View>
  );
}
