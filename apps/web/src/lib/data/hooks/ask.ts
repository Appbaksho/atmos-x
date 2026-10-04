'use client';
/**
 * Ask Atmos (§5.2): POST /api/v0/ask, read the SSE stream (warning → token… → sources → action → done).
 * Keeps the last 6 turns as history, builds the compact client_state (≤ 6 KB) and tracks the daily
 * quota locally (5 guest / 30 account; the server enforces too).
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { DataError } from '../errors';
import { askRemaining, buildClientState, consumeAskQuota, syncAskRemaining } from '../local/ask';
import { currentContext } from '../local/context';
import { activeGoal, listGoals } from '../local/goals';
import { ASK_LIMIT } from '../local/guest';
import { newId } from '../local/ids';
import { resizeToDataUrl } from '../local/images';
import { listTrees } from '../local/trees';
import type { AskAction, AskContext, AskEvent, AskRequest, AskTurn, ScreenId, Source } from '../types';
import { V0_ROUTES } from '../types';
import { useDataContext } from './context';
import { request } from './http';
import { readSSE } from './sse';

export const ASK_HISTORY_TURNS = 6;
const MAX_ACTIONS = 2;
const ASK_IMAGE_PX = 1024;

export type AskMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  /** user turn: the attached photo (data URL) */
  image?: string | null;
  warning?: { source: 'BMD' | 'local'; text: string } | null;
  sources: Source[];
  actions: AskAction[];
  notices: string[];
  error?: { code: string; message: string } | null;
  /** assistant turn finished (done, error or stopped) */
  done: boolean;
  message_id?: string;
};

export type AskSendOptions = {
  screen: ScreenId;
  context?: AskContext;
  /** data URL or a Blob/File (resized to ≤ 1024 px JPEG) */
  image?: string | Blob | null;
  /** What the current screen shows (numbers, names). Trimmed to fit 6 KB. */
  visible?: Record<string, unknown>;
};

/** Applies one SSE event to the assistant message. Exported for tests. */
export function applyAskEvent(m: AskMessage, e: AskEvent): AskMessage {
  switch (e.type) {
    case 'warning':
      return { ...m, warning: { source: e.source, text: e.text } };
    case 'token':
      return { ...m, text: m.text + e.text };
    case 'sources': {
      const seen = new Set(m.sources.map((s) => s.id));
      return { ...m, sources: [...m.sources, ...e.sources.filter((s) => !seen.has(s.id))] };
    }
    case 'action':
      return m.actions.length >= MAX_ACTIONS ? m : { ...m, actions: [...m.actions, e.action] };
    case 'notice':
      return { ...m, notices: [...m.notices, e.text] };
    case 'done':
      return { ...m, done: true, message_id: e.message_id };
    case 'error':
      return { ...m, done: true, error: { code: e.code, message: e.message } };
    default:
      return m;
  }
}

/** Last N completed turns, oldest first. Exported for tests. */
export function historyFrom(messages: readonly AskMessage[], turns = ASK_HISTORY_TURNS): AskTurn[] {
  return messages
    .filter((m) => m.text.trim() && !m.error)
    .slice(-turns)
    .map((m) => ({ role: m.role, text: m.text }));
}

export function useAskStream() {
  const ctx = useDataContext();
  const [messages, setMessages] = useState<AskMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const messagesRef = useRef<AskMessage[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (!ctx.ready) return;
    let cancelled = false;
    askRemaining(ctx)
      .then((n) => !cancelled && setRemaining(n))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [ctx]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const patch = useCallback((id: string, fn: (m: AskMessage) => AskMessage) => {
    setMessages((list) => list.map((m) => (m.id === id ? fn(m) : m)));
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setError(null);
  }, []);

  /**
   * Send a message. Rejects with GuestRestrictedError (guest over 5/day → requireAccount()) or
   * RateLimitedError (30/day, or the server's limit). Stream errors land on the assistant message.
   */
  const send = useCallback(
    async (message: string, opts: AskSendOptions): Promise<void> => {
      const text = message.trim();
      if (!text && !opts.image) return;
      abortRef.current?.abort();
      setError(null);
      const c = await currentContext();
      try {
        setRemaining(await consumeAskQuota(c));
      } catch (e) {
        setError(e as Error);
        throw e;
      }

      const image = opts.image instanceof Blob ? await resizeToDataUrl(opts.image, ASK_IMAGE_PX) : opts.image ?? null;
      const [trees, goals] = c.kind === 'user' ? await Promise.all([listTrees(c.ns), listGoals(c.ns)]) : [[], []];
      const body: AskRequest = {
        message: text,
        screen: opts.screen,
        lang: c.lang,
        context: opts.context,
        client_state: buildClientState({
          kind: c.kind,
          unit: c.prefs.unit,
          farmer: c.prefs.farmer_mode,
          trees,
          goal: activeGoal(goals),
          visible: opts.visible,
        }),
        history: historyFrom(messagesRef.current),
        image,
      };

      const userMsg: AskMessage = { id: newId('m'), role: 'user', text, image, sources: [], actions: [], notices: [], done: true };
      const botId = newId('m');
      const botMsg: AskMessage = { id: botId, role: 'assistant', text: '', sources: [], actions: [], notices: [], done: false };
      setMessages((l) => [...l, userMsg, botMsg]);
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await request(V0_ROUTES.ask.path, {
          method: 'POST',
          signal: controller.signal,
          headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
          body: JSON.stringify(body),
        });
        if (!res.body) throw new DataError('ask.no_stream', 'No response stream', 502);
        await readSSE(res.body, (e) => {
          patch(botId, (m) => applyAskEvent(m, e));
          if (e.type === 'done') {
            setRemaining((r) => (r === null ? e.remaining_today : Math.min(r, e.remaining_today)));
            void syncAskRemaining(c, e.remaining_today, ASK_LIMIT[c.kind]).catch(() => undefined);
          }
        });
        patch(botId, (m) => ({ ...m, done: true }));
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') {
          patch(botId, (m) => ({ ...m, done: true }));
        } else {
          const err = e instanceof DataError ? e : new DataError('ask.failed', (e as Error).message || 'Ask failed', 500);
          patch(botId, (m) => ({ ...m, done: true, error: { code: err.code, message: err.message } }));
          setError(err);
          if (err.status === 429 || err.code === 'auth.guest_restricted') throw err;
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        setStreaming(false);
      }
    },
    [patch],
  );

  return { messages, send, streaming, stop, reset, remaining, error };
}
