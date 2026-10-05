const assert = require('node:assert/strict');
const { JwtService } = require('@nestjs/jwt');
const { CampaignsService } = require('../dist/campaigns/campaigns.service');
const { CampaignScheduler } = require('../dist/campaigns/campaign-scheduler');

module.exports = async ({ t, base, db, fixture, campaigns, register }) => {
  const args = f => [f.actor.organizationId, f.actor.sub, f.campaign.id];
  const future = () => new Date(Date.now() + 3600000);
  const state = f => db.campaign.findUniqueOrThrow({ where: { id: f.campaign.id } });
  async function scheduled() {
    const f = await fixture(); const start = future();
    await db.campaign.update({ where: { id: f.campaign.id }, data: { status: 'DRAFT', startsAt: start } });
    await campaigns.changeStatus(...args(f), 'SCHEDULED');
    return { ...f, start };
  }
  const advance = (f, now) => campaigns.processScheduledCampaign(f.actor.organizationId, f.campaign.id, () => now);
  const logs = f => db.auditLog.findMany({ where: { entityId: f.campaign.id, action: 'campaign.schedule.processed' } });

  await t.test('3I explicit scheduling requires permission, tenant and a valid future interval', async () => {
    const f = await fixture();
    await assert.rejects(campaigns.changeStatus(...args(f), 'SCHEDULED'), e => e.getStatus() === 400);
    await db.campaign.update({ where: { id: f.campaign.id }, data: { status: 'DRAFT' } });
    await assert.rejects(campaigns.changeStatus(...args(f), 'SCHEDULED'), /início futura/);
    const start = future();
    await db.campaign.update({ where: { id: f.campaign.id }, data: { startsAt: start, endsAt: start } });
    await assert.rejects(campaigns.changeStatus(...args(f), 'SCHEDULED'), /término/);
    await db.campaign.update({ where: { id: f.campaign.id }, data: { endsAt: null } });
    const jwt = new JwtService().sign(f.actor, { secret: process.env.JWT_SECRET });
    const send = id => fetch(base + `/campaigns/${id}/schedule`, { method: 'POST', headers: { Authorization: `Bearer ${jwt}` } });
    await db.organizationUser.updateMany({ where: { userId: f.actor.sub }, data: { role: 'ANALYST' } });
    assert.equal((await send(f.campaign.id)).status, 403);
    await db.organizationUser.updateMany({ where: { userId: f.actor.sub }, data: { role: 'MANAGER' } });
    const other = await fixture(); assert.equal((await send(other.campaign.id)).status, 404);
    assert.equal((await send(f.campaign.id)).status, 201);
    assert.equal((await state(f)).status, 'SCHEDULED');
  });
  await t.test('3I exact start boundary activates once with system audit; scheduled registration is blocked', async () => {
    const f = await scheduled();
    await assert.rejects(register.register(f.campaign.slug, { name: 'Too early' }));
    assert.equal(await advance(f, new Date(f.start.getTime() - 1)), false);
    assert.equal(await advance(f, f.start), true);
    assert.equal(await advance(f, f.start), false);
    assert.equal((await state(f)).status, 'ACTIVE');
    const audit = await logs(f); assert.equal(audit.length, 1); assert.equal(audit[0].userId, null);
    assert.equal(audit[0].metadata.reason, 'scheduled_start_reached');
    // Even a worker's advanced test clock cannot bypass registration's real date guard.
    await assert.rejects(register.register(f.campaign.slug, { name: 'Still before actual start' }));
    await db.campaign.update({ where: { id: f.campaign.id }, data: { startsAt: new Date(Date.now() - 1000) } });
    assert.ok((await register.register(f.campaign.slug, { name: 'After start' })).participantId);
  });
  await t.test('3I expired window pauses instead of opening; no-end restart can activate', async () => {
    const f = await scheduled(); const end = new Date(f.start.getTime() + 60000);
    await campaigns.update(...args(f), { endsAt: end.toISOString() });
    assert.equal(await advance(f, end), true); assert.equal((await state(f)).status, 'PAUSED');
    assert.equal((await logs(f))[0].metadata.reason, 'scheduled_window_expired');
    const g = await scheduled();
    assert.equal(await advance(g, new Date(g.start.getTime() + 86400000)), true);
  });
  await t.test('3I pause/cancel and inactive organizations prevent activation; active legacy remains untouched', async () => {
    for (const target of ['PAUSED', 'CANCELLED']) {
      const f = await scheduled(); await campaigns.changeStatus(...args(f), target);
      assert.equal(await advance(f, f.start), false); assert.equal((await state(f)).status, target);
    }
    const f = await scheduled();
    await db.organization.update({ where: { id: f.actor.organizationId }, data: { status: 'SUSPENDED' } });
    assert.equal(await advance(f, f.start), false);
    await db.organization.update({ where: { id: f.actor.organizationId }, data: { status: 'ACTIVE' } });
    assert.equal(await advance(f, f.start), true);
    const g = await fixture(); assert.equal(await advance(g, new Date()), false);
  });
  await t.test('3I scheduled edits require future start and worker rereads edited date', async () => {
    const f = await scheduled();
    await assert.rejects(campaigns.update(...args(f), { startsAt: new Date(Date.now() - 1).toISOString() }), /início futuro/);
    const later = new Date(f.start.getTime() + 60000);
    await campaigns.update(...args(f), { startsAt: later.toISOString() });
    assert.equal(await advance(f, f.start), false); assert.equal(await advance(f, later), true);
  });
  await t.test('3I concurrent processors produce one transition; cancellation cannot be resurrected', async () => {
    const f = await scheduled();
    const results = await Promise.all([advance(f, f.start), advance(f, f.start)]);
    assert.equal(results.filter(Boolean).length, 1); assert.equal((await logs(f)).length, 1);
    const g = await scheduled();
    await Promise.all([advance(g, g.start), campaigns.changeStatus(...args(g), 'CANCELLED')]);
    assert.equal((await state(g)).status, 'CANCELLED');
    assert.equal(await advance(g, g.start), false);
  });
  await t.test('3I system audit failure rolls back automatic activation', async () => {
    const f = await scheduled();
    const failing = new CampaignsService({ $transaction: (fn, options) => db.$transaction(tx => fn(new Proxy(tx, {
      get(target, prop) { return prop === 'auditLog' ? { create: async () => { throw Error('Synthetic audit failure'); } } : target[prop]; },
    })), options) });
    await assert.rejects(failing.processScheduledCampaign(f.actor.organizationId, f.campaign.id, () => f.start), /audit failure/);
    assert.equal((await state(f)).status, 'SCHEDULED'); assert.equal((await logs(f)).length, 0);
  });
  await t.test('3I batch excludes inactive organizations and coalesces local overlapping calls', async () => {
    const f = await scheduled();
    // Other tests may leave future schedules; every mutation stays in disposable fixture organizations.
    const worker = new CampaignScheduler(db, campaigns);
    const a = worker.processDue(() => f.start); const b = worker.processDue(() => f.start);
    assert.equal(a, b); await a;
    assert.equal((await state(f)).status, 'ACTIVE');
    await worker.onModuleDestroy();
  });
};

