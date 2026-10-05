import Link from 'next/link';
import { currentAccess } from '../../../lib/access';
import { CreateCampaignForm } from '../../../components/CreateCampaignForm';
export default async function NewCampaignPage() {
 const access = await currentAccess();
 return <main className="container"><div className="nav"><div className="brand">Nova campanha</div><Link className="btn secondary" href="/">Voltar</Link></div>{access.canManage ? <CreateCampaignForm/> : <p role="alert">Seu perfil permite apenas consultas. Você não pode criar campanhas.</p>}</main>;
}
