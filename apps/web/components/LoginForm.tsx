'use client';
import { FormEvent, useRef, useState } from 'react';
import { notifyAction, useActionFeedback } from './ActionFeedback';

export function LoginForm() {
  const [error, setError] = useActionFeedback();
  const submitting = useRef(false);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setError('');
    setLoading(true);
    const form = new FormData(event.currentTarget);

    try {
    const response = await fetch('/api/session/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: form.get('email'), password: form.get('password') }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.message || 'Falha no login.');
      setLoading(false);
      return;
    }
    notifyAction('Login realizado.', true);
    window.location.href = '/';
    } catch {
      setError('Não foi possível confirmar a operação. Verifique a conexão antes de tentar novamente.');
    } finally { submitting.current = false; setLoading(false); }
  }

  return <form onSubmit={submit}>
    <div className="field"><label className="label">E-mail</label><input className="input" type="email" name="email" required /></div>
    <div className="field"><label className="label">Senha</label><input className="input" type="password" name="password" required /></div>
    <button className="btn" style={{width:'100%'}} disabled={loading}>{loading ? 'Entrando...' : 'Entrar'}</button>
    {error ? <div role="alert" className="error">{error}</div> : null}
  </form>;
}
