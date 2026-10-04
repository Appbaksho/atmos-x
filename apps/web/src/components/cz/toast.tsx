'use client';
/**
 * Minimal toast: `toast('Saved')`, `toast(msg, { tone: 'warn' })`. Rendered by <Toaster/> in the
 * app shell (aria-live polite). Used for RateLimitedError and quick confirmations.
 */
import { useEffect, useState } from 'react';

import { useCz } from '@/lib/prefs';

import { I } from './icons';
import { B, SHADOW } from './tokens';
import { Icon, Txt, View } from './ui';

export type ToastTone = 'info' | 'success' | 'warn' | 'danger';
type Item = { id: number; text: string; tone: ToastTone };

let items: Item[] = [];
let seq = 0;
const listeners = new Set<(x: Item[]) => void>();
const emit = () => listeners.forEach((l) => l(items));

export function toast(text: string, opts: { tone?: ToastTone; ms?: number } = {}) {
  const id = ++seq;
  items = [...items.filter((x) => x.text !== text), { id, text, tone: opts.tone ?? 'info' }].slice(-3);
  emit();
  setTimeout(() => {
    items = items.filter((x) => x.id !== id);
    emit();
  }, opts.ms ?? 3500);
}

export function Toaster() {
  const { c } = useCz();
  const [list, setList] = useState<Item[]>(items);
  useEffect(() => {
    listeners.add(setList);
    return () => {
      listeners.delete(setList);
    };
  }, []);
  return (
    <div aria-live="polite" role="status" className="cz-toaster">
      {list.map((x) => {
        const bg = x.tone === 'danger' ? B.deepRed : x.tone === 'warn' ? B.orange : B.navy;
        const fg = x.tone === 'warn' ? B.navy : B.white;
        const ic = x.tone === 'success' ? I.checkSm : x.tone === 'info' ? I.info : I.warn;
        return (
          <View key={x.id} className="cz-toast" style={[{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 16, backgroundColor: bg, border: `1px solid ${c.line}` }, SHADOW.card]}>
            <Icon d={ic} size={18} color={x.tone === 'success' ? B.lime : fg} sw={2} />
            <Txt size={13} w={500} color={fg}>
              {x.text}
            </Txt>
          </View>
        );
      })}
    </div>
  );
}
