/**
 * Server-Sent Events parser for POST /api/v0/ask. Wire format (one event per block):
 *
 *   event: <type>\n
 *   data: <JSON AskEvent>\n
 *   \n
 *
 * Handles events split across network chunks (including a \r\n split between chunks), multi-line
 * `data:`, comments (`: ping`) and CRLF. Unknown event types and malformed JSON are skipped.
 */
import type { AskEvent } from '../types';

export const ASK_EVENT_TYPES = ['warning', 'token', 'sources', 'action', 'notice', 'done', 'error'] as const;
const KNOWN = new Set<string>(ASK_EVENT_TYPES);

export type SSEParser = { push(chunk: string): void; flush(): void };

export function createSSEParser(onEvent: (e: AskEvent) => void): SSEParser {
  let buf = '';

  const dispatch = (block: string) => {
    let event = 'message';
    const data: string[] = [];
    for (const line of block.split('\n')) {
      if (!line || line.startsWith(':')) continue;
      const i = line.indexOf(':');
      const field = i === -1 ? line : line.slice(0, i);
      const value = i === -1 ? '' : line.slice(i + 1).replace(/^ /, '');
      if (field === 'event') event = value;
      else if (field === 'data') data.push(value);
    }
    if (!data.length) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(data.join('\n'));
    } catch {
      return;
    }
    if (!parsed || typeof parsed !== 'object') return;
    const obj = parsed as Record<string, unknown>;
    const type = typeof obj.type === 'string' ? obj.type : event;
    if (!KNOWN.has(type)) return;
    onEvent({ ...obj, type } as AskEvent);
  };

  return {
    push(chunk: string) {
      buf += chunk;
      // keep a trailing \r: it may be the first half of a \r\n split across chunks
      const hold = buf.endsWith('\r') ? 1 : 0;
      let text = buf.slice(0, buf.length - hold).replace(/\r\n?/g, '\n');
      const rest = buf.slice(buf.length - hold);
      let idx: number;
      while ((idx = text.indexOf('\n\n')) !== -1) {
        dispatch(text.slice(0, idx));
        text = text.slice(idx + 2);
      }
      buf = text + rest;
    },
    flush() {
      const tail = buf.replace(/\r\n?/g, '\n').trim();
      buf = '';
      if (tail) dispatch(tail);
    },
  };
}

/** Reads a byte stream to the end, decoding UTF-8 across chunk boundaries. */
export async function readSSE(body: ReadableStream<Uint8Array>, onEvent: (e: AskEvent) => void): Promise<void> {
  const parser = createSSEParser(onEvent);
  const reader = body.getReader();
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parser.push(decoder.decode(value, { stream: true }));
    }
    parser.push(decoder.decode());
    parser.flush();
  } finally {
    reader.releaseLock();
  }
}
