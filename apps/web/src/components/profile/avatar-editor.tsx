'use client';
/**
 * C1 · Profile photo: pick from the camera or gallery, drag and zoom inside a circle (hand-written
 * canvas, no library), export a 256 px JPEG and upload. Others see it once moderation approves it (C4).
 */
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { BottomSheet, CzButton, CzSlider, GhostButton, Txt, View, toast, useCz } from '@/components/cz';
import { useUploadAvatar } from '@/lib/data/hooks';

const VIEW = 260;
const OUT = 256;

type Img = { el: HTMLImageElement; url: string };

export function AvatarEditor({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('profile.avatar');
  const { c } = useCz();
  const upload = useUploadAvatar();
  const file = useRef<HTMLInputElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<Img | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  useEffect(() => () => void (img && URL.revokeObjectURL(img.url)), [img]);

  // Base scale covers the circle; zoom multiplies it.
  const base = img ? Math.max(VIEW / img.el.naturalWidth, VIEW / img.el.naturalHeight) : 1;
  const scale = base * zoom;

  const clamp = (x: number, y: number) => {
    if (!img) return { x, y };
    const w = img.el.naturalWidth * scale;
    const h = img.el.naturalHeight * scale;
    const mx = Math.max(0, (w - VIEW) / 2);
    const my = Math.max(0, (h - VIEW) / 2);
    return { x: Math.max(-mx, Math.min(mx, x)), y: Math.max(-my, Math.min(my, y)) };
  };

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const g = cv.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, VIEW, VIEW);
    g.fillStyle = c.soft;
    g.fillRect(0, 0, VIEW, VIEW);
    if (!img) return;
    const w = img.el.naturalWidth * scale;
    const h = img.el.naturalHeight * scale;
    g.drawImage(img.el, (VIEW - w) / 2 + pos.x, (VIEW - h) / 2 + pos.y, w, h);
    // Dim everything outside the circle.
    g.save();
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.beginPath();
    g.rect(0, 0, VIEW, VIEW);
    g.arc(VIEW / 2, VIEW / 2, VIEW / 2 - 2, 0, Math.PI * 2, true);
    g.fill('evenodd');
    g.restore();
  }, [img, scale, pos, c.soft]);

  const pick = (f: File) => {
    const url = URL.createObjectURL(f);
    const el = new Image();
    el.onload = () => {
      setImg({ el, url });
      setZoom(1);
      setPos({ x: 0, y: 0 });
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      toast(t('unreadable'), { tone: 'warn' });
    };
    el.src = url;
  };

  const save = async () => {
    if (!img) return;
    const out = document.createElement('canvas');
    out.width = OUT;
    out.height = OUT;
    const g = out.getContext('2d');
    if (!g) return;
    const k = OUT / VIEW;
    const w = img.el.naturalWidth * scale * k;
    const h = img.el.naturalHeight * scale * k;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, OUT, OUT);
    g.drawImage(img.el, (OUT - w) / 2 + pos.x * k, (OUT - h) / 2 + pos.y * k, w, h);
    const blob: Blob | null = await new Promise((r) => out.toBlob(r, 'image/jpeg', 0.86));
    if (!blob) return;
    upload.mutate(blob, {
      onSuccess: () => {
        toast(t('saved'), { tone: 'success' });
        setImg(null);
        onClose();
      },
      onError: () => toast(t('failed'), { tone: 'warn' }),
    });
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t('title')}
      sub={t('sub')}
      footer={
        <View style={{ gap: 8 }}>
          <CzButton label={img ? t('save') : t('choose')} icon={img ? 'check' : 'camera'} busy={upload.isPending} onPress={img ? () => void save() : () => file.current?.click()} />
          {img ? <GhostButton label={t('another')} height={44} onPress={() => file.current?.click()} /> : null}
        </View>
      }>
      <input
        ref={file}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) pick(f);
        }}
      />
      <View style={{ alignItems: 'center', gap: 12 }}>
        <canvas
          ref={canvas}
          width={VIEW}
          height={VIEW}
          role="img"
          aria-label={t('preview')}
          style={{ width: VIEW, height: VIEW, borderRadius: 16, touchAction: 'none', cursor: img ? 'grab' : 'default' }}
          onPointerDown={(e) => {
            if (!img) return;
            (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
            drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            setPos(clamp(d.px + e.clientX - d.x, d.py + e.clientY - d.y));
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
        />
        {img ? (
          <View style={{ width: '100%', maxWidth: 300 }}>
            <CzSlider
              label={t('zoom')}
              min={1}
              max={3}
              step={0.05}
              value={zoom}
              onChange={(v) => {
                setZoom(v);
                setPos((p) => p);
              }}
              valueText={`${Math.round(zoom * 100)}%`}
            />
          </View>
        ) : (
          <Txt size={12.5} dim center>
            {t('hint')}
          </Txt>
        )}
        <Txt size={11.5} dim center>
          {t('moderation')}
        </Txt>
      </View>
    </BottomSheet>
  );
}
