'use client';
/**
 * BottomSheet / Drawer: the Ask Atmos sheet look from the prototype (scrim, 28 px top radius,
 * drag handle, header with close). On ≥ 1024 px it becomes a centred dialog (`desktop="center"`),
 * a right-hand drawer (`desktop="right"`, mirrored in RTL) or stays a bottom sheet.
 * Escape and scrim tap close it; focus moves into the sheet and returns on close; body scroll locks.
 */
import { useTranslations } from 'next-intl';
import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

import { useCz } from '@/lib/prefs';

import { lockBodyScroll, useMounted } from './hooks';
import { I } from './icons';
import { rn, type StyleProp } from './style';
import { SHADOW } from './tokens';
import { Icon, Tap, Txt, View } from './ui';

export type BottomSheetProps = {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  sub?: React.ReactNode;
  /** Shown left of the title (e.g. the Ask Atmos sparkle tile) */
  leading?: React.ReactNode;
  children: React.ReactNode;
  /** Sticky footer (composer, CTA) */
  footer?: React.ReactNode;
  /** Mobile sheet height, e.g. '76%' (default: fits content up to 92%) */
  height?: string;
  /** Layout at ≥ 1024 px */
  desktop?: 'center' | 'right' | 'bottom';
  /** aria-label when there is no title */
  label?: string;
  showClose?: boolean;
  /** Body padding (default 16) */
  pad?: number;
  bodyStyle?: StyleProp;
};

export function BottomSheet({ open, onClose, title, sub, leading, children, footer, height, desktop = 'center', label, showClose = true, pad = 16, bodyStyle }: BottomSheetProps) {
  const { c, f } = useCz();
  const t = useTranslations('common');
  const mounted = useMounted();
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    const unlockScroll = lockBodyScroll();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && panel.current) {
        const els = panel.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input,textarea,select,[tabindex]:not([tabindex="-1"])');
        if (!els.length) return;
        const first = els[0];
        const last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const id = requestAnimationFrame(() => {
      const target = panel.current?.querySelector<HTMLElement>('[data-autofocus]') ?? panel.current;
      target?.focus();
    });
    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener('keydown', onKey);
      unlockScroll();
      prevFocus?.focus?.();
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className={`cz-sheet-root cz-sheet-${desktop}`} dir={f.rtl ? 'rtl' : 'ltr'}>
      <div className="cz-sheet-scrim" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : label}
        tabIndex={-1}
        className="cz-view cz-sheet-panel"
        style={{ backgroundColor: c.bg, ...SHADOW.sheet, ['--cz-sheet-h' as string]: height ?? 'auto' }}>
        <View style={{ paddingTop: 10, paddingHorizontal: 16, paddingBottom: title || leading ? 12 : 4, gap: 10, borderBottomWidth: title || leading ? 1 : 0, borderBottomColor: c.line, flexShrink: 0 }}>
          <div className="cz-sheet-handle" aria-hidden style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: c.line }} />
          {title || leading || showClose ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }}>
              {leading}
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                {title ? (
                  typeof title === 'string' ? (
                    <Txt display size={15} as="h2" id={titleId}>
                      {title}
                    </Txt>
                  ) : (
                    <div id={titleId}>{title}</div>
                  )
                ) : null}
                {sub ? (
                  typeof sub === 'string' ? (
                    <Txt size={11.5} dim>
                      {sub}
                    </Txt>
                  ) : (
                    sub
                  )
                ) : null}
              </View>
              {showClose ? (
                <Tap label={t('close')} onPress={onClose} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon d={I.close} size={16} sw={2.2} />
                </Tap>
              ) : null}
            </View>
          ) : null}
        </View>
        <div className="cz-view cz-sheet-body" style={rn([{ padding: pad, gap: 12, flex: 1, minHeight: 0, overflowY: 'auto' }, bodyStyle])}>
          {children}
        </div>
        {footer ? (
          <View style={{ padding: 12, paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)', borderTopWidth: 1, borderTopColor: c.line, flexShrink: 0 }}>{footer}</View>
        ) : (
          <div aria-hidden style={{ height: 'env(safe-area-inset-bottom, 0px)', flexShrink: 0 }} />
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Right-hand drawer on desktop, bottom sheet on mobile. */
export function Drawer(props: Omit<BottomSheetProps, 'desktop'>) {
  return <BottomSheet {...props} desktop="right" />;
}
