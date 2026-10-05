'use client';

/**
 * In-app camera (replaces expo-camera). Full-screen modal:
 *  - live rear-camera viewfinder via getUserMedia (HTTPS or localhost only),
 *  - lime framing brackets, "GPS + time sealed" pill, live coordinates + clock,
 *  - shutter → frame drawn to a canvas (≤ 1600 px), GPS + time burned into the image,
 *  - retake / use photo,
 *  - file-input fallback (`accept=image/* capture=environment`) when the live camera is
 *    unavailable (insecure origin, no camera, permission denied, headless).
 *
 * Stable API (V0-6 tree checks and V0-7 Ask Atmos import it):
 *   <Camera open onClose onCapture={({ blob, takenAt, lat, lng }) => …} overlay={<Hint/>} />
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';

import { B, CzButton, I, Icon, IconBtn, lockBodyScroll, R, Spinner, Tap, Txt, View, useCz, useLocation, useMounted } from '@/components/cz';

import { type CameraCapture, type CameraIssue, type Fix, captureVideoFrame, cameraIssueFrom, fileToCapture, formatFix, formatStampTime, liveCameraSupport } from './capture';

export type { CameraCapture } from './capture';

export type CameraProps = {
  open: boolean;
  onClose: () => void;
  /** Called after the user confirms the photo ("Use photo"). The camera does not close itself. */
  onCapture: (capture: CameraCapture) => void | Promise<void>;
  /** Extra content drawn over the viewfinder, under the top bar (e.g. a framing hint). */
  overlay?: React.ReactNode;
  /** Accessible title of the dialog (default: "Camera"). */
  title?: string;
  /** Start with the rear (default) or front camera. */
  facing?: 'environment' | 'user';
  /** Burn the GPS + time seal into the photo (default true). */
  seal?: boolean;
};

type Mode = 'starting' | 'live' | 'fallback' | 'processing' | 'preview';
type Shot = { capture: CameraCapture; url: string };

export function Camera({ open, onClose, onCapture, overlay, title, facing: initialFacing = 'environment', seal = true }: CameraProps) {
  const mounted = useMounted();
  if (!mounted || !open) return null;
  return createPortal(<CameraModal onClose={onClose} onCapture={onCapture} overlay={overlay} title={title} initialFacing={initialFacing} seal={seal} />, document.body);
}

function CameraModal({
  onClose,
  onCapture,
  overlay,
  title,
  initialFacing,
  seal,
}: Omit<CameraProps, 'open' | 'facing'> & { initialFacing: 'environment' | 'user'; seal: boolean }) {
  const { f } = useCz();
  const t = useTranslations('act.camera');
  const { device } = useLocation();
  const titleId = useId();
  const root = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const stream = useRef<MediaStream | null>(null);

  const [mode, setMode] = useState<Mode>(() => (liveCameraSupport() ? 'fallback' : 'starting'));
  const [issue, setIssue] = useState<CameraIssue | null>(() => liveCameraSupport());
  const [facing, setFacing] = useState(initialFacing);
  const [canFlip, setCanFlip] = useState(false);
  const [fix, setFix] = useState<Fix | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [shot, setShot] = useState<Shot | null>(null);
  const [busy, setBusy] = useState(false);
  const [hasStream, setHasStream] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const effFix: Fix | null = fix ?? (device ? { lat: device.lat, lng: device.lng, accuracy: null } : null);

  /* Body scroll lock, Escape, focus restore. */
  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null;
    const unlockScroll = lockBodyScroll();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const id = requestAnimationFrame(() => root.current?.focus());
    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener('keydown', onKey);
      unlockScroll();
      prevFocus?.focus?.();
    };
  }, [onClose]);

  /* Clock for the live seal. */
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);

  /* GPS fix while the camera is open (the user opened it to take a sealed photo). */
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    let id: number | null = null;
    try {
      id = navigator.geolocation.watchPosition(
        (p) => setFix({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy ?? null }),
        () => {},
        { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 },
      );
    } catch {
      // geolocation blocked by policy
    }
    return () => {
      if (id != null) navigator.geolocation.clearWatch(id);
    };
  }, []);

  const stopStream = useCallback(() => {
    stream.current?.getTracks().forEach((tr) => tr.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setHasStream(false);
  }, []);

  /* Live viewfinder. */
  useEffect(() => {
    if (liveCameraSupport()) return;
    let cancelled = false;
    // A pending permission prompt or a stuck driver can leave getUserMedia hanging: offer the file
    // picker after a while (the live view still takes over if the stream arrives later).
    const slow = setTimeout(() => {
      if (!cancelled && !stream.current) {
        setIssue((i) => i ?? 'failed');
        setMode((m) => (m === 'starting' ? 'fallback' : m));
      }
    }, 8000);
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1440 } },
        });
        if (cancelled) {
          s.getTracks().forEach((tr) => tr.stop());
          return;
        }
        stopStream();
        stream.current = s;
        setHasStream(true);
        const v = video.current;
        if (v) {
          v.srcObject = s;
          await v.play().catch(() => {});
        }
        setIssue(null);
        setMode((m) => (m === 'preview' ? m : 'live'));
        navigator.mediaDevices
          .enumerateDevices?.()
          .then((ds) => !cancelled && setCanFlip(ds.filter((d) => d.kind === 'videoinput').length > 1))
          .catch(() => {});
      } catch (e) {
        if (cancelled) return;
        setIssue(cameraIssueFrom(e));
        setMode((m) => (m === 'preview' ? m : 'fallback'));
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(slow);
    };
  }, [facing, stopStream]);

  /* Stop the camera when the modal unmounts. */
  useEffect(() => stopStream, [stopStream]);

  /* Revoke the preview URL when it changes / on unmount. */
  useEffect(() => {
    const url = shot?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [shot]);

  const takeLive = async () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    setErr(null);
    setMode('processing');
    try {
      const at = new Date();
      const r = await captureVideoFrame(v, seal ? effFix : null, at, false);
      setShot({
        url: URL.createObjectURL(r.blob),
        capture: { blob: r.blob, takenAt: at.toISOString(), lat: effFix?.lat ?? null, lng: effFix?.lng ?? null, accuracy: effFix?.accuracy ?? null, source: 'camera', width: r.width, height: r.height },
      });
      setMode('preview');
    } catch {
      setErr(t('unreadable'));
      setMode('live');
    }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErr(null);
    const prev = mode;
    setMode('processing');
    try {
      // The capture=environment picker gives a fresh photo (lastModified ≈ now); a gallery pick keeps its own time.
      const at = file.lastModified ? new Date(Math.min(file.lastModified, Date.now())) : new Date();
      const r = await fileToCapture(file, seal ? effFix : null, at, { stamp: seal });
      setShot({
        url: URL.createObjectURL(r.blob),
        capture: { blob: r.blob, takenAt: at.toISOString(), lat: effFix?.lat ?? null, lng: effFix?.lng ?? null, accuracy: effFix?.accuracy ?? null, source: 'file', width: r.width, height: r.height },
      });
      setMode('preview');
    } catch {
      setErr(t('unreadable'));
      setMode(prev === 'preview' ? 'fallback' : prev);
    }
  };

  const pickFile = () => fileInput.current?.click();

  const retake = () => {
    setShot(null);
    setErr(null);
    setMode(hasStream ? 'live' : 'fallback');
  };

  const confirm = async () => {
    if (!shot) return;
    setBusy(true);
    try {
      await onCapture(shot.capture);
    } finally {
      setBusy(false);
    }
  };

  const fixText = formatFix(effFix);
  const sealLine = `${fixText ?? t('locating')} · ${formatStampTime(shot ? new Date(shot.capture.takenAt) : now)}`;
  const live = mode === 'live' || (mode === 'processing' && hasStream);
  const issueText = issue ? t(`issue.${issue}`) : null;

  return (
    <div
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      dir={f.rtl ? 'rtl' : 'ltr'}
      className="cz-camera"
      style={{ position: 'fixed', inset: 0, zIndex: 80, backgroundColor: '#000', display: 'flex', justifyContent: 'center', outline: 'none' }}>
      <h2 id={titleId} className="sr-only">
        {title ?? t('title')}
      </h2>
      <View style={{ position: 'relative', width: '100%', maxWidth: 640, height: '100%', overflow: 'hidden', backgroundColor: '#000' }}>
        {/* Viewfinder */}
        <video
          ref={video}
          playsInline
          muted
          autoPlay
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: facing === 'user' ? 'scaleX(-1)' : undefined,
            opacity: live && !shot ? 1 : 0,
            transition: 'opacity 200ms',
          }}
        />

        {/* Fallback panel (no live camera) */}
        {(mode === 'fallback' || (mode === 'processing' && !hasStream)) && !shot ? (
          <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14, background: `radial-gradient(120% 80% at 50% 40%, ${B.photoBg2} 0%, ${B.navy} 70%)` }}>
            <View style={{ width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(172,236,0,0.14)', borderWidth: 1, borderColor: 'rgba(172,236,0,0.45)' }}>
              <Icon d={I.camera} size={30} color={B.lime} sw={1.8} />
            </View>
            <Txt size={16} w={600} center color={B.white} style={{ maxWidth: 300 }}>
              {t('fallbackTitle')}
            </Txt>
            {issueText ? (
              <Txt size={12.5} center color="rgba(255,255,255,0.72)" style={{ maxWidth: 320 }}>
                {issueText}
              </Txt>
            ) : null}
            <CzButton label={t('takePhoto')} icon="camera" size="md" onPress={pickFile} busy={mode === 'processing'} style={{ minWidth: 220 }} />
          </View>
        ) : null}

        {mode === 'starting' && !shot ? (
          <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <Spinner size="large" color={B.lime} label={t('starting')} />
            <Txt size={12.5} color="rgba(255,255,255,0.75)">
              {t('starting')}
            </Txt>
          </View>
        ) : null}

        {/* Preview */}
        {shot ? (
          // eslint-disable-next-line @next/next/no-img-element -- local object URL
          <img src={shot.url} alt={t('previewAlt')} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', backgroundColor: '#000' }} />
        ) : null}

        {/* Scrims */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0) 68%, rgba(0,0,0,0.7) 100%)',
          }}
        />

        {/* Framing brackets */}
        {live && !shot ? (
          <>
            <Bracket v="top" h="start" />
            <Bracket v="top" h="end" />
            <Bracket v="bottom" h="start" />
            <Bracket v="bottom" h="end" />
          </>
        ) : null}

        {/* Top bar */}
        <View style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 12px)', start: 16, end: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <IconBtn d={I.close} label={t('close')} tone="glass" onPress={onClose} />
          {seal ? (
            <View style={{ height: 34, paddingHorizontal: 12, borderRadius: R.pill, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,24,46,0.55)', borderWidth: 1, borderColor: 'rgba(172,236,0,0.6)' }}>
              <Icon d={I.lock} size={14} color={B.lime} sw={2} />
              <Txt size={12} w={600} color={B.lime} lines={1}>
                {t('sealed')}
              </Txt>
            </View>
          ) : null}
        </View>

        {overlay && !shot ? (
          <View style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 68px)', start: 16, end: 16, alignItems: 'center' }}>{overlay}</View>
        ) : null}

        {/* Live seal line */}
        {seal && !shot && mode !== 'fallback' ? (
          <View aria-live="polite" style={{ position: 'absolute', start: 16, end: 16, bottom: 'calc(env(safe-area-inset-bottom, 0px) + 136px)', alignItems: 'center', pointerEvents: 'none' }}>
            <View style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.45)' }}>
              <Txt size={11.5} w={500} num color={B.white} style={{ fontFamily: f.lang === 'en' ? 'ui-monospace, Menlo, Consolas, monospace' : undefined }}>
                {f.loc(sealLine)}
              </Txt>
            </View>
          </View>
        ) : null}

        {err ? (
          <View role="alert" style={{ position: 'absolute', start: 16, end: 16, bottom: 'calc(env(safe-area-inset-bottom, 0px) + 176px)', alignItems: 'center' }}>
            <View style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, backgroundColor: B.red }}>
              <Txt size={12.5} w={600} color={B.white}>
                {err}
              </Txt>
            </View>
          </View>
        ) : null}

        {/* Bottom controls */}
        <View style={{ position: 'absolute', start: 0, end: 0, bottom: 'calc(env(safe-area-inset-bottom, 0px) + 36px)', paddingHorizontal: 24 }}>
          {shot ? (
            <View style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 14, backgroundColor: 'rgba(0,24,46,0.62)' }}>
                <Icon d={I.check} size={16} sw={2.4} color={B.lime} />
                <Txt size={12.5} w={600} color={B.white}>
                  {seal ? t('captured') : t('capturedPlain')}
                </Txt>
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Tap
                  label={t('retake')}
                  onPress={retake}
                  disabled={busy}
                  style={{ flex: 1, height: 56, borderRadius: R.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: B.glass, borderWidth: 1, borderColor: B.glassLine }}>
                  <Txt size={15} w={600} color={B.white}>
                    {t('retake')}
                  </Txt>
                </Tap>
                <CzButton label={t('usePhoto')} icon="check" onPress={confirm} busy={busy} style={{ flex: 1.4 }} />
              </View>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' }}>
              <Tap
                label={t('upload')}
                onPress={pickFile}
                style={{ width: 48, height: 48, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.45)', alignItems: 'center', justifyContent: 'center' }}>
                <Icon d={I.plus} size={18} color="rgba(255,255,255,0.85)" sw={2} />
              </Tap>
              <Tap
                label={t('shutter')}
                haptic
                onPress={live ? takeLive : pickFile}
                disabled={mode === 'processing' || mode === 'starting'}
                style={{ width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: B.white, padding: 4 }}>
                <View style={{ flex: 1, borderRadius: 32, backgroundColor: mode === 'processing' ? B.lime : B.white, alignItems: 'center', justifyContent: 'center' }}>
                  {mode === 'processing' ? <Spinner color={B.limeInk} /> : null}
                </View>
              </Tap>
              <IconBtn
                d={I.flip}
                label={t('flip')}
                tone="glass"
                iconSize={20}
                disabled={!live || !canFlip}
                onPress={() => {
                  setMode('starting');
                  setFacing((x) => (x === 'environment' ? 'user' : 'environment'));
                }}
                style={{ borderWidth: 0, opacity: live && canFlip ? 1 : 0.35 }}
              />
            </View>
          )}
        </View>

        <input ref={fileInput} type="file" accept="image/*" capture="environment" onChange={onFile} hidden aria-hidden tabIndex={-1} />
      </View>
    </div>
  );
}

/** One L-shaped viewfinder corner (30 × 30, 3 px lime stroke), placed like the prototype. */
export function Bracket({ v, h }: { v: 'top' | 'bottom'; h: 'start' | 'end' }) {
  return (
    <View
      aria-hidden
      style={{
        position: 'absolute',
        pointerEvents: 'none',
        top: v === 'top' ? '21.4%' : undefined,
        bottom: v === 'bottom' ? '23.2%' : undefined,
        start: h === 'start' ? '17.4%' : undefined,
        end: h === 'end' ? '17.4%' : undefined,
        width: 30,
        height: 30,
        borderColor: B.lime,
        borderStyle: 'solid',
        borderTopWidth: v === 'top' ? 3 : 0,
        borderBottomWidth: v === 'bottom' ? 3 : 0,
        borderStartWidth: h === 'start' ? 3 : 0,
        borderEndWidth: h === 'end' ? 3 : 0,
        borderTopStartRadius: v === 'top' && h === 'start' ? 2 : 0,
        borderTopEndRadius: v === 'top' && h === 'end' ? 2 : 0,
        borderBottomStartRadius: v === 'bottom' && h === 'start' ? 2 : 0,
        borderBottomEndRadius: v === 'bottom' && h === 'end' ? 2 : 0,
      }}
    />
  );
}
