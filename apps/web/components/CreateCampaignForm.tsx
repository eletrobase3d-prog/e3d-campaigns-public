'use client';
import { FormEvent, useRef, useState } from 'react';
import { notifyAction, useActionFeedback } from './ActionFeedback';

export function CreateCampaignForm() {
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
    const response = await fetch('/api/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.get('name'),
        title: form.get('title') || undefined,
        subtitle: form.get('subtitle') || undefined,
        description: form.get('description') || undefined,
        maxParticipants: form.get('maxParticipants') ? Number(form.get('maxParticipants')) : undefined,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.message || 'Não foi possível criar a campanha.');
      setLoading(false);
      return;
    }
    notifyAction('Campanha criada.', true);
    window.location.href = `/campaigns/${data.id}`;
    } catch {
      setError('Não foi possível confirmar a operação. Verifique a conexão antes de tentar novamente.');
    } finally { submitting.current = false; setLoading(false); }
  }

  return <form onSubmit={submit} className="card">
    <div className="field"><label className="label">Nome *</label><input className="input" name="name" required /></div>
    <div className="field"><label className="label">Título público</label><input className="input" name="title" /></div>
    <div className="field"><label className="label">Subtítulo</label><input className="input" name="subtitle" /></div>
    <div className="field"><label className="label">Descrição</label><textarea className="textarea" name="description" rows={5} /></div>
    <div className="field"><label className="label">Máximo de participantes</label><input className="input" name="maxParticipants" type="number" min="1" /></div>
    <button className="btn" disabled={loading}>{loading ? 'Criando...' : 'Criar campanha'}</button>
    {error ? <div role="alert" className="error">{error}</div> : null}
  </form>;
}
