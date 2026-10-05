const assert = require('node:assert/strict');
const { JwtService } = require('@nestjs/jwt');
const { hash } = require('bcryptjs');
const { randomUUID } = require('node:crypto');

module.exports = async ({ t, base, db, fixture, referred, row }) => {
  const token = actor => new JwtService().sign(actor, { secret: process.env.JWT_SECRET });
  const request = (jwt, url, method = 'GET', body) => fetch(base + url, {
    method, headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const role = (f, value) => db.organizationUser.updateMany({ where: { userId: f.actor.sub, organizationId: f.actor.organizationId }, data: { role: value } });
  const writes = (id, referralId, rewardId) => [
    ['/campaigns', 'POST', { name: 'Forbidden campaign' }],
    [`/campaigns/${id}`, 'PATCH', { name: 'Forbidden change' }],
    [`/campaigns/${id}/rules`, 'PUT', {}],
    [`/campaigns/${id}/rewards`, 'POST', { title: 'Forbidden reward', rewardType: 'premio' }],
    [`/campaigns/${id}/rewards/${rewardId}`, 'DELETE'],
    ...['activate', 'pause', 'finish', 'cancel', 'duplicate'].map(action => [`/campaigns/${id}/${action}`, 'POST']),
    [`/campaigns/${id}/referrals/${referralId}/review`, 'POST', { status: 'INVALID', reason: 'Denied review' }],
    [`/campaigns/${id}/referrals/${referralId}/reopen`, 'POST', { reason: 'Denied reopen', expectedVersion: 0 }],
  ];

  await t.test('3D analyst reads every administrative resource but cannot write using an old owner token', async () => {
    const f = await fixture({ requiresManualApproval: true }); await referred(f); const r = await row(f);
    const reward = await db.campaignReward.create({ data: { campaignId: f.campaign.id, title: 'Existing reward', rewardType: 'premio' } });
    const jwt = token(f.actor); await role(f, 'ANALYST');
    for (const url of ['/auth/me', '/campaigns', `/campaigns/${f.campaign.id}`, `/campaigns/${f.campaign.id}/participants`, `/campaigns/${f.campaign.id}/referrals`, `/campaigns/${f.campaign.id}/referrals/${r.id}/history`]) {
      assert.equal((await request(jwt, url)).status, 200, url);
    }
    assert.equal((await (await request(jwt, '/auth/me')).json()).canManage, false);
    for (const [url, method, body] of writes(f.campaign.id, r.id, reward.id)) assert.equal((await request(jwt, url, method, body)).status, 403, url);
    assert.equal((await row(f)).status, 'PENDING');
    assert.equal((await db.campaign.findUniqueOrThrow({ where: { id: f.campaign.id } })).name, 'Synthetic campaign');
    assert.ok(await db.campaignReward.findUnique({ where: { id: reward.id } }));
    await role(f, 'MANAGER');
    assert.equal((await request(jwt, `/campaigns/${f.campaign.id}`, 'PATCH', { title: 'Current role applied' })).status, 200);
  });

  await t.test('3D each editing role can create, update, manage rewards, duplicate and change state', async () => {
    for (const value of ['OWNER', 'ADMIN', 'MANAGER']) {
      const f = await fixture({ requiresManualApproval: true }); await role(f, value); const jwt = token({ ...f.actor, role: 'ANALYST' });
      await referred(f); const r = await row(f);
      for (const status of ['VALID', 'INVALID']) {
        assert.equal((await request(jwt, `/campaigns/${f.campaign.id}/referrals/${r.id}/review`, 'POST', {
          status, reason: 'Authorized role decision', expectedVersion: (await row(f)).reviewVersion,
        })).status, 201);
      }
      assert.equal((await request(jwt, `/campaigns/${f.campaign.id}/referrals/${r.id}/reopen`, 'POST', {
        reason: 'Authorized role reassessment', expectedVersion: (await row(f)).reviewVersion,
      })).status, 201);
      const created = await request(jwt, '/campaigns', 'POST', { name: 'Role permission fixture' });
      assert.equal(created.status, 201); const c = await created.json();
      assert.equal((await request(jwt, `/campaigns/${c.id}`, 'PATCH', { title: 'Updated' })).status, 200);
      assert.equal((await request(jwt, `/campaigns/${c.id}/rules`, 'PUT', { requiresManualApproval: true })).status, 200);
      const response = await request(jwt, `/campaigns/${c.id}/rewards`, 'POST', { title: 'Reward', rewardType: 'premio' });
      assert.equal(response.status, 201); const reward = await response.json();
      assert.equal((await request(jwt, `/campaigns/${c.id}/rewards/${reward.id}`, 'DELETE')).status, 200);
      assert.equal((await request(jwt, `/campaigns/${c.id}/duplicate`, 'POST')).status, 201);
      for (const action of ['activate', 'pause', 'activate', 'finish']) assert.equal((await request(jwt, `/campaigns/${c.id}/${action}`, 'POST')).status, 201);
      assert.equal((await request(jwt, `/campaigns/${f.campaign.id}/cancel`, 'POST')).status, 201);
    }
  });

  await t.test('3D removed membership, disabled user and suspended organization invalidate existing access', async () => {
    for (const change of ['membership', 'user', 'organization']) {
      const f = await fixture(); const jwt = token(f.actor);
      if (change === 'membership') await db.organizationUser.deleteMany({ where: { userId: f.actor.sub } });
      if (change === 'user') await db.user.update({ where: { id: f.actor.sub }, data: { status: 'DISABLED' } });
      if (change === 'organization') await db.organization.update({ where: { id: f.actor.organizationId }, data: { status: 'SUSPENDED' } });
      for (const url of ['/auth/me', '/campaigns', `/campaigns/${f.campaign.id}`]) assert.equal((await request(jwt, url)).status, 401, change);
      assert.equal((await request(jwt, '/campaigns', 'POST', { name: 'Denied' })).status, 401);
    }
  });

  await t.test('3D cross-organization reads, writes and mixed reward/referral identifiers are denied', async () => {
    const a = await fixture(); const b = await fixture({ requiresManualApproval: true }); await referred(b); const r = await row(b);
    const reward = await db.campaignReward.create({ data: { campaignId: b.campaign.id, title: 'Private reward', rewardType: 'premio' } });
    const jwt = token(a.actor);
    for (const url of [`/campaigns/${b.campaign.id}`, `/campaigns/${b.campaign.id}/participants`, `/campaigns/${b.campaign.id}/referrals`, `/campaigns/${b.campaign.id}/referrals/${r.id}/history`, `/campaigns/${a.campaign.id}/referrals/${r.id}/history`]) assert.equal((await request(jwt, url)).status, 404, url);
    for (const [url, method, body] of writes(b.campaign.id, r.id, reward.id).slice(1)) assert.equal((await request(jwt, url, method, body)).status, 404, url);
    assert.equal((await request(jwt, `/campaigns/${a.campaign.id}/rewards/${reward.id}`, 'DELETE')).status, 404);
    assert.equal((await request(jwt, `/campaigns/${a.campaign.id}/referrals/${r.id}/review`, 'POST', { status: 'INVALID', reason: 'Mixed IDs' })).status, 404);
    assert.ok(await db.campaignReward.findUnique({ where: { id: reward.id } }));
    assert.equal((await row(b)).status, 'PENDING');
    const forgedOrganization = token({ ...a.actor, organizationId: b.actor.organizationId });
    assert.equal((await request(forgedOrganization, '/campaigns')).status, 401);
  });

  await t.test('3D login rejects inactive accounts and selects an active organization', async () => {
    const f = await fixture(); const password = randomUUID();
    const user = await db.user.update({ where: { id: f.actor.sub }, data: { passwordHash: await hash(password, 4) } });
    const login = () => fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email, password }) });
    assert.equal((await login()).status, 201);
    await db.user.update({ where: { id: user.id }, data: { status: 'DISABLED' } }); assert.equal((await login()).status, 401);
    await db.user.update({ where: { id: user.id }, data: { status: 'ACTIVE' } });
    await db.organization.update({ where: { id: f.actor.organizationId }, data: { status: 'SUSPENDED' } }); assert.equal((await login()).status, 401);
    const other = await fixture();
    await db.organizationUser.create({ data: { userId: user.id, organizationId: other.actor.organizationId, role: 'ANALYST' } });
    const response = await login(); assert.equal(response.status, 201);
    assert.equal((await response.json()).organizationId, other.actor.organizationId);
    await db.organizationUser.deleteMany({ where: { userId: user.id } }); assert.equal((await login()).status, 401);
  });
};

