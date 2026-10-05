const assert = require('node:assert/strict');
const { randomUUID, createHmac } = require('node:crypto');
const { JwtService } = require('@nestjs/jwt');
module.exports = async ({ t, base, db, fixture, referred, row, score }) => {
  const get = url => fetch(base + url);
  const identity = async f => {
    const response = await get(`/public/campaigns/~${f.campaign.id}/referrer/${f.first.referralCode}`);
    assert.equal(response.status, 200); return response.json();
  };
  const post = (ticket, eventId = randomUUID(), extra = {}) => fetch(base + '/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'referral_click', ticket, eventId, ...extra }) });
  const admin = (f, url) => fetch(base + url, { headers: { Authorization: 'Bearer ' + new JwtService().sign(f.actor, { secret: process.env.JWT_SECRET }) } });

  await t.test('3E canonical and unambiguous legacy links agree and lookup never records clicks', async () => {
    const f = await fixture();
    for (const key of [f.campaign.slug, '~' + f.campaign.id]) {
      const response = await get('/public/campaigns/' + key); assert.equal(response.status, 200);
      assert.equal((await response.json()).id, f.campaign.id);
      assert.equal((await get(`/public/campaigns/${key}/ranking`)).status, 200);
    }
    for (const key of [f.first.referralCode, '~' + f.first.participantId]) {
      const response = await get('/public/referrals/' + key); assert.equal(response.status, 200);
      assert.equal((await response.json()).campaign.publicKey, '~' + f.campaign.id);
    }
    const ref = await identity(f);
    assert.equal(ref.name, 'Participant Alpha'); assert.equal(ref.referralCode, f.first.referralCode);
    assert.deepEqual(Object.keys(ref).sort(), ['name', 'referralCode', 'ticket']);
    assert.equal(await db.referralClick.count({ where: { campaignId: f.campaign.id } }), 0);
    assert.equal(f.first.referralPath, '/r/~' + f.first.participantId);
  });
  await t.test('3E legacy collisions fail clearly while canonical links and registration stay scoped', async () => {
    const a = await fixture(); const b = await fixture();
    await db.campaign.update({ where: { id: b.campaign.id }, data: { slug: a.campaign.slug } });
    await db.participant.update({ where: { id: b.first.participantId }, data: { referralCode: a.first.referralCode } });
    for (const url of [`/public/campaigns/${a.campaign.slug}`, `/public/campaigns/${a.campaign.slug}/ranking`, `/public/referrals/${a.first.referralCode}`]) assert.equal((await get(url)).status, 409, url);
    for (const f of [a, b]) {
      const response = await get(`/public/referrals/~${f.first.participantId}`);
      assert.equal(response.status, 200); assert.equal((await response.json()).id, f.first.participantId);
    }
    const response = await fetch(base + `/public/campaigns/~${b.campaign.id}/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Scoped visitor', referredByCode: a.first.referralCode }) });
    assert.equal(response.status, 201);
    assert.equal((await row(b)).referrerParticipantId, b.first.participantId);
  });
  await t.test('3E cross-campaign and inactive referrers never disclose a name', async () => {
    const a = await fixture(); const b = await fixture();
    assert.equal((await get(`/public/campaigns/~${a.campaign.id}/referrer/${b.first.referralCode}`)).status, 404);
    await db.participant.update({ where: { id: a.first.participantId }, data: { status: 'BLOCKED' } });
    assert.equal((await get(`/public/campaigns/~${a.campaign.id}/referrer/${a.first.referralCode}`)).status, 404);
    assert.equal((await get(`/public/referrals/~${a.first.participantId}`)).status, 404);
    await db.organization.update({ where: { id: b.actor.organizationId }, data: { status: 'SUSPENDED' } });
    assert.equal((await get(`/public/campaigns/~${b.campaign.id}`)).status, 404);
  });
  await t.test('3E repeated and concurrent events count once and never change score', async () => {
    const f = await fixture(); await referred(f); const before = await score(f);
    const { ticket } = await identity(f); const eventId = randomUUID();
    const results = await Promise.all([post(ticket, eventId), post(ticket, eventId)]);
    assert.ok(results.every(r => r.status === 201));
    assert.equal((await post(ticket, eventId)).status, 201);
    assert.equal(await db.referralClick.count({ where: { campaignId: f.campaign.id } }), 1);
    assert.equal((await post(ticket)).status, 201);
    assert.equal(await score(f), before);
    const response = await admin(f, `/campaigns/${f.campaign.id}/clicks`); assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { total: 2, participants: [{ participantId: f.first.participantId, clicks: 2 }] });
  });
  await t.test('3E forged, expired and unsupported events cannot write data', async () => {
    const f = await fixture(); const { ticket } = await identity(f);
    assert.equal((await post(ticket + 'broken')).status, 400);
    assert.equal((await post(ticket, randomUUID(), { type: 'conversion' })).status, 400);
    assert.equal((await post(ticket, 'not-a-uuid')).status, 400);
    assert.equal((await post('x'.repeat(1001))).status, 400);
    const payload = Buffer.from(JSON.stringify({ campaignId: f.campaign.id, participantId: f.first.participantId, exp: Date.now() - 1 })).toString('base64url');
    const signed = createHmac('sha256', process.env.JWT_SECRET).update('referral-click:' + payload).digest('base64url');
    assert.equal((await post(payload + '.' + signed)).status, 400);
    assert.equal(await db.referralClick.count({ where: { campaignId: f.campaign.id } }), 0);
    const other = await fixture();
    assert.equal((await post(ticket, randomUUID(), { participantId: other.first.participantId, organizationId: other.actor.organizationId })).status, 201);
    assert.equal(await db.referralClick.count({ where: { campaignId: other.campaign.id } }), 0);
  });
  await t.test('3E counters enforce current permissions and event ids cannot be reassigned', async () => {
    const a = await fixture(); const b = await fixture(); const id = randomUUID();
    assert.equal((await post((await identity(a)).ticket, id)).status, 201);
    assert.equal((await post((await identity(b)).ticket, id)).status, 409);
    assert.equal((await get(`/campaigns/${a.campaign.id}/clicks`)).status, 401);
    assert.equal((await admin(b, `/campaigns/${a.campaign.id}/clicks`)).status, 404);
    await db.organizationUser.updateMany({ where: { userId: a.actor.sub }, data: { role: 'ANALYST' } });
    assert.equal((await admin(a, `/campaigns/${a.campaign.id}/clicks`)).status, 200);
  });
  await t.test('3E rate limits persist in database and inactive campaigns reject new events', async () => {
    const f = await fixture(); const { ticket } = await identity(f);
    await db.referralClick.createMany({ data: Array.from({ length: 60 }, () => ({ eventId: randomUUID(), organizationId: f.actor.organizationId, campaignId: f.campaign.id, participantId: f.first.participantId })) });
    assert.equal((await post(ticket)).status, 429);
    assert.equal(await db.referralClick.count({ where: { campaignId: f.campaign.id } }), 60);
    await db.campaign.update({ where: { id: f.campaign.id }, data: { status: 'PAUSED' } });
    assert.equal((await post(ticket)).status, 404);
    const limited = await fixture();
    await db.referralClick.createMany({ data: Array.from({ length: 600 }, () => ({ eventId: randomUUID(), organizationId: limited.actor.organizationId, campaignId: limited.campaign.id, participantId: limited.first.participantId })) });
    const second = await referred(limited);
    const response = await get(`/public/campaigns/~${limited.campaign.id}/referrer/${second.referralCode}`);
    assert.equal((await post((await response.json()).ticket)).status, 429);
    assert.equal(await db.referralClick.count({ where: { campaignId: limited.campaign.id } }), 600);
  });
};
