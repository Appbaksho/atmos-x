'use client';
/** Invite by link / QR / code (S17 sheet, S19 after creating), with Web Share and copy fallbacks. */
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { B, CzButton, I, Icon, Label, R, Seg, Skeleton, Tap, Txt, View, toast, useCz } from '@/components/cz';
import { useInvite } from '@/lib/data/hooks';
import type { Team } from '@/lib/data/types';

import { freePlaces } from './shared';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

type Mode = 'link' | 'qr' | 'code';

/** QR code as a data URL (qrcode is loaded on demand, so it stays out of the main bundle). */
export function useQrDataUrl(text: string | null): string | null {
  const [out, setOut] = useState<{ text: string; url: string } | null>(null);
  useEffect(() => {
    if (!text) return;
    let alive = true;
    import('qrcode')
      .then((QR) => QR.toDataURL(text, { margin: 1, width: 360, errorCorrectionLevel: 'M', color: { dark: B.navy, light: '#FFFFFF' } }))
      .then((url) => {
        if (alive) setOut({ text, url });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [text]);
  return out && out.text === text ? out.url : null;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function InviteCard({ team, initial = 'qr' }: { team: Team; initial?: Mode }) {
  const t = useTranslations('community');
  const { c, f } = useCz();
  const invite = useInvite(team.id);
  const [mode, setMode] = useState<Mode>(initial);
  const [copied, setCopied] = useState(false);
  const url = invite ? invite.url : null;
  const short = url ? url.replace(/^https?:\/\//, '').replace(/\?.*$/, '') : '';
  const qr = useQrDataUrl(mode === 'qr' ? url : null);
  const free = freePlaces(team);

  const copy = async () => {
    if (!url) return;
    const ok = await copyText(url);
    if (ok) setCopied(true);
    else toast(t('copyFail'), { tone: 'warn' });
  };

  const share = async () => {
    if (!url) return;
    const data = { title: t('shareTitle', { name: team.name }), text: t('shareText', { name: team.name, code: team.code ?? '' }), url };
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share(data);
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
      }
    }
    if (await copyText(`${data.text}\n${url}`)) {
      setCopied(true);
      toast(t('copied'), { tone: 'success' });
    } else toast(t('copyFail'), { tone: 'warn' });
  };

  return (
    <View style={{ gap: 14 }}>
      <Label>{t('inviteBy')}</Label>
      <Seg<Mode>
        label={t('inviteBy')}
        value={mode}
        onChange={(m) => {
          setMode(m);
          setCopied(false);
        }}
        options={[
          { label: t('inv.link'), value: 'link' },
          { label: t('inv.qr'), value: 'qr' },
          { label: t('inv.code'), value: 'code' },
        ]}
      />

      {mode === 'link' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 6, paddingStart: 14, borderRadius: 18, backgroundColor: c.bg, borderWidth: 1.5, borderColor: c.line }}>
          <Txt size={13.5} w={500} lines={1} selectable style={{ flex: 1, minWidth: 0, fontFamily: MONO, direction: 'ltr', textAlign: 'start' }}>
            {short || '…'}
          </Txt>
          <Tap
            label={copied ? t('copied') : `${t('copy')} ${t('linkA11y')}`}
            haptic
            onPress={copy}
            disabled={!url}
            style={{ height: 40, paddingHorizontal: 16, borderRadius: R.pill, backgroundColor: copied ? B.lime : B.navy, justifyContent: 'center' }}>
            <Txt size={13} w={600} lines={1} color={copied ? B.limeInk : B.white}>
              <span aria-live="polite">{copied ? t('copied') : t('copy')}</span>
            </Txt>
          </Tap>
        </View>
      ) : null}

      {mode === 'qr' ? (
        <View style={{ alignItems: 'center', paddingVertical: 4, gap: 8 }}>
          <View style={{ padding: 12, borderRadius: R.lg, backgroundColor: B.white, borderWidth: c.dark ? 0 : 1, borderColor: c.line }}>
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} width={184} height={184} alt={t('qrA11y')} style={{ display: 'block', imageRendering: 'pixelated' }} />
            ) : (
              <Skeleton w={184} h={184} r={8} />
            )}
          </View>
          <Txt size={11.5} dim center>
            {t('qrHint')}
          </Txt>
        </View>
      ) : null}

      {mode === 'code' ? (
        <View
          role="img"
          label={`${t('codeA11y')}: ${(team.code ?? '').split('').join(' ')}`}
          style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: 8, direction: 'ltr' }}>
          {(team.code ?? '').split('').map((ch, i) => (
            <View key={i} style={{ flex: 1, maxWidth: 40, height: 54, borderRadius: R.sm, backgroundColor: ch === '-' ? 'transparent' : c.soft, alignItems: 'center', justifyContent: 'center' }}>
              <Txt size={22} w={600} style={{ fontFamily: MONO }}>
                {ch}
              </Txt>
            </View>
          ))}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon d={I.community} size={14} sw={2} color={c.ink2} />
        <Txt size={12} dim style={{ flex: 1 }}>
          {free > 0 ? t('spotsLeft', { count: free, n: f.loc(free), max: f.loc(team.max_members) }) : t('teamFull', { max: f.loc(team.max_members) })}
        </Txt>
      </View>

      <CzButton label={t('share')} icon="arrow" variant="navy" onPress={share} disabled={!url} />
    </View>
  );
}
