'use client';
import { useActionFeedback, notifyAction } from '../ActionFeedback';

import { FormEvent, useRef, useState } from 'react';

type Props = {
  slug: string;
  referredByCode?: string;
  referrerName?: string;
  campaignTitle: string;
  requirePhone?: boolean;
  requireEmail?: boolean;
};

export function PublicRegisterForm({
  slug,
  referredByCode,
  referrerName,
  campaignTitle,
  requirePhone,
  requireEmail,
}: Props) {
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useActionFeedback();
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useActionFeedback();
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [manualLink, setManualLink] = useState('');
  const submitting = useRef(false);
  const copyingRef = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setError('');
    setLoading(true);

    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch(`/api/public/campaigns/${encodeURIComponent(slug)}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.get('name'),
          phone: form.get('phone') || undefined,
          email: form.get('email') || undefined,
          referredByCode: referredByCode || undefined,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message = Array.isArray(data.message)
          ? data.message.join(', ')
          : data.message || 'Não foi possível concluir o cadastro.';
        setError(message);
        return;
      }

      setResult(data); notifyAction('Cadastro concluído!');
    } catch {
      setError('Não foi possível confirmar o cadastro. Verifique sua conexão antes de tentar novamente.');
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }

  function shareWhatsapp() {
    if (!result) return;
    const referralUrl = `${window.location.origin}${result.referralPath}`;
    const text = `Participe de ${campaignTitle} usando meu link: ${referralUrl}`;
    setCopied(false);
    setFeedback('Continue o envio na janela do WhatsApp. Se ela não abrir, use Copiar link.');
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  }

  async function copyLink() {
    if (!result || copyingRef.current) return;
    copyingRef.current = true;
    setCopying(true);
    setCopied(false);
    setFeedback('');
    setManualLink('');
    const referralUrl = `${window.location.origin}${result.referralPath}`;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(referralUrl);
      setCopied(true);
      setFeedback('Link copiado! Agora é só colar e compartilhar.');
    } catch {
      setManualLink(referralUrl);
      setFeedback('Não foi possível copiar automaticamente. Selecione o link abaixo e copie manualmente.');
    } finally {
      copyingRef.current = false;
      setCopying(false);
    }
  }

  if (result) {
    return (
      <div className="public-success">
        <h2>Cadastro concluído!</h2>
        {result.referralStatus === 'PENDING' && <p>Sua indicação está pendente de validação e ainda não pontua no ranking.</p>}
        <p>
          Seu código de indicação é <strong>{result.referralCode}</strong>.
        </p>
        <p className="public-muted">
          Compartilhe seu link para convidar outras pessoas.
        </p>
        <div className="public-actions">
          <button type="button" className="public-btn" onClick={shareWhatsapp} disabled={copying}>
            Compartilhar no WhatsApp
          </button>
          <button type="button" className="public-btn secondary" onClick={copyLink} disabled={copying} aria-busy={copying}>
            {copying ? 'Copiando...' : copied ? 'Copiado!' : 'Copiar link'}
          </button>
        </div>
        <p role="status" aria-live="polite" aria-atomic="true">{feedback}</p>
        {manualLink && <div className="field">
          <label className="label" htmlFor="manual-referral-link">Seu link de indicação</label>
          <input id="manual-referral-link" className="input" value={manualLink} readOnly onFocus={event => event.currentTarget.select()} />
        </div>}
      </div>
    );
  }

  return (
    <form className="public-card" onSubmit={submit}>
      <h2>Quero participar</h2>

      {referredByCode ? (
        <div className="public-ref-badge">
          Você foi indicado por <strong>{referrerName}</strong><br />Código de indicação: <strong>{referredByCode}</strong>
        </div>
      ) : null}

      <div className="field">
        <label className="label">Nome *</label>
        <input className="input" name="name" required minLength={2} />
      </div>

      <div className="field">
        <label className="label">WhatsApp / telefone{requirePhone ? ' *' : ''}</label>
        <input className="input" name="phone" required={requirePhone} />
      </div>

      <div className="field">
        <label className="label">E-mail{requireEmail ? ' *' : ''}</label>
        <input className="input" name="email" type="email" required={requireEmail} />
      </div>

      <button className="public-btn" disabled={loading} aria-busy={loading}>
        {loading ? 'Cadastrando...' : 'Participar agora'}
      </button>

      <div role="status" aria-live="polite">{loading ? 'Enviando seu cadastro. Aguarde...' : ''}</div>
      {error ? <div className="error" role="alert">{error}</div> : null}
    </form>
  );
}
