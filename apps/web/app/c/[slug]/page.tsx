import { formatFixedOffset, displayTimezone } from '../../../lib/date-time';
import { ReferralClick } from '../../../components/public/ReferralClick';
import { notFound } from 'next/navigation';
import { PublicRegisterForm } from '../../../components/public/PublicRegisterForm';

const internalApi =
  process.env.API_INTERNAL_URL || 'http://api:3000/api/v1';

function money(value: unknown) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  if (Number.isNaN(number)) return null;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(number);
}

export default async function PublicCampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ref?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;

  const [campaignResponse, rankingResponse] = await Promise.all([
    fetch(`${internalApi}/public/campaigns/${slug}`, { cache: 'no-store' }),
    fetch(`${internalApi}/public/campaigns/${slug}/ranking`, {
      cache: 'no-store',
    }),
  ]);

  if (campaignResponse.status === 404) notFound();

  if (!campaignResponse.ok) return <main className="public-page"><h1>Link indisponível</h1><p>{campaignResponse.status === 409 ? "Este link antigo é ambíguo. Solicite o link atualizado da campanha." : "Não foi possível abrir a campanha. Tente novamente."}</p></main>;
  const campaign = await campaignResponse.json();
  const hasReferral = query.ref !== undefined;
  let referrer: { name: string; referralCode: string; ticket: string | null } | null = null;
  if (hasReferral && typeof query.ref === 'string' && query.ref.trim()) {
    try {
      const response = await fetch(`${internalApi}/public/campaigns/${encodeURIComponent(campaign.publicKey)}/referrer/${encodeURIComponent(query.ref)}`, { cache: 'no-store' });
      if (response.ok) referrer = await response.json();
    } catch { /* Show a clear attribution error instead of assigning a different participant. */ }
  }
  const rankingData = rankingResponse.ok
    ? await rankingResponse.json()
    : { ranking: [] };

  const isActive = campaign.status === 'ACTIVE';
  const now = new Date();
  const hasStarted = !campaign.startsAt || new Date(campaign.startsAt) <= now;
  const hasNotEnded = !campaign.endsAt || new Date(campaign.endsAt) > now;
  const canRegister = isActive && hasStarted && hasNotEnded;

  return (
    <main className="public-page">
      <section className="public-hero">
        <div className="public-shell">
          <span className="public-kicker">E3D Campaigns</span>
          <h1>{campaign.title || campaign.name}</h1>
          {campaign.status === 'SCHEDULED' && <p>Campanha agendada para {formatFixedOffset(campaign.startsAt)} {displayTimezone}. As inscrições serão liberadas após a ativação. Atualize a página depois do horário previsto.</p>}
          {campaign.subtitle ? <p>{campaign.subtitle}</p> : null}
          {campaign.description ? (
            <div className="public-description">{campaign.description}</div>
          ) : null}

          <div className="public-stats">
            <div>
              <strong>{campaign._count?.participants ?? 0}</strong>
              <span>participantes</span>
            </div>
            <div>
              <strong>{campaign._count?.referrals ?? 0}</strong>
              <span>indicações válidas</span>
            </div>
            <div>
              <strong>{campaign.status}</strong>
              <span>status</span>
            </div>
          </div>
        </div>
      </section>

      <div className="public-shell public-layout">
        <div>
          {campaign.rewards?.length ? (
            <section className="public-card">
              <h2>Prêmios</h2>
              <div className="public-rewards">
                {campaign.rewards.map((reward: any) => (
                  <div className="public-reward" key={reward.id}>
                    <div className="public-position">
                      {reward.positionStart || '—'}
                      {reward.positionEnd &&
                      reward.positionEnd !== reward.positionStart
                        ? `–${reward.positionEnd}`
                        : ''}
                    </div>
                    <div>
                      <strong>{reward.title}</strong>
                      {reward.description ? (
                        <p>{reward.description}</p>
                      ) : null}
                      {money(reward.monetaryValue) ? (
                        <span>{money(reward.monetaryValue)}</span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="public-card">
            <h2>Ranking</h2>
            {rankingData.ranking?.length ? (
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Participante</th>
                    <th>Indicações</th>
                  </tr>
                </thead>
                <tbody>
                  {rankingData.ranking.slice(0, 20).map((item: any) => (
                    <tr key={item.participantId}>
                      <td>{item.position}</td>
                      <td>{item.name}</td>
                      <td>{item.score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="public-muted">
                O ranking será exibido quando começarem as indicações.
              </p>
            )}
          </section>
        </div>

        <aside>
          {canRegister && hasReferral && !referrer ? <div className="public-card" role="alert"><h2>Indicação indisponível</h2><p>Não foi possível confirmar quem indicou você nesta campanha. Confira o link recebido ou tente novamente.</p></div> : canRegister ? (
            <>
            {referrer && <ReferralClick ticket={referrer.ticket} />}
            <PublicRegisterForm
              slug={campaign.publicKey}
              referredByCode={referrer?.referralCode}
              referrerName={referrer?.name}
              campaignTitle={campaign.title || campaign.name}
              requirePhone={campaign.rules?.requireUniquePhone}
              requireEmail={campaign.rules?.requireUniqueEmail}
            />
            </>
          ) : (
            <div className="public-card">
              <h2>Inscrições indisponíveis</h2>
              <p className="public-muted">
                Esta campanha não está aberta para novos cadastros neste momento.
              </p>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
