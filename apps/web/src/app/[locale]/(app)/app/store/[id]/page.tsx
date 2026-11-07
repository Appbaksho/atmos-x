import { ProductPage } from '@/components/store/product';

/** S6–S9 · One product: details, redeem, voucher. */
export default async function Page({ params }: PageProps<'/[locale]/app/store/[id]'>) {
  const { id } = await params;
  return <ProductPage id={decodeURIComponent(id)} />;
}
