'use client';
import { useActionFeedback, notifyAction } from './ActionFeedback';

import { FormEvent, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { formatFixedOffset, displayTimezone, toFixedOffsetInput, fromFixedOffsetInput } from '../lib/date-time';

type Props = {
  campaign: any;
  canManage: boolean;
};

export function CampaignManagement({ campaign, canManage }: Props) {
  const [message, setMessage] = useActionFeedback();
  const [error, setError] = useActionFeedback();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [refreshing, startRefresh] = useTransition();
  const router = useRouter();
  const closed = !canManage || ['FINISHED', 'CANCELLED'].includes(campaign.status);

  async function request(url: string, init: RequestInit) {
    if (busyRef.current) return null;
    busyRef.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
    const response = await fetch(url, init);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) startRefresh(() => router.refresh());
      setError(Array.isArray(data.message) ? data.message.join(', ') : (data.message || 'Operação não concluída.'));
      return null;
    }
    return data;
    } catch {
      setError('Não foi possível confirmar a operação. Atualize a página antes de tentar novamente.');
      return null;
    } finally { busyRef.current = false; setBusy(false); }
  }

  async function saveCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    let startsAt: string | undefined, endsAt: string | undefined;
    try {
      startsAt = fromFixedOffsetInput(String(form.get('startsAt') || ''));
      endsAt = fromFixedOffsetInput(String(form.get('endsAt') || ''));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Confira as datas informadas.');
      return;
    }

    const data = await request(`/api/campaigns/${campaign.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.get('name'),
        title: form.get('title') || undefined,
        subtitle: form.get('subtitle') || undefined,
        description: form.get('description') || undefined,
        startsAt,
        endsAt,
        referralCodePrefix: form.get('referralCodePrefix') || undefined,
        maxParticipants: form.get('maxParticipants') ? Number(form.get('maxParticipants')) : undefined,
      }),
    });

    if (data) {
      setMessage('Campanha atualizada.');
      startRefresh(() => router.refresh());
    }
  }

  async function saveRules(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const data = await request(`/api/campaigns/${campaign.id}/rules`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        referralRequiresRegistration: form.get('referralRequiresRegistration') === 'on',
        allowSelfReferral: form.get('allowSelfReferral') === 'on',
        minValidityHours: Number(form.get('minValidityHours') || 0),
        requiresManualApproval: form.get('requiresManualApproval') === 'on',
        maxReferralsPerParticipant: form.get('maxReferralsPerParticipant')
          ? Number(form.get('maxReferralsPerParticipant'))
          : undefined,
        requireUniquePhone: form.get('requireUniquePhone') === 'on',
        requireUniqueEmail: form.get('requireUniqueEmail') === 'on',
      }),
    });
    if (data) setMessage('Regras atualizadas.');
  }

  async function addReward(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const data = await request(`/api/campaigns/${campaign.id}/rewards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        positionStart: form.get('positionStart') ? Number(form.get('positionStart')) : undefined,
        positionEnd: form.get('positionEnd') ? Number(form.get('positionEnd')) : undefined,
        rewardType: form.get('rewardType'),
        title: form.get('rewardTitle'),
        monetaryValue: form.get('monetaryValue') ? Number(form.get('monetaryValue')) : undefined,
        description: form.get('rewardDescription') || undefined,
      }),
    });
    if (data) {
      formEl.reset();
      setMessage('Prêmio adicionado.');
      startRefresh(() => router.refresh());
    }
  }

  async function deleteReward(rewardId: string) {
    if (!confirm('Remover este prêmio?')) { setMessage('Remoção cancelada.'); return; }
    const data = await request(`/api/campaigns/${campaign.id}/rewards/${rewardId}`, {
      method: 'DELETE',
    });
    if (data) { setMessage('Prêmio removido.'); startRefresh(() => router.refresh()); }
  }

  async function action(action: string, confirmation?: string) {
    if (confirmation && !confirm(confirmation)) { setMessage('Operação cancelada.'); return; }
    const data = await request(`/api/campaigns/${campaign.id}/actions/${action}`, {
      method: 'POST',
    });
    if (!data) return;

    if (action === 'duplicate') {
      setMessage('Campanha duplicada. Abrindo a cópia...');
      notifyAction('Campanha duplicada.', true);
      router.push(`/campaigns/${data.id}`);
    } else {
      const messages: Record<string, string> = { schedule: 'Início agendado.', activate: 'Campanha ativada.', pause: campaign.status === 'SCHEDULED' ? 'Agendamento desfeito. Campanha pausada.' : 'Campanha pausada.', finish: 'Campanha finalizada.', cancel: 'Campanha cancelada.' };
      setMessage(messages[action] || 'Operação concluída.');
      startRefresh(() => router.refresh());
    }
  }

  const rules = campaign.rules || {};

  return (
    <fieldset disabled={busy || refreshing || !canManage} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <section className="card" style={{ marginTop: 16 }}>
        <div className="row">
          <h2 style={{ margin: 0 }}>Gestão da campanha</h2>
          {!canManage && <p>Seu perfil permite apenas consultas.</p>}
          <div className="spacer" />
          {canManage && (campaign.status === 'DRAFT' || campaign.status === 'PAUSED') ? (
            <button className="btn" onClick={() => action('activate')}>Ativar</button>
          ) : null}
          {canManage && ['DRAFT', 'PAUSED'].includes(campaign.status) && <button className="btn secondary" type="button" onClick={() => action('schedule', 'Agendar o início com a data já salva nas configurações?')}>Agendar início</button>}
          {campaign.status === 'SCHEDULED' && <p>Início agendado: {formatFixedOffset(campaign.startsAt)} {displayTimezone}. A ativação ocorre no próximo ciclo de processamento após esse horário.</p>}
          {canManage && campaign.status === 'SCHEDULED' && <button className="btn secondary" type="button" onClick={() => action('pause')}>Desfazer agendamento</button>}
          {canManage && campaign.status === 'ACTIVE' ? (
            <button className="btn secondary" onClick={() => action('pause')}>Pausar</button>
          ) : null}
          {canManage && ['ACTIVE', 'PAUSED'].includes(campaign.status) ? (
            <button className="btn secondary" onClick={() => action('finish', 'Finalizar a campanha? Essa ação não poderá ser desfeita.')}>Finalizar</button>
          ) : null}
          {!closed ? (
            <button className="btn secondary" onClick={() => action('cancel', 'Cancelar esta campanha?')}>Cancelar</button>
          ) : null}
          {canManage && <button className="btn secondary" onClick={() => action('duplicate')}>Duplicar</button>}
        </div>

        <p className="success" role="status" aria-live="polite">{busy ? 'Processando. Aguarde...' : message}</p>
        {error ? <p className="error" role="alert">{error}</p> : null}
      </section>

      <div className="grid" style={{ marginTop: 16 }}>
        <form className="card" onSubmit={saveCampaign}>
          <h2>Configurações</h2>
          <div className="field"><label className="label">Nome</label><input className="input" name="name" defaultValue={campaign.name} disabled={closed} required /></div>
          <div className="field"><label className="label">Título público</label><input className="input" name="title" defaultValue={campaign.title || ''} disabled={closed} /></div>
          <div className="field"><label className="label">Subtítulo</label><input className="input" name="subtitle" defaultValue={campaign.subtitle || ''} disabled={closed} /></div>
          <div className="field"><label className="label">Descrição</label><textarea className="textarea" rows={4} name="description" defaultValue={campaign.description || ''} disabled={closed} /></div>
          <div className="field"><label className="label" htmlFor="campaign-start">Início ({displayTimezone})</label><input className="input" type="datetime-local" id="campaign-start" step="0.001" name="startsAt" defaultValue={toFixedOffsetInput(campaign.startsAt)} disabled={closed} /></div>
          <div className="field"><label className="label" htmlFor="campaign-end">Fim ({displayTimezone})</label><input className="input" type="datetime-local" id="campaign-end" step="0.001" name="endsAt" defaultValue={toFixedOffsetInput(campaign.endsAt)} disabled={closed} /></div>
          <p className="muted">Todos os horários são informados e exibidos em {displayTimezone}.</p>
          <div className="field"><label className="label">Prefixo do código</label><input className="input" name="referralCodePrefix" maxLength={10} defaultValue={campaign.referralCodePrefix || ''} disabled={closed} /></div>
          <div className="field"><label className="label">Máximo de participantes</label><input className="input" type="number" min="1" name="maxParticipants" defaultValue={campaign.maxParticipants || ''} disabled={closed} /></div>
          {!closed ? <button className="btn">Salvar configurações</button> : null}
        </form>

        <form className="card" onSubmit={saveRules}>
          <h2>Regras</h2>
          <label className="field row"><input type="checkbox" name="referralRequiresRegistration" defaultChecked={rules.referralRequiresRegistration ?? true} disabled={closed} /> Exigir cadastro do indicado</label>
          <label className="field row"><input type="checkbox" name="allowSelfReferral" defaultChecked={rules.allowSelfReferral ?? false} disabled={closed} /> Permitir autoindicação</label>
          <label className="field row"><input type="checkbox" name="requireUniquePhone" defaultChecked={rules.requireUniquePhone ?? true} disabled={closed} /> Telefone único</label>
          <label className="field row"><input type="checkbox" name="requireUniqueEmail" defaultChecked={rules.requireUniqueEmail ?? false} disabled={closed} /> E-mail único</label>
          <label className="field row"><input type="checkbox" name="requiresManualApproval" defaultChecked={rules.requiresManualApproval ?? false} disabled={closed} /> Exigir aprovação manual das indicações</label>
          <div className="field"><label className="label">Horas mínimas para validade</label><input className="input" type="number" min="0" max="87600" name="minValidityHours" defaultValue={rules.minValidityHours ?? 0} disabled={closed} /></div>
          <p className="muted">O prazo é fixado no cadastro de cada indicação. A aprovação manual também respeita esse prazo. Alterar a aprovação manual afeta as indicações que ainda estão pendentes.</p>
          <div className="field"><label className="label">Máximo de indicações por participante</label><input className="input" type="number" min="1" name="maxReferralsPerParticipant" defaultValue={rules.maxReferralsPerParticipant || ''} disabled={closed} /></div>
          {!closed ? <button className="btn">Salvar regras</button> : null}
        </form>
      </div>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>Prêmios</h2>

        {campaign.rewards?.length ? (
          <table className="table" style={{ marginBottom: 20 }}>
            <thead><tr><th>Posição</th><th>Prêmio</th><th>Tipo</th><th>Valor</th><th></th></tr></thead>
            <tbody>
              {campaign.rewards.map((reward: any) => (
                <tr key={reward.id}>
                  <td>{reward.positionStart || '—'}{reward.positionEnd && reward.positionEnd !== reward.positionStart ? `–${reward.positionEnd}` : ''}</td>
                  <td><strong>{reward.title}</strong><div className="muted">{reward.description || ''}</div></td>
                  <td>{reward.rewardType}</td>
                  <td>{reward.monetaryValue ? `R$ ${Number(reward.monetaryValue).toFixed(2)}` : '—'}</td>
                  <td>{!closed ? <button className="btn secondary" onClick={() => deleteReward(reward.id)}>Remover</button> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="muted">Nenhum prêmio configurado.</p>}

        {!closed ? (
          <form onSubmit={addReward}>
            <div className="grid">
              <div className="field"><label className="label">Posição inicial</label><input className="input" name="positionStart" type="number" min="1" /></div>
              <div className="field"><label className="label">Posição final</label><input className="input" name="positionEnd" type="number" min="1" /></div>
              <div className="field"><label className="label">Tipo</label><select className="input" name="rewardType" defaultValue="dinheiro"><option value="dinheiro">Dinheiro</option><option value="premio">Prêmio</option><option value="cupom">Cupom</option><option value="credito">Crédito</option><option value="pontos">Pontos</option></select></div>
              <div className="field"><label className="label">Valor (R$)</label><input className="input" name="monetaryValue" type="number" step="0.01" min="0" /></div>
            </div>
            <div className="field"><label className="label">Nome do prêmio</label><input className="input" name="rewardTitle" required /></div>
            <div className="field"><label className="label">Descrição</label><textarea className="textarea" name="rewardDescription" rows={3} /></div>
            <button className="btn">Adicionar prêmio</button>
          </form>
        ) : null}
      </section>
    </fieldset>
  );
}
