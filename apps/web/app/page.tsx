import Link from 'next/link';
import { currentAccess } from '../lib/access';
import { redirect } from 'next/navigation';
import { LogoutButton } from '../components/LogoutButton';
import { serverApi } from '../lib/api';

type Campaign = { id:string; name:string; slug:string; status:string; _count?:{participants:number;referrals:number} };

export default async function DashboardPage() {
  const access = await currentAccess();
  const response = await serverApi('/campaigns');
  if (response.status === 401) redirect('/login');
  if (!response.ok) return <main className="container"><div className="card"><h1>Falha ao carregar o painel</h1><p className="muted">Status {response.status}</p></div></main>;

  const campaigns: Campaign[] = await response.json();
  const totalParticipants = campaigns.reduce((a,c)=>a+(c._count?.participants??0),0);
  const totalReferrals = campaigns.reduce((a,c)=>a+(c._count?.referrals??0),0);

  return <main className="container">
    <div className="nav">
      <div><div className="brand">E3D Campaigns</div><div className="muted">Painel administrativo</div></div>
      <div className="row">{access.canManage && <Link className="btn" href="/campaigns/new">Nova campanha</Link>}<LogoutButton/></div>
    </div>
    <div className="grid" style={{marginBottom:22}}>
      <div className="card"><div className="muted">Campanhas</div><div className="kpi">{campaigns.length}</div></div>
      <div className="card"><div className="muted">Participantes</div><div className="kpi">{totalParticipants}</div></div>
      <div className="card"><div className="muted">Indicações</div><div className="kpi">{totalReferrals}</div></div>
    </div>
    {!access.canManage && <p role="status">Seu perfil permite apenas consultas.</p>}
    <section className="card"><h2>Campanhas</h2>
      {campaigns.length===0?<p className="muted">Nenhuma campanha criada ainda.</p>:
      <table className="table"><thead><tr><th>Campanha</th><th>Status</th><th>Participantes</th><th>Indicações</th></tr></thead><tbody>
      {campaigns.map(c=><tr key={c.id}><td><Link href={`/campaigns/${c.id}`}><strong>{c.name}</strong><div className="muted">{c.slug}</div></Link></td><td><span className="badge">{c.status}</span></td><td>{c._count?.participants??0}</td><td>{c._count?.referrals??0}</td></tr>)}
      </tbody></table>}
    </section>
  </main>;
}
