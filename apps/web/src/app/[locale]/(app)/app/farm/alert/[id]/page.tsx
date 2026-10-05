import { AlertScreen } from '@/components/farm/alert-screen';

/** F02 · Farm alert detail (V0-7). `?field=<id>` picks the saved field the alert belongs to. */
export default async function Page({ params, searchParams }: PageProps<'/[locale]/app/farm/alert/[id]'>) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const field = typeof sp.field === 'string' ? sp.field : undefined;
  return <AlertScreen id={decodeURIComponent(id)} fieldId={field} />;
}
