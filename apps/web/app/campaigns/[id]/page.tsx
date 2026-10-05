import Link from 'next/link';
import { currentAccess } from '../../../lib/access';
import { redirect } from 'next/navigation';
import { serverApi } from '../../../lib/api';
import { CampaignManagement } from '../../../components/CampaignManagement';
import { ReferralReview } from '../../../components/ReferralReview';
import { CampaignLinkButton } from '../../../components/CampaignLinkButton';

export default async function CampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const access = await currentAccess();
  const { id } = await params;

  const campaignResponse = await serverApi(`/campaigns/${id}`);
  if (campaignResponse.status === 401) redirect('/login');

  if (!campaignResponse.ok) {
    return (
      <main className="container">
        <Link className="btn secondary" href="/">Voltar</Link>
        <div className="card" style={{ marginTop: 16 }}>
          Campanha não encontrada.
        </div>
      </main>
    );
  }

  const campaign = await campaignResponse.json();

  const [pRes, rRes, rankRes, clicksRes] = await Promise.all([
    serverApi(`/campaigns/${id}/participants`),
    serverApi(`/campaigns/${id}/referrals`),
    fetch(
      `${process.env.API_INTERNAL_URL || 'http://api:3000/api/v1'}/public/campaigns/~${campaign.id}/ranking`,
      { cache: 'no-store' },
    ),
    serverApi(`/campaigns/${id}/clicks`),
  ]);

  const clicks: { total: number; participants: { participantId: string; clicks: number }[] } | null = clicksRes.ok ? await clicksRes.json() : null;
  const clicksByParticipant = new Map(clicks?.participants.map(p => [p.participantId, p.clicks]) || []);
  const participants = pRes.ok ? await pRes.json() : [];
  const referrals = rRes.ok ? await rRes.json() : [];
  const ranking = rankRes.ok ? (await rankRes.json()).ranking : [];

  return (
    <main className="container">
      <div className="nav">
        <div>
          <div className="brand">{campaign.name}</div>
          <div className="muted">{campaign.slug}</div>
          <CampaignLinkButton campaignId={campaign.id} />
        </div>
        <Link className="btn secondary" href="/">Voltar</Link>
      </div>

      <div className="grid" style={{ marginBottom: 22 }}>
        <div className="card">
          <div className="muted">Status</div>
          <div className="kpi" style={{ fontSize: 20 }}>{campaign.status}</div>
        </div>
        <div className="card">
          <div className="muted">Participantes</div>
          <div className="kpi">{participants.length}</div>
        </div>
        <div className="card">
          <div className="muted">Indicações</div>
          <div className="kpi">{referrals.length}</div>
        </div>
      </div>

      <div className="grid">
        <section className="card">
          <h2>Ranking</h2>
          <table className="table">
            <thead><tr><th>#</th><th>Participante</th><th>Score</th></tr></thead>
            <tbody>
              {ranking.map((item: any) => (
                <tr key={item.participantId}>
                  <td>{item.position}</td>
                  <td>{item.name}</td>
                  <td>{item.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card">
          <h2>Participantes</h2>
          <table className="table">
            <thead><tr><th>Nome</th><th>Código</th><th>Indicações</th><th>Cliques registrados</th></tr></thead>
            <tbody>
              {participants.map((participant: any) => (
                <tr key={participant.id}>
                  <td>{participant.name}<div className="muted">{participant.phone || participant.email || ''}</div></td>
                  <td>{participant.referralCode}<div className="muted" style={{ overflowWrap: 'anywhere' }}>Endereço: /r/~{participant.id}</div></td>
                  <td>{participant._count?.referralsMade ?? 0}</td>
                  <td>{clicks ? clicksByParticipant.get(participant.id) || 0 : 'Indisponível'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <section className="card"><h2>Cliques de indicação registrados</h2><p>{clicks ? clicks.total : 'Contagem indisponível'}</p><p className="muted">Cliques registrados desde esta atualização. Não representam pessoas únicas e não dão pontos.</p></section>

      <ReferralReview campaignId={id} referrals={referrals} canManage={access.canManage} />

      <CampaignManagement campaign={campaign} canManage={access.canManage} />
    </main>
  );
}
