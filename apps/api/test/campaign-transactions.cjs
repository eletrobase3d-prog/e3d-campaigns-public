const assert = require('node:assert/strict');
const { CampaignsService } = require('../dist/campaigns/campaigns.service');
const { Prisma } = require('@prisma/client');
const { serializable } = require('../dist/common/serializable');

module.exports = async ({ t, db, fixture, campaigns }) => {
  const args = f => [f.actor.organizationId, f.actor.sub, f.campaign.id];
  const service = hooks => new CampaignsService({ $transaction: (fn, options) =>
    db.$transaction(tx => fn(new Proxy(tx, { get(target, prop) {
      if (prop === 'auditLog') return { create: async data => {
        if (hooks.audit) await hooks.audit(data);
        return target.auditLog.create(data);
      } };
      if (prop === '$queryRaw') return (...values) => {
        if (hooks.lock) hooks.lock();
        return target.$queryRaw(...values);
      };
      return target[prop];
    } })), options) });
  const snapshot = async f => ({
    campaigns: await db.campaign.findMany({ where: { organizationId: f.actor.organizationId }, include: { rules: true, rewards: true }, orderBy: { id: 'asc' } }),
    audit: await db.auditLog.findMany({ where: { organizationId: f.actor.organizationId }, orderBy: { id: 'asc' } }),
  });
  await t.test('3G every campaign write rolls back when audit fails', async () => {
    const f = await fixture();
    const reward = await campaigns.addReward(...args(f), { title: 'Synthetic reward', rewardType: 'premio' });
    const failing = service({ audit: () => { throw new Error('Synthetic audit failure'); } });
    const before = await snapshot(f);
    const operations = [
      () => failing.create(f.actor.organizationId, f.actor.sub, { name: 'Must roll back' }),
      () => failing.update(...args(f), { name: 'Must roll back' }),
      () => failing.changeStatus(...args(f), 'FINISHED'),
      () => failing.updateRules(...args(f), { minValidityHours: 5 }),
      () => failing.addReward(...args(f), { title: 'Must roll back', rewardType: 'premio' }),
      () => failing.deleteReward(...args(f), reward.id),
      () => failing.duplicate(...args(f)),
    ];
    for (const operation of operations) {
      await assert.rejects(operation(), /Synthetic audit failure/);
      assert.deepEqual(await snapshot(f), before);
    }
  });

  // Pause the first real transaction after its write; start another connection with
  // an older snapshot before committing the first. No timing-based sleeps.
  async function overlap(first, second) {
    let entered, unlock, attempted;
    const reached = new Promise(r => { entered = r; });
    const gate = new Promise(r => { unlock = r; });
    const started = new Promise(r => { attempted = r; });
    const a = first(service({ audit: async () => { entered(); await gate; } }));
    let b;
    try {
      await Promise.race([reached, a.then(() => { throw Error('Expected audit barrier'); })]);
      b = second(service({ lock: attempted }));
      // Attach rejection handling before releasing the first transaction.
      const results = Promise.allSettled([a, b]);
      await Promise.race([started, b.then(() => { throw Error('Expected row lock'); })]);
      unlock();
      return await results;
    } finally { unlock(); await Promise.allSettled([a, b].filter(Boolean)); }
  }
  await t.test('3G closure wins over concurrent edits, rules, rewards and reactivation', async () => {
    for (const type of ['update', 'rules', 'add', 'delete', 'status']) {
      const f = await fixture();
      const reward = await campaigns.addReward(...args(f), { title: 'Keep reward', rewardType: 'premio' });
      const operations = {
        update: s => s.update(...args(f), { name: 'Late edit' }),
        rules: s => s.updateRules(...args(f), { minValidityHours: 99 }),
        add: s => s.addReward(...args(f), { title: 'Late reward', rewardType: 'premio' }),
        delete: s => s.deleteReward(...args(f), reward.id),
        status: s => s.changeStatus(...args(f), 'PAUSED'),
      };
      const results = await overlap(s => s.changeStatus(...args(f), 'FINISHED'), operations[type]);
      assert.equal(results[0].status, 'fulfilled');
      assert.equal(results[1].status, 'rejected');
      assert.equal(results[1].reason.getStatus(), 400);
      const c = await campaigns.get(f.actor.organizationId, f.campaign.id);
      assert.equal(c.status, 'FINISHED'); assert.equal(c.name, f.campaign.name);
      assert.equal(c.rules.minValidityHours, 0); assert.equal(c.rewards.length, 1);
      const audit = await db.auditLog.findMany({ where: { entityId: c.id, action: { startsWith: 'campaign.status.' } } });
      assert.equal(audit.length, 1); assert.deepEqual(audit[0].metadata, { from: 'ACTIVE', to: 'FINISHED' });
    }
  });
  await t.test('3G edit can commit before closure and both have accurate audit records', async () => {
    const f = await fixture();
    const results = await overlap(s => s.update(...args(f), { title: 'Committed before closure' }), s => s.changeStatus(...args(f), 'CANCELLED'));
    assert.deepEqual(results.map(x => x.status), ['fulfilled', 'fulfilled']);
    const c = await campaigns.get(f.actor.organizationId, f.campaign.id);
    assert.equal(c.title, 'Committed before closure'); assert.equal(c.status, 'CANCELLED');
    assert.equal(await db.auditLog.count({ where: { entityId: c.id, action: 'campaign.update' } }), 1);
    assert.equal(await db.auditLog.count({ where: { entityId: c.id, action: 'campaign.status.cancelled' } }), 1);
  });
  await t.test('3G competing terminal transitions cannot overwrite the winner', async () => {
    const f = await fixture();
    const results = await overlap(s => s.changeStatus(...args(f), 'CANCELLED'), s => s.changeStatus(...args(f), 'FINISHED'));
    assert.deepEqual(results.map(x => x.status), ['fulfilled', 'rejected']);
    assert.equal((await campaigns.get(f.actor.organizationId, f.campaign.id)).status, 'CANCELLED');
  });
  await t.test('3G partial date updates cannot combine into an invalid interval', async () => {
    const f = await fixture();
    await db.campaign.update({ where: { id: f.campaign.id }, data: { startsAt: new Date('2030-01-01Z'), endsAt: new Date('2030-01-10Z') } });
    const results = await overlap(s => s.update(...args(f), { startsAt: '2030-01-08T00:00:00Z' }), s => s.update(...args(f), { endsAt: '2030-01-05T00:00:00Z' }));
    assert.deepEqual(results.map(x => x.status), ['fulfilled', 'rejected']);
    assert.equal(results[1].reason.getStatus(), 400);
    const c = await campaigns.get(f.actor.organizationId, f.campaign.id);
    assert.ok(c.endsAt > c.startsAt);
    assert.equal(c.endsAt.toISOString(), '2030-01-10T00:00:00.000Z');
  });
  await t.test('3G duplicate keeps a consistent source snapshot and creates one draft', async () => {
    const f = await fixture();
    const results = await overlap(s => s.updateRules(...args(f), { minValidityHours: 7 }), s => s.duplicate(...args(f)));
    assert.deepEqual(results.map(x => x.status), ['fulfilled', 'fulfilled']);
    // Serializable snapshot may precede the source rule edit; it must be complete.
    const copy = results[1].value;
    assert.equal(copy.status, 'DRAFT'); assert.ok([0, 7].includes(copy.rules.minValidityHours));
    assert.equal(await db.campaign.count({ where: { organizationId: f.actor.organizationId } }), 2);
    assert.equal(await db.auditLog.count({ where: { entityId: copy.id, action: 'campaign.duplicate' } }), 1);
  });
  await t.test('3G retry budget handles raw SQL serialization only and propagates other failures', async () => {
    for (const [code, meta] of [['P2034', {}], ['P2010', { code: '40001' }], ['P2010', { code: '40P01' }]]) {
      let calls = 0;
      const fake = { $transaction: async () => { calls++; throw new Prisma.PrismaClientKnownRequestError('Synthetic conflict', { code, meta, clientVersion: 'test' }); } };
      await assert.rejects(serializable(fake, async () => {}), e => e.getStatus() === 409);
      assert.equal(calls, 4);
    }
    let calls = 0;
    const failure = new Prisma.PrismaClientKnownRequestError('Other SQL error', { code: 'P2010', meta: { code: '23505' }, clientVersion: 'test' });
    await assert.rejects(serializable({ $transaction: async () => { calls++; throw failure; } }, async () => {}), e => e === failure);
    assert.equal(calls, 1);
  });
};
