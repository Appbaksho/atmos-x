'use client';
/**
 * Ask Atmos (§6.12): POST /api/v1/ask and read the SSE stream (warning → token… → sources → action →
 * notice → done). Answers are deterministic and arrive as I18nText parts, rendered in the person's
 * language by the panel. The daily limit (5 guest / 30 account) is enforced by the server; the
 * counter comes from GET /ask/usage and each `done` event.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { DataError } from '../errors';
import { newId } from '../local/ids';
import type { AskAction, AskContext, AskEvent, AskIntent, AskRequest, CropId, I18nText, ScreenId, Source, StageId } from '../types';
import { useDataContext } from './context';
import { getJSON, request } from './http';
import { API } from './heat';
import { readSSE } from './sse';

const MAX_ACTIONS = 2;

export type AskMessage = {
  id: string;
  role: 'user' | 'assistant';
  /** user turn: what was typed or the chip's label */
  text: string;
  /** assistant turn: one I18nText per sentence */
  parts: I18nText[];
  warning?: { source: 'BMD' | 'local'; text: I18nText } | null;
  sources: Source[];
  actions: AskAction[];
  notices: I18nText[];
  suggestions: AskIntent[];
  intent?: string;
  error?: { code: string; message: string } | null;
  /** assistant turn finished (done, error or stopped) */
  done: boolean;
  message_id?: string;
};

export type AskSendOptions = {
  screen: ScreenId;
  /** A suggestion chip: the server skips classification */
  intent?: AskIntent;
  context?: AskContext;
  crop?: CropId;
  stage?: StageId;
  farmer?: boolean;
};

/** Applies one SSE event to the assistant message. Exported for tests. */
export function applyAskEvent(m: AskMessage, e: AskEvent): AskMessage {
  switch (e.type) {
    case 'warning':
      return m.warning ? m : { ...m, warning: { source: e.source, text: e.text } };
    case 'token':
      return { ...m, parts: [...m.parts, e.text] };
    case 'sources': {
      const seen = new Set(m.sources.map((s) => s.id));
      return { ...m, sources: [...m.sources, ...e.sources.filter((s) => !seen.has(s.id))] };
    }
    case 'action':
      return m.actions.length >= MAX_ACTIONS ? m : { ...m, actions: [...m.actions, e.action] };
    case 'notice':
      return { ...m, notices: [...m.notices, e.text] };
    case 'done':
      return { ...m, done: true, message_id: e.message_id, suggestions: e.suggestions ?? [], intent: e.intent };
    case 'error':
      return { ...m, done: true, error: { code: e.code, message: e.message } };
    default:
      return m;
  }
}

const blank = (role: AskMessage['role'], text = ''): AskMessage => ({ id: newId('m'), role, text, parts: [], sources: [], actions: [], notices: [], suggestions: [], done: role === 'user' });

export function useAskStream() {
  const ctx = useDataContext();
  const [messages, setMessages] = useState<AskMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!ctx.ready || ctx.offline) return;
    let cancelled = false;
    getJSON<{ limit: number; remaining_today: number }>(`${API}/ask/usage`)
      .then((u) => !cancelled && setRemaining(u.remaining_today))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [ctx.ready, ctx.offline, ctx.ns]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const patch = useCallback((id: string, fn: (m: AskMessage) => AskMessage) => {
    setMessages((list) => list.map((m) => (m.id === id ? fn(m) : m)));
  }, []);

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setError(null);
  }, []);

  /**
   * Send a message (or a chip's intent). Rejects with GuestRestrictedError (guest over 5/day →
   * requireAccount()) or RateLimitedError (30/day). Stream errors land on the assistant message.
   */
  const send = useCallback(
    async (message: string, opts: AskSendOptions): Promise<void> => {
      const text = message.trim();
      if (!text && !opts.intent) return;
      abortRef.current?.abort();
      setError(null);
      const body: AskRequest = {
        message: text || undefined,
        intent: opts.intent,
        screen: opts.screen,
        lang: ctx.lang,
        context: opts.context,
        crop: opts.crop,
        stage: opts.stage,
        farmer: opts.farmer,
      };
      const userMsg = blank('user', text);
      const bot = blank('assistant');
      setMessages((l) => [...l, userMsg, bot]);
      setStreaming(true);
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await request(`${API}/ask`, {
          method: 'POST',
          signal: controller.signal,
          headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
          body: JSON.stringify(body),
        });
        if (!res.body) throw new DataError('ask.no_stream', 'No response stream', 502);
        await readSSE(res.body, (e) => {
          patch(bot.id, (m) => applyAskEvent(m, e));
          if (e.type === 'done') setRemaining(e.remaining_today);
        });
        patch(bot.id, (m) => ({ ...m, done: true }));
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') {
          patch(bot.id, (m) => ({ ...m, done: true }));
        } else {
          const err = e instanceof DataError ? e : new DataError('ask.failed', (e as Error).message || 'Ask failed', 500);
          patch(bot.id, (m) => ({ ...m, done: true, error: { code: err.code, message: err.message } }));
          setError(err);
          if (err.status === 429 || err.code === 'auth.guest_restricted') {
            setRemaining(0);
            throw err;
          }
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        setStreaming(false);
      }
    },
    [patch, ctx.lang],
  );

  return { messages, send, streaming, stop, reset, remaining, error };
}

/** 👍 / 👎 on an answer (stored so the team can extend intents, K8). */
export async function sendAskFeedback(messageId: string, helpful: boolean): Promise<void> {
  await request(`${API}/ask/${encodeURIComponent(messageId)}/feedback`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ helpful }),
  });
}
