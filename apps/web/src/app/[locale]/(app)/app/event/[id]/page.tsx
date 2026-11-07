import { EventPage } from '@/components/community/events';

/** C10 · One event: RSVP, check-in at the spot (GPS within 300 m), group photo. */
export default async function Page({ params }: PageProps<'/[locale]/app/event/[id]'>) {
  const { id } = await params;
  return <EventPage id={decodeURIComponent(id)} />;
}
