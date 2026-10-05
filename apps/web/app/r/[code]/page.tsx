import { notFound, redirect } from 'next/navigation';

const internalApi =
  process.env.API_INTERNAL_URL || 'http://api:3000/api/v1';

export default async function ReferralPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;

  const response = await fetch(
    `${internalApi}/public/referrals/${encodeURIComponent(code)}`,
    { cache: 'no-store' },
  );

  if (response.status === 404) notFound();
  if (!response.ok) return <main className="public-page"><h1>Link indisponível</h1><p>{response.status === 409 ? "Este link antigo é ambíguo. Solicite o link atualizado de indicação." : "Não foi possível abrir a indicação. Tente novamente."}</p></main>;

  const referral = await response.json();

  redirect(
    `/c/${referral.campaign.publicKey}?ref=${encodeURIComponent(
      referral.referralCode,
    )}`,
  );
}
