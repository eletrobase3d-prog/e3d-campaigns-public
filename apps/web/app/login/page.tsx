import { LoginForm } from '../../components/LoginForm';
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ access?: string }> }) {
 const query = await searchParams;
 return <main className="login-wrap"><section className="card login-card"><div className="brand">E3D Campaigns</div>{query.access === 'expired' && <p role="alert">Sua sessão expirou ou seu acesso não está mais disponível. Entre novamente ou contate o administrador.</p>}<p className="muted">Entre no painel administrativo.</p><LoginForm/></section></main>;
}
