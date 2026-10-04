import { describe, expect, it } from 'vitest';

import type { AskEvent } from '../types';
import { applyAskEvent, historyFrom, type AskMessage } from './ask';
import { createSSEParser, readSSE } from './sse';

const wire = (events: AskEvent[], nl = '\n') =>
  events.map((e) => `event: ${e.type}${nl}data: ${JSON.stringify(e)}${nl}${nl}`).join('');

const EVENTS: AskEvent[] = [
  { type: 'warning', source: 'local', text: 'Severe heat today' },
  { type: 'token', text: 'আপনার এলাকা ' },
  { type: 'token', text: 'গরম কারণ…' },
  { type: 'sources', sources: [{ id: 'open-meteo', name: 'Open-Meteo' }, { id: 'osm', name: 'OpenStreetMap' }] },
  { type: 'action', action: { label: 'See zone', screen: 'S06', params: { id: 'z-1' } } },
  { type: 'notice', text: 'Heat map is an estimate' },
  { type: 'done', message_id: 'm1', remaining_today: 4 },
];

function parseAll(chunks: string[]): AskEvent[] {
  const out: AskEvent[] = [];
  const p = createSSEParser((e) => out.push(e));
  chunks.forEach((c) => p.push(c));
  p.flush();
  return out;
}

describe('SSE parser', () => {
  it('parses the exact wire format', () => {
    expect(parseAll([wire(EVENTS)])).toEqual(EVENTS);
  });

  it('handles every possible chunk boundary', () => {
    const s = wire(EVENTS.slice(0, 4));
    for (let i = 1; i < s.length; i++) {
      expect(parseAll([s.slice(0, i), s.slice(i)])).toEqual(EVENTS.slice(0, 4));
    }
  });

  it('handles CRLF, including \\r\\n split across chunks', () => {
    const s = wire(EVENTS, '\r\n');
    const out: AskEvent[] = [];
    const p = createSSEParser((e) => out.push(e));
    for (const ch of s) p.push(ch); // one char at a time
    p.flush();
    expect(out).toEqual(EVENTS);
  });

  it('supports multi-line data, comments, missing type field, and skips junk', () => {
    const s = [
      ': keep-alive\n\n',
      'event: token\ndata: {"text":\ndata: "hi"}\n\n',
      'event: mystery\ndata: {"x":1}\n\n',
      'event: token\ndata: not json\n\n',
      'event: error\ndata: {"type":"error","code":"openai_timeout","message":"Slow"}\n\n',
      'event: done\ndata: {"type":"done","message_id":"z","remaining_today":0}', // no trailing blank line
    ].join('');
    expect(parseAll([s])).toEqual([
      { type: 'token', text: 'hi' },
      { type: 'error', code: 'openai_timeout', message: 'Slow' },
      { type: 'done', message_id: 'z', remaining_today: 0 },
    ]);
  });

  it('decodes UTF-8 split across byte chunks (Bangla)', async () => {
    const bytes = new TextEncoder().encode(wire(EVENTS));
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        for (let i = 0; i < bytes.length; i += 7) c.enqueue(bytes.slice(i, i + 7));
        c.close();
      },
    });
    const out: AskEvent[] = [];
    await readSSE(stream, (e) => out.push(e));
    expect(out).toEqual(EVENTS);
  });
});

describe('Ask message reducer', () => {
  const empty: AskMessage = { id: 'b', role: 'assistant', text: '', sources: [], actions: [], notices: [], done: false };

  it('builds the assistant message from events (warning first, ≤ 2 actions, dedup sources)', () => {
    const extra: AskEvent[] = [
      { type: 'sources', sources: [{ id: 'osm', name: 'OpenStreetMap' }] },
      { type: 'action', action: { label: 'Plan', screen: 'S10' } },
      { type: 'action', action: { label: 'Third', screen: 'S04' } },
    ];
    const m = [...EVENTS.slice(0, 6), ...extra, EVENTS[6]].reduce(applyAskEvent, empty);
    expect(m.warning?.text).toBe('Severe heat today');
    expect(m.text).toBe('আপনার এলাকা গরম কারণ…');
    expect(m.sources.map((s) => s.id)).toEqual(['open-meteo', 'osm']);
    expect(m.actions.map((a) => a.screen)).toEqual(['S06', 'S10']);
    expect(m.notices).toEqual(['Heat map is an estimate']);
    expect(m).toMatchObject({ done: true, message_id: 'm1' });
    expect(applyAskEvent(empty, { type: 'error', code: 'x', message: 'y' })).toMatchObject({ done: true, error: { code: 'x' } });
  });

  it('keeps the last 6 turns as history, skipping errors and empty text', () => {
    const msgs: AskMessage[] = Array.from({ length: 10 }, (_, i) => ({ ...empty, id: String(i), role: i % 2 ? 'assistant' : 'user', text: `t${i}`, done: true }));
    msgs.push({ ...empty, id: 'err', text: 'partial', error: { code: 'e', message: 'm' } });
    msgs.push({ ...empty, id: 'blank', text: '' });
    const h = historyFrom(msgs);
    expect(h).toHaveLength(6);
    expect(h.map((t) => t.text)).toEqual(['t4', 't5', 't6', 't7', 't8', 't9']);
    expect(h[0].role).toBe('user');
  });
});
