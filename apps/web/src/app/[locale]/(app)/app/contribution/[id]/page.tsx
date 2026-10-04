import { ContributionScreen } from '@/components/act/contribution';

/** S15 · Contribution card for a logged action. */
export default async function Page({ params }: PageProps<'/[locale]/app/contribution/[id]'>) {
  const { id } = await params;
  return <ContributionScreen id={decodeURIComponent(id)} />;
}
