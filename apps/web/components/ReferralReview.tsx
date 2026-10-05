'use client';
import { useActionFeedback, notifyAction } from './ActionFeedback';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { displayTimezone, formatFixedOffset } from '../lib/date-time';

type Referral = {
  id: string; status: string; eligibleAt: string | null; rejectionReason: string | null;
  manualReviewRequired: boolean; reviewVersion: number;
  referrer: { name: string }; referred: { name: string } | null;
};
const labels: Record<string, string> = { PENDING: 'Pendente', VALID: 'Válida', INVALID: 'Inválida', FRAUD: 'Fraude', CANCELLED: 'Cancelada' };
type HistoryEvent = { id: string; action: string; actor: string; createdAt: string;
  metadata: { from?: string; to?: string; reason?: string; previousRejectionReason?: string | null } | null };
const actions: Record<string, string> = { 'referral.create': 'Cadastro', 'referral.review.manual': 'Revisão manual',
  'referral.review.automatic': 'Revisão automática', 'referral.reopen': 'Reabertura para análise manual' };

export function ReferralReview({ campaignId, referrals, canManage }: { campaignId: string; referrals: Referral[]; canManage: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState('');
  const [selectedVersion, setSelectedVersion] = useState(0);
  const [reopening, setReopening] = useState(false);
  const [decision, setDecision] = useState('VALID');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useActionFeedback();
  const [filter, setFilter] = useState('ALL');
  const [history, setHistory] = useState<HistoryEvent[] | null>(null);
  const [historyLabel, setHistoryLabel] = useState('');
  const [historyBusy, setHistoryBusy] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const submitting = useRef(false);
  function openReview(referral: Referral) {
    setSelected(referral.id); setSelectedVersion(referral.reviewVersion);
    setReopening(referral.status === 'INVALID');
    setDecision(referral.status === 'PENDING' ? 'VALID' : 'INVALID'); setReason(''); setMessage(referral.status === 'INVALID' ? 'Reavaliação aberta. Informe a justificativa para continuar.' : 'Revisão aberta. Escolha a decisão e informe o motivo.');
  }
  async function showHistory(referral: Referral) {
    setHistoryBusy(true); setHistory(null); setMessage('');
    setHistoryLabel(`${referral.referrer.name} → ${referral.referred?.name || '—'}`);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/referrals/${referral.id}/history`, { cache: 'no-store' });
      if (response.status === 401 || response.status === 403) startRefresh(() => router.refresh());
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Não foi possível consultar o histórico.');
      setHistory(data); setMessage('Histórico carregado.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Falha ao consultar histórico.'); }
    finally { setHistoryBusy(false); }
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/referrals/${selected}/${reopening ? 'reopen' : 'review'}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(reopening ? {} : { status: decision }), reason, expectedVersion: selectedVersion }),
      });
      if (response.status === 401 || response.status === 403) startRefresh(() => router.refresh());
      const data = await response.json();
      if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join(', ') : data.message || 'Revisão não concluída.');
      setSelected(''); setReason(''); setHistory(null);
      setMessage(reopening ? 'Indicação reaberta para análise manual. Ela ainda não pontua. Clique em Revisar para decidir.' : decision === 'INVALID' ? 'Indicação invalidada. Para corrigir essa decisão, clique em Reavaliar.' : decision === 'VALID' ? 'Indicação aprovada. Pontuação atualizada.' : 'Indicação marcada como fraude. Ela não pontua.');
      setFilter(reopening ? 'PENDING' : decision);
      startRefresh(() => router.refresh());
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Falha de conexão. Tente novamente.'); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <section className="card" style={{ marginTop: 16 }}>
    <h2>Revisão de indicações</h2>
    <p className="muted">Somente indicações válidas pontuam. A aprovação respeita o prazo mínimo. Revisões exigem perfil de proprietário, administrador ou gestor.</p>
    <div className="row">
      <label>Filtrar por status <select className="input" value={filter} onChange={e => setFilter(e.target.value)}>
        <option value="ALL">Todas ({referrals.length})</option>
        {Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label} ({referrals.filter(r => r.status === key).length})</option>)}
      </select></label>
      <button className="btn secondary" type="button" disabled={refreshing || busy} onClick={() => {
        setMessage('Atualização solicitada.'); startRefresh(() => router.refresh());
      }}>{refreshing ? 'Atualizando...' : 'Atualizar resultados'}</button>
    </div>
    <div style={{ overflowX: 'auto' }}><table className="table">
      <thead><tr><th>Indicador</th><th>Indicado</th><th>Status</th><th>Elegível a partir de ({displayTimezone})</th><th>Revisão</th></tr></thead>
      <tbody>{referrals.filter(r => filter === 'ALL' || r.status === filter).map(r => <tr key={r.id}>
        <td>{r.referrer.name}</td><td>{r.referred?.name || '—'}</td>
        <td>{labels[r.status] || r.status}{r.status === 'PENDING' && r.manualReviewRequired && <div className="muted">Em reavaliação manual</div>}{r.rejectionReason && <div className="muted">{r.rejectionReason}</div>}</td>
        <td>{formatFixedOffset(r.eligibleAt)}</td>
        <td>{canManage && ['PENDING', 'VALID', 'INVALID'].includes(r.status) && <button className="btn secondary" type="button" disabled={busy || refreshing} onClick={() => openReview(r)}>
          {r.status === 'INVALID' ? 'Reavaliar' : 'Revisar'}</button>}{' '}
          <button className="btn secondary" type="button" disabled={historyBusy || busy} onClick={() => showHistory(r)}>Histórico</button></td>
      </tr>)}</tbody>
    </table></div>
    {!referrals.length && <p>Nenhuma indicação registrada.</p>}
    {canManage && selected && <form onSubmit={submit} style={{ marginTop: 16 }}>
      <p>Revisando: {referrals.find(r => r.id === selected)?.referrer.name} → {referrals.find(r => r.id === selected)?.referred?.name || '—'}</p>
      {reopening ? <p>Motivo anterior: {referrals.find(r => r.id === selected)?.rejectionReason || 'Não informado'}</p> : <label className="field">Decisão<select className="input" value={decision} disabled={busy} onChange={e => setDecision(e.target.value)}>
        {referrals.find(r => r.id === selected)?.status === 'PENDING' && <option value="VALID">Aprovar</option>}
        <option value="INVALID">Invalidar</option><option value="FRAUD">Marcar como fraude</option>
      </select></label>}
      <label className="field">{reopening ? 'Justificativa da reabertura' : 'Motivo'} (sem dados sensíveis)<textarea className="textarea" required minLength={3} maxLength={500} value={reason} disabled={busy} onChange={e => setReason(e.target.value)} /></label>
      <p className="muted">{reopening ? 'A indicação voltará para análise manual, sem pontuar. O histórico e o prazo serão preservados. Depois será necessário registrar uma nova decisão.' : 'Invalidar ou marcar como fraude remove a pontuação. Indicações inválidas podem ser reavaliadas; fraude e cancelamento não podem ser reabertos.'}</p>
      <button className="btn" disabled={busy || refreshing || reason.trim().length < 3}>{busy ? 'Salvando…' : reopening ? 'Confirmar reabertura' : 'Confirmar revisão'}</button>{' '}
      <button className="btn secondary" type="button" disabled={busy} onClick={() => { setSelected(''); setMessage('Revisão cancelada. Nenhuma decisão foi enviada.'); }}>Cancelar</button>
    </form>}
    <p role="status" aria-live="polite">{busy ? 'Salvando revisão...' : message}</p>
    {historyBusy && <p role="status">Carregando histórico...</p>}
    {history && <section aria-label="Histórico da indicação" style={{ marginTop: 16 }}>
      <h3>Histórico — {historyLabel}</h3><p className="muted">Até 100 eventos mais recentes. Horários em {displayTimezone}.</p>
      {!history.length && <p>Nenhum evento registrado. Registros antigos podem não ter auditoria.</p>}
      <ul>{history.map(event => <li key={event.id} style={{ marginBottom: 12 }}>
        <strong>{actions[event.action] || event.action}</strong> — {event.actor} — {formatFixedOffset(event.createdAt)} {displayTimezone}
        {event.metadata?.from && <div>{labels[event.metadata.from] || event.metadata.from} → {labels[event.metadata.to || ''] || event.metadata.to}</div>}
        {event.metadata?.reason && <div>Motivo: {event.metadata.reason}</div>}
        {event.metadata?.previousRejectionReason && <div>Motivo anterior preservado: {event.metadata.previousRejectionReason}</div>}
      </li>)}</ul>
      <button className="btn secondary" type="button" onClick={() => { setHistory(null); setMessage('Histórico fechado.'); }}>Fechar histórico</button>
    </section>}
  </section>;
}
