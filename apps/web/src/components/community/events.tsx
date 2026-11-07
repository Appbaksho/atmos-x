'use client';
/**
 * C10 · Planting drives: date, place, RSVP, check-in at the spot (GPS within 300 m, from 2 h before to
 * 2 h after), group photo, optional sponsor. `EventsSection` is the preview on the community hub.
 */
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

import { B, BottomSheet, Card, CzButton, EmptyState, ErrorState, Field, GhostButton, I, Icon, Label, Note, Photo, R, Screen, ScreenHeader, Seg, SkeletonCard, Tap, Txt, View, go, href, requireAccount, toast, useCz, useLocation } from '@/components/cz';
import { isGuestRestricted, useCreateEvent, useEvent, useEventCheckin, useEventPhoto, useEvents, useRsvp, useSession, useTeams } from '@/lib/data/hooks';
import type { CommunityEvent } from '@/lib/data/types';

function useEventError() {
  const t = useTranslations('community.events.err');
  return (e: unknown) => {
    const code = (e as { code?: string })?.code ?? '';
    const key = code.replace(/^event\./, '');
    return t.has(key) ? t(key) : t('generic');
  };
}

export function EventsSection() {
  const t = useTranslations('community.events');
  const { focus } = useLocation();
  const q = useEvents(focus);
  const list = (q.data ?? []).slice(0, 3);
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4 }}>
        <Txt display size={16} as="h2">
          {t('title')}
        </Txt>
        <Tap label={t('all')} href={href('events')} style={{ minHeight: 36, justifyContent: 'center', paddingHorizontal: 6 }}>
          <Txt size={12.5} w={600}>
            {t('all')}
          </Txt>
        </Tap>
      </View>
      {q.isPending ? <SkeletonCard lines={2} height={100} /> : q.isError ? <ErrorState compact error={q.error} /> : list.length ? list.map((e) => <EventRow key={e.id} e={e} />) : <Card><Txt size={13} dim>{t('none')}</Txt></Card>}
    </View>
  );
}

function EventRow({ e }: { e: CommunityEvent }) {
  const t = useTranslations('community.events');
  const { c, f } = useCz();
  return (
    <Tap label={e.title} href={href('event', { id: e.id })} style={{ backgroundColor: c.card, borderRadius: R.xl, padding: 14, flexDirection: 'row', gap: 12, alignItems: 'center', textAlign: 'start' }}>
      <View style={{ width: 52, borderRadius: 12, backgroundColor: B.navy, alignItems: 'center', paddingVertical: 6 }}>
        <Txt size={11} w={600} color={B.lime}>
          {f.date(e.starts_at, { month: 'short' })}
        </Txt>
        <Txt size={20} w={700} num color={B.white}>
          {f.date(e.starts_at, { day: 'numeric' })}
        </Txt>
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Txt size={14} w={600} lines={1}>
          {e.title}
        </Txt>
        <Txt size={12} dim lines={1}>
          {`${f.date(e.starts_at, { weekday: 'short', hour: '2-digit', minute: '2-digit' })} · ${e.place_name}`}
        </Txt>
        <Txt size={11.5} dim>
          {t('going', { count: e.going, n: f.loc(e.going) }) + (e.my_rsvp === 'going' ? ` · ${t('youGoing')}` : '')}
        </Txt>
      </View>
      <Icon d={f.fwdPath} size={16} sw={2} />
    </Tap>
  );
}

export function EventsPage() {
  const t = useTranslations('community.events');
  const session = useSession();
  const { focus } = useLocation();
  const [past, setPast] = useState(false);
  const [creating, setCreating] = useState(false);
  const q = useEvents(focus, past);
  return (
    <Screen>
      <ScreenHeader title={t('title')} sub={t('sub')} right={<GhostButton label={t('create')} height={40} onPress={() => (session.isGuest ? requireAccount(t('feature')) : setCreating(true))} style={{ paddingHorizontal: 14 }} />} />
      <Seg value={past ? 'past' : 'upcoming'} onChange={(v) => setPast(v === 'past')} label={t('title')} options={[{ label: t('upcoming'), value: 'upcoming' }, { label: t('past'), value: 'past' }]} />
      {q.isPending ? <SkeletonCard lines={3} height={160} /> : q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : q.data?.length ? q.data.map((e) => <EventRow key={e.id} e={e} />) : <EmptyState icon={I.clock} title={t('none')} sub={t('noneSub')} />}
      {!session.isGuest ? <CreateEventSheet open={creating} onClose={() => setCreating(false)} /> : null}
    </Screen>
  );
}

function CreateEventSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('community.events');
  const { focus, placeName } = useLocation();
  const create = useCreateEvent();
  const teams = useTeams();
  const errText = useEventError();
  const [title, setTitle] = useState('');
  const [place, setPlace] = useState(placeName ?? '');
  const [when, setWhen] = useState('');
  const [hours, setHours] = useState('3');
  const [team, setTeam] = useState<string | null>(null);
  const [cap, setCap] = useState('');
  const [desc, setDesc] = useState('');
  const save = () => {
    if (title.trim().length < 3 || place.trim().length < 2 || !when) return toast(t('fillIn'), { tone: 'warn' });
    const start = new Date(when);
    const h = Math.max(1, Math.min(12, Number(hours) || 3));
    create.mutate(
      {
        title: title.trim(),
        description: desc.trim() || null,
        starts_at: start.toISOString(),
        ends_at: new Date(start.getTime() + h * 3600e3).toISOString(),
        place_name: place.trim(),
        lat: focus.lat,
        lng: focus.lng,
        team_id: team,
        capacity: cap ? Math.max(2, Number(cap)) : null,
      },
      {
        onSuccess: (e) => {
          onClose();
          go('event', { id: e.id });
        },
        onError: (er) => toast(errText(er), { tone: 'warn' }),
      },
    );
  };
  return (
    <BottomSheet open={open} onClose={onClose} title={t('create')} sub={t('createSub')} footer={<CzButton label={t('save')} icon="check" busy={create.isPending} onPress={save} />}>
      <View style={{ gap: 12 }}>
        <Field label={t('titleL')} value={title} onChangeText={setTitle} maxLength={120} placeholder={t('titlePh')} />
        <Field label={t('whenL')} type="datetime-local" value={when} onChangeText={setWhen} />
        <Field label={t('hoursL')} value={hours} onChangeText={setHours} keyboardType="number-pad" maxLength={2} />
        <Field label={t('placeL')} value={place} onChangeText={setPlace} maxLength={200} hint={t('placeHint')} />
        <Field label={t('capL')} value={cap} onChangeText={setCap} keyboardType="number-pad" maxLength={4} />
        {teams.data?.length ? (
          <Seg value={team ?? ''} onChange={(v) => setTeam(v || null)} label={t('teamL')} options={[{ label: t('noTeam'), value: '' }, ...teams.data.map((x) => ({ label: x.name, value: x.id }))]} />
        ) : null}
        <Field label={t('descL')} value={desc} onChangeText={setDesc} multiline maxLength={2000} />
      </View>
    </BottomSheet>
  );
}

export function EventPage({ id }: { id: string }) {
  const t = useTranslations('community.events');
  const q = useEvent(id);
  if (q.isPending) {
    return (
      <Screen>
        <ScreenHeader title={t('title')} />
        <SkeletonCard lines={4} height={240} />
      </Screen>
    );
  }
  if (q.isError || !q.data) {
    return (
      <Screen>
        <ScreenHeader title={t('title')} />
        <EmptyState icon={I.clock} title={t('notFound')} action={t('all')} actionHref={href('events')} />
      </Screen>
    );
  }
  return <EventBody e={q.data} />;
}

function EventBody({ e }: { e: CommunityEvent }) {
  const t = useTranslations('community.events');
  const { c, f } = useCz();
  const session = useSession();
  const rsvp = useRsvp();
  const checkin = useEventCheckin();
  const photo = useEventPhoto();
  const errText = useEventError();
  const file = useRef<HTMLInputElement>(null);
  const [locating, setLocating] = useState(false);
  const guard = (fn: () => void) => () => (session.isGuest ? requireAccount(t('feature')) : fn());

  const doCheckin = () => {
    if (!navigator.geolocation) return toast(t('err.no_gps'), { tone: 'warn' });
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        checkin.mutate(
          { id: e.id, lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy_m: pos.coords.accuracy },
          { onSuccess: () => toast(t('checkedIn'), { tone: 'success' }), onError: (er) => toast(errText(er), { tone: 'warn' }) },
        );
      },
      () => {
        setLocating(false);
        toast(t('err.no_gps'), { tone: 'warn' });
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  return (
    <Screen>
      <ScreenHeader title={e.title} sub={e.place_name} />
      <Card tone="navy" pad={18} gap={10} style={{ borderRadius: R.xxl }}>
        <Txt size={18} w={600} color={B.white}>
          {f.date(e.starts_at, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
        </Txt>
        <Txt size={13} color="rgba(255,255,255,0.85)">
          {[e.place_name, e.team?.name, e.org?.name].filter(Boolean).join(' · ')}
        </Txt>
        <Txt size={12.5} color={B.lime}>
          {t('goingOf', { going: f.loc(e.going), in: f.loc(e.checked_in) }) + (e.capacity ? ` · ${t('capacity', { n: f.loc(e.capacity) })}` : '')}
        </Txt>
        {e.sponsor_name ? (
          <Txt size={12} color="rgba(255,255,255,0.8)">
            {t('sponsor', { name: e.sponsor_name })}
          </Txt>
        ) : null}
        {e.is_demo ? (
          <Txt size={11} w={600} color={B.lime}>
            {t('demo')}
          </Txt>
        ) : null}
      </Card>
      {e.description ? <Txt size={13.5}>{e.description}</Txt> : null}
      <View style={{ gap: 8 }}>
        <Label style={{ paddingHorizontal: 4 }}>{t('rsvp')}</Label>
        <Seg
          value={e.my_rsvp ?? ''}
          onChange={(v) => (v ? guard(() => rsvp.mutate({ id: e.id, status: v as 'going' | 'maybe' | 'no' }, { onError: (er) => toast(errText(er), { tone: 'warn' }) }))() : undefined)}
          label={t('rsvp')}
          options={[
            { label: t('rsvpGoing'), value: 'going' },
            { label: t('rsvpMaybe'), value: 'maybe' },
            { label: t('rsvpNo'), value: 'no' },
          ]}
        />
      </View>
      <Card gap={10}>
        <Txt size={14} w={600}>
          {t('checkinTitle')}
        </Txt>
        <Txt size={12.5} dim>
          {e.checkin_open ? t('checkinOpen') : t('checkinClosed')}
        </Txt>
        {e.i_checked_in ? (
          <Note icon={I.checkSm}>{t('checkedIn')}</Note>
        ) : (
          <CzButton label={t('checkin')} icon="check" size="md" disabled={!e.checkin_open} busy={locating || checkin.isPending} onPress={guard(doCheckin)} />
        )}
      </Card>
      {e.group_photo_url ? <Photo src={e.group_photo_url} label={t('groupPhoto')} style={{ height: 220, borderRadius: R.lg, backgroundColor: B.photoBg2 }} /> : null}
      {e.mine ? (
        <>
          <input
            ref={file}
            type="file"
            accept="image/*"
            hidden
            onChange={(ev) => {
              const fl = ev.target.files?.[0];
              ev.target.value = '';
              if (fl) photo.mutate({ id: e.id, photo: fl }, { onSuccess: () => toast(t('photoSaved'), { tone: 'success' }), onError: (er) => toast(isGuestRestricted(er) ? t('feature') : errText(er), { tone: 'warn' }) });
            }}
          />
          <GhostButton label={e.group_photo_url ? t('replacePhoto') : t('addPhoto')} height={46} disabled={photo.isPending} onPress={() => file.current?.click()} />
        </>
      ) : null}
      <View style={{ height: 4, backgroundColor: c.bg }} />
    </Screen>
  );
}
