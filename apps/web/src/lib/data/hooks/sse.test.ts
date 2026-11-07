import { describe, expect, it } from 'vitest';

import type { AskEvent } from '../types';
import { applyAskEvent, type AskMessage } from './ask';
import { createSSEParser, readSSE } from './sse';

const wire = (events: AskEvent[], nl = '\n') =>
  events.map((e) => `event: ${e.type}${nl}data: ${JSON.stringify(e)}${nl}${nl}`).join('');

const EVENTS: AskEvent[] = [
  { type: 'warning', source: 'local', text: { code: 'warning.heatwave_severe', params: { tmax: 41, day: '2026-04-21' } } },
  { type: 'token', text: { code: 'ask.answer.why_hot_zone', params: { zone: 'আসাদ গেট', score: 86, lst: 44 } } },
  { type: 'token', text: { code: 'ask.answer.why_hot_cover', params: { sealed: 78, green: 9, water: 2 } } },
  { type: 'sources', sources: [{ id: 'open-meteo', name: 'Open-Meteo' }, { id: 'osm', name: 'OpenStreetMap' }] },
  { type: 'action', action: { label: { code: 'ask.action.open_zone' }, screen: 'S06', params: { id: 'z-1' } } },
  { type: 'notice', text: { code: 'ask.answer.farm_preview' } },
  { type: 'done', message_id: 'm1', remaining_today: 4, intent: 'why_hot', suggestions: ['temp_now', 'forecast'] },
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
      'event: error\ndata: {"type":"error","code":"ask.failed","message":"Slow"}\n\n',
      'event: done\ndata: {"type":"done","message_id":"z","remaining_today":0,"intent":"help","suggestions":[]}', // no trailing blank line
    ].join('');
    expect(parseAll([s])).toEqual([
      { type: 'token', text: 'hi' } as unknown as AskEvent,
      { type: 'error', code: 'ask.failed', message: 'Slow' },
      { type: 'done', message_id: 'z', remaining_today: 0, intent: 'help', suggestions: [] },
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
  const empty: AskMessage = { id: 'b', role: 'assistant', text: '', parts: [], sources: [], actions: [], notices: [], suggestions: [], done: false };

  it('builds the assistant message from events (warning first, ≤ 2 actions, dedup sources)', () => {
    const extra: AskEvent[] = [
      { type: 'sources', sources: [{ id: 'osm', name: 'OpenStreetMap' }] },
      { type: 'action', action: { label: { code: 'ask.action.set_goal' }, screen: 'S08' } },
      { type: 'action', action: { label: 'Third', screen: 'S04' } },
    ];
    const m = [...EVENTS.slice(0, 6), ...extra, EVENTS[6]].reduce(applyAskEvent, empty);
    expect(m.warning?.text.code).toBe('warning.heatwave_severe');
    expect(m.parts.map((p) => p.code)).toEqual(['ask.answer.why_hot_zone', 'ask.answer.why_hot_cover']);
    expect(m.sources.map((s) => s.id)).toEqual(['open-meteo', 'osm']);
    expect(m.actions.map((a) => a.screen)).toEqual(['S06', 'S08']);
    expect(m.notices.map((n) => n.code)).toEqual(['ask.answer.farm_preview']);
    expect(m).toMatchObject({ done: true, message_id: 'm1', intent: 'why_hot', suggestions: ['temp_now', 'forecast'] });
    expect(applyAskEvent(empty, { type: 'error', code: 'x', message: 'y' })).toMatchObject({ done: true, error: { code: 'x' } });
  });
});
