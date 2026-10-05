'use client';

import { useRef, useState } from 'react';
import { useActionFeedback } from './ActionFeedback';

export function CampaignLinkButton({ campaignId }: { campaignId: string }) {
  const [message, setMessage] = useActionFeedback();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);

  async function generate() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage('');
    const address = new URL(`/c/~${encodeURIComponent(campaignId)}`, window.location.origin).href;
    setUrl(address);
    // Start both browser operations during the user gesture, before awaiting either.
    let copy: Promise<boolean>;
    try { copy = navigator.clipboard.writeText(address).then(() => true, () => false); }
    catch { copy = Promise.resolve(false); }
    let opened = false;
    let tab: Window | null = null;
    try {
      tab = window.open('about:blank', '_blank');
      if (tab) {
        tab.opener = null;
        tab.location.replace(address);
        opened = true;
      }
    } catch { try { tab?.close(); } catch { /* Manual link remains available. */ } }
    try {
      const copied = await copy;
      setMessage((copied ? 'Link copiado!' : 'Não foi possível copiar automaticamente. Copie o endereço abaixo.') +
        (opened ? '' : ' Não foi possível abrir a nova aba. Use Abrir página.'));
    } finally { pending.current = false; setBusy(false); }
  }

  return <div style={{ marginTop: 12 }}>
    <button className="btn" type="button" disabled={busy} onClick={generate}>Gerar link de indicação</button>
    <p role="status" aria-live="polite">{busy ? 'Copiando link…' : message}</p>
    {url && <div>
      <label className="label" htmlFor="campaign-public-link">Link público da campanha</label>
      <input id="campaign-public-link" className="input" value={url} readOnly onFocus={event => event.currentTarget.select()} />
      <a href={url} target="_blank" rel="noopener noreferrer">Abrir página</a>
    </div>}
  </div>;
}
