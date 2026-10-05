 'use client';
import { useRef, useState } from 'react';
import { notifyAction, useActionFeedback } from './ActionFeedback';
export function LogoutButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useActionFeedback();
  const submitting = useRef(false);
  async function logout() {
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setError('');
    try {
      const response = await fetch('/api/session/logout', { method: 'POST' });
      if (!response.ok) throw new Error('Logout failed');
      notifyAction('Você saiu da sua conta.', true);
      window.location.href = '/login';
    } catch { setError('Não foi possível confirmar a saída. Tente novamente.'); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <div><button className="btn secondary" onClick={logout} disabled={busy} aria-busy={busy}>{busy ? 'Saindo...' : 'Sair'}</button>{error && <p role="alert">{error}</p>}</div>;
}
