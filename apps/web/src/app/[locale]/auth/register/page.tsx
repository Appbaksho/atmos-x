import { AuthScreen } from '@/components/auth/auth-screen';

/** /auth/register · local account (v0: lives on this device). */
export default async function Page({ searchParams }: PageProps<'/[locale]/auth/register'>) {
  const sp = await searchParams;
  const next = Array.isArray(sp.next) ? sp.next[0] : sp.next;
  return <AuthScreen mode="register" next={next ?? null} />;
}
