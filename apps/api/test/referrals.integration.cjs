const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { Test } = require('@nestjs/testing');
const { ValidationPipe } = require('@nestjs/common');
const { JwtService } = require('@nestjs/jwt');
const { PrismaService } = require('../dist/prisma/prisma.service');
const { ParticipantsService } = require('../dist/participants/participants.service');
const { ReferralsService } = require('../dist/referrals/referrals.service');
const { RankingService } = require('../dist/ranking/ranking.service');
const { PublicService } = require('../dist/public/public.service');
const { CampaignsService } = require('../dist/campaigns/campaigns.service');
const { normalizePhone, sameContact, validityDeadline } = require('../dist/referrals/referral-policy');

// Explicit opt-in, isolated database only. No fallback to production DATABASE_URL.
if (!process.env.TEST_DATABASE_URL || !new URL(process.env.TEST_DATABASE_URL).pathname.endsWith('/e3d_sprint3a_test'))
  throw new Error('TEST_DATABASE_URL must point to a disposable e3d_sprint3a_test database.');
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.REFERRAL_WORKER_ENABLED = 'false';
process.env.CAMPAIGN_WORKER_ENABLED = 'false';
process.env.JWT_SECRET = randomBytes(32).toString('hex');

test('Sprints 3A/3B — PostgreSQL integration', async t => {
  const moduleNames = ['prisma/prisma', 'auth/auth', 'campaigns/campaigns', 'participants/participants', 'ranking/ranking', 'public/public', 'referrals/referrals', 'tracking/tracking'];
  const imports = moduleNames.map(name => Object.values(require(`../dist/${name}.module`))[0]);
  const module = await Test.createTestingModule({ imports }).compile();
  const app = module.createNestApplication({ logger: false });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(0, '127.0.0.1');
  const base = (await app.getUrl()) + '/api/v1';
  const db = app.get(PrismaService);
  const register = app.get(ParticipantsService);
  const referrals = app.get(ReferralsService);
  const ranking = app.get(RankingService);
  const publicService = app.get(PublicService);
  const campaigns = app.get(CampaignsService);
  const orgs = [];
  const users = [];
  async function fixture(rules = {}, campaignData = {}) {
    const organization = await db.organization.create({ data: { name: 'Synthetic organization', slug: randomUUID() } });
    orgs.push(organization.id);
    const user = await db.user.create({ data: { name: 'Synthetic manager', email: `${randomUUID()}@example.invalid`, passwordHash: randomBytes(32).toString('hex') } });
    users.push(user.id);
    await db.organizationUser.create({ data: { userId: user.id, organizationId: organization.id, role: 'OWNER' } });
    const campaign = await db.campaign.create({ data: { organizationId: organization.id, name: 'Synthetic campaign', slug: randomUUID(), status: 'ACTIVE',
      rules: { create: { requireUniquePhone: false, ...rules } }, ...campaignData } });
    const first = await register.register(campaign.slug, { name: 'Participant Alpha' });
    return { campaign, first, actor: { sub: user.id, organizationId: organization.id, role: 'OWNER' } };
  }
  async function referred(f, extra = {}) {
    return register.register(f.campaign.slug, { name: 'Participant Beta', referredByCode: f.first.referralCode, ...extra });
  }
  async function row(f) { return db.referral.findFirstOrThrow({ where: { campaignId: f.campaign.id } }); }
  async function score(f) { return (await ranking.publicRanking(f.campaign.slug)).ranking.find(p => p.participantId === f.first.participantId).score; }
  async function mature(id) { await db.referral.update({ where: { id }, data: { eligibleAt: new Date(Date.now() - 1000) } }); }
  const review = async (f, id, status = 'VALID') => referrals.review(f.actor, f.campaign.id, id, {
    status, reason: 'Synthetic review reason', expectedVersion: (await db.referral.findUniqueOrThrow({ where: { id } })).reviewVersion,
  });
  const reopen = async (f, id) => referrals.reopen(f.actor, f.campaign.id, id, {
    reason: 'Synthetic reassessment reason', expectedVersion: (await db.referral.findUniqueOrThrow({ where: { id } })).reviewVersion,
  });
  try {
    await t.test('normalization and exact validity boundary', () => {
      assert.equal(normalizePhone('+00 (12) 345'), '0012345');
      assert.equal(sameContact({ email: ' A@EXAMPLE.INVALID ' }, { email: 'a@example.invalid' }), true);
      assert.equal(sameContact({}, {}), false);
      const now = new Date('2026-01-01T00:00:00Z');
      assert.equal(validityDeadline(now, 1).getTime() - now.getTime(), 3600000);
      assert.equal(validityDeadline(now, 0).getTime(), now.getTime());
      assert.throws(() => validityDeadline(now, -1));
    });
    await t.test('zero hours validates immediately; public count matches ranking', async () => {
      const f = await fixture(); const result = await referred(f);
      assert.equal(result.referralStatus, 'VALID'); assert.equal(await score(f), 1);
      assert.equal((await publicService.campaign(f.campaign.slug))._count.referrals, 1);
    });
    await t.test('positive delay stays pending; early manual approval denied; deadline snapshot retained', async () => {
      const f = await fixture({ minValidityHours: 2 }); await referred(f); const r = await row(f);
      assert.equal(r.status, 'PENDING'); assert.equal(r.validatedAt, null); assert.equal(await score(f), 0);
      assert.equal(r.eligibleAt.getTime() - r.createdAt.getTime(), 7200000);
      await assert.rejects(review(f, r.id), /não elegível/);
      await db.campaignRule.update({ where: { campaignId: f.campaign.id }, data: { minValidityHours: 0 } });
      await referrals.processDue(); assert.equal((await row(f)).status, 'PENDING');
      assert.equal((await publicService.campaign(f.campaign.slug))._count.referrals, 0);
      await mature(r.id); await referrals.processDue(); assert.equal(await score(f), 1);
      await referrals.processDue(); assert.equal(await score(f), 1);
      assert.equal(await db.auditLog.count({ where: { entityId: r.id, action: 'referral.review.automatic' } }), 1);
    });
    await t.test('manual campaign stays pending after deadline; one audit for repeated approval', async () => {
      const f = await fixture({ requiresManualApproval: true }); await referred(f); const r = await row(f);
      await referrals.processDue(); assert.equal((await row(f)).status, 'PENDING');
      await review(f, r.id); await review(f, r.id); assert.equal(await score(f), 1);
      assert.equal(await db.auditLog.count({ where: { entityId: r.id, action: 'referral.review.manual' } }), 1);
    });
    await t.test('revocation removes score and cannot be reopened', async () => {
      const f = await fixture(); await referred(f); const r = await row(f);
      await review(f, r.id, 'FRAUD'); assert.equal(await score(f), 0);
      assert.equal((await row(f)).validatedAt, null); assert.ok((await row(f)).rejectedAt);
      assert.equal((await publicService.campaign(f.campaign.slug))._count.referrals, 0);
      await assert.rejects(review(f, r.id), /encerrada/); await referrals.processDue(); assert.equal((await row(f)).status, 'FRAUD');
    });
    await t.test('automatic worker never resurrects rejected pending referrals', async () => {
      const f = await fixture({ minValidityHours: 1 }); await referred(f); const r = await row(f);
      await review(f, r.id, 'INVALID'); await mature(r.id); await referrals.processDue(); assert.equal((await row(f)).status, 'INVALID');
    });
    await t.test('cross-organization review is not found and analyst cannot review or change rules', async () => {
      const f = await fixture({ requiresManualApproval: true }); const other = await fixture(); await referred(f); const r = await row(f);
      await assert.rejects(referrals.review(other.actor, f.campaign.id, r.id, { status: 'VALID', reason: 'Synthetic reason' }), /não encontrada/);
      await db.organizationUser.updateMany({ where: { userId: f.actor.sub }, data: { role: 'ANALYST' } });
      await assert.rejects(review(f, r.id), /Sem permissão/);
      await assert.rejects(campaigns.updateRules(f.actor.organizationId, f.actor.sub, f.campaign.id, { requiresManualApproval: false }), /Sem permissão/);
    });
    await t.test('disabled user cannot review even with an existing token payload', async () => {
      const f = await fixture({ requiresManualApproval: true }); await referred(f);
      await db.user.update({ where: { id: f.actor.sub }, data: { status: 'DISABLED' } });
      await assert.rejects(review(f, (await row(f)).id), /Sem permissão/);
    });
    await t.test('self-referral by matching normalized contact is blocked', async () => {
      const f = await fixture(); await db.participant.update({ where: { id: f.first.participantId }, data: { phone: '+00 (12) 345', email: 'alpha@example.invalid' } });
      await assert.rejects(referred(f, { phone: '0012345' }), /Autoindicação/);
      await assert.rejects(referred(f, { email: 'ALPHA@example.invalid' }), /Autoindicação/);
      await db.campaignRule.update({ where: { campaignId: f.campaign.id }, data: { allowSelfReferral: true } });
      assert.equal((await referred(f, { phone: '0012345' })).referralStatus, 'VALID');
    });
    await t.test('unique phone catches legacy punctuation and missing mandatory contacts', async () => {
      const f = await fixture(); await db.participant.update({ where: { id: f.first.participantId }, data: { phone: '+00 (12) 345' } });
      await db.campaignRule.update({ where: { campaignId: f.campaign.id }, data: { requireUniquePhone: true } });
      await assert.rejects(register.register(f.campaign.slug, { name: 'Another participant', phone: '0012345' }), /Phone already/);
      await assert.rejects(register.register(f.campaign.slug, { name: 'Another participant' }), /Telefone obrigatório/);
    });
    await t.test('pending referrals reserve the limit and concurrent registration cannot overbook', async () => {
      const f = await fixture({ minValidityHours: 1, maxReferralsPerParticipant: 1 });
      const results = await Promise.allSettled([referred(f), referred(f)]);
      assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
      assert.equal(await db.referral.count({ where: { campaignId: f.campaign.id } }), 1);
      assert.equal(await db.participant.count({ where: { campaignId: f.campaign.id } }), 2);
    });
    await t.test('concurrent participant limit and unique contact enforced atomically', async () => {
      const f = await fixture({}, { maxParticipants: 2 });
      const results = await Promise.allSettled([referred(f), referred(f)]);
      assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
      const g = await fixture();
      await db.campaignRule.update({ where: { campaignId: g.campaign.id }, data: { requireUniqueEmail: true } });
      const dupes = await Promise.allSettled([referred(g, { email: 'same@example.invalid' }), referred(g, { email: 'SAME@example.invalid' })]);
      assert.equal(dupes.filter(r => r.status === 'fulfilled').length, 1);
    });
    await t.test('two workers process each referral exactly once', async () => {
      const f = await fixture({ minValidityHours: 1 }); await referred(f); const r = await row(f); await mature(r.id);
      await Promise.all([referrals.processDue(), referrals.processDue()]); assert.equal(await score(f), 1);
      assert.equal(await db.auditLog.count({ where: { entityId: r.id, action: 'referral.review.automatic' } }), 1);
    });
    await t.test('worker versus versioned review returns a conflict or applies the decision; refresh allows rejection', async () => {
      const f = await fixture({ minValidityHours: 1 }); await referred(f); const r = await row(f); await mature(r.id);
      const results = await Promise.allSettled([referrals.processDue(), review(f, r.id, 'INVALID')]);
      assert.equal(results[0].status, 'fulfilled');
      if (results[1].status === 'rejected') {
        assert.equal(results[1].reason.getStatus(), 409);
        assert.equal((await row(f)).status, 'VALID');
        await review(f, r.id, 'INVALID');
      }
      assert.equal((await row(f)).status, 'INVALID'); assert.equal(await score(f), 0);
    });
    await t.test('blocked participant invalidates pending referral', async () => {
      const f = await fixture({ minValidityHours: 1 }); const result = await referred(f); const r = await row(f); await mature(r.id);
      await db.participant.update({ where: { id: result.participantId }, data: { status: 'BLOCKED' } });
      await referrals.processDue(); assert.equal((await row(f)).status, 'INVALID'); assert.equal(await score(f), 0);
    });
    await t.test('cancelled campaign does not approve; paused and finished can settle pending referrals', async () => {
      for (const status of ['CANCELLED', 'PAUSED', 'FINISHED']) {
        const f = await fixture({ minValidityHours: 1 }); await referred(f); const r = await row(f); await mature(r.id);
        await db.campaign.update({ where: { id: f.campaign.id }, data: { status } });
        await referrals.processDue(); assert.equal((await row(f)).status, status === 'CANCELLED' ? 'PENDING' : 'VALID');
      }
    });
    await t.test('HTTP requires authentication, validates DTO and accepts authorized review', async () => {
      const f = await fixture({ requiresManualApproval: true }); await referred(f); const r = await row(f);
      const url = `${base}/campaigns/${f.campaign.id}/referrals/${r.id}/review`;
      assert.equal((await fetch(url, { method: 'POST' })).status, 401);
      const jwt = new JwtService().sign(f.actor, { secret: process.env.JWT_SECRET });
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` };
      assert.equal((await fetch(url, { method: 'POST', headers, body: JSON.stringify({ status: 'PENDING', reason: 'bad' }) })).status, 400);
      assert.equal((await fetch(url, { method: 'POST', headers, body: JSON.stringify({ status: 'VALID', reason: '   ' }) })).status, 400);
      assert.equal((await fetch(url, { method: 'POST', headers, body: JSON.stringify({ status: 'VALID', reason: 'Synthetic approval' }) })).status, 201);
      assert.equal(await score(f), 1);
    });
    await t.test('rule duplication preserves manual approval and lowered caps are rechecked', async () => {
      const f = await fixture({ requiresManualApproval: true, maxReferralsPerParticipant: 2 });
      const copy = await campaigns.duplicate(f.actor.organizationId, f.actor.sub, f.campaign.id);
      assert.equal(copy.rules.requiresManualApproval, true);
      await referred(f); await referred(f);
      const rows = await db.referral.findMany({ where: { campaignId: f.campaign.id } });
      await db.campaignRule.update({ where: { campaignId: f.campaign.id }, data: { maxReferralsPerParticipant: 1 } });
      await review(f, rows[0].id);
      await assert.rejects(review(f, rows[1].id), /Limite/);
      assert.equal(await score(f), 1);
    });
    await t.test('validation and audit are atomic when audit write fails', async () => {
      const f = await fixture({ requiresManualApproval: true }); await referred(f); const r = await row(f);
      const failingDb = { $transaction: (fn, options) => db.$transaction(tx => fn(new Proxy(tx, { get(target, prop) {
        if (prop === 'auditLog') return { create: async () => { throw new Error('Synthetic audit failure'); } };
        return target[prop];
      } })), options) };
      const failingService = new ReferralsService(failingDb);
      await assert.rejects(failingService.review(f.actor, f.campaign.id, r.id, { status: 'VALID', reason: 'Synthetic approval' }), /audit failure/);
      assert.equal((await row(f)).status, 'PENDING'); assert.equal(await score(f), 0);
    });
    await t.test('manual invalidation can be reopened without scoring and approved once', async () => {
      const f = await fixture(); await referred(f); const r = await row(f);
      await review(f, r.id, 'INVALID'); const invalid = await row(f);
      await reopen(f, r.id); const pending = await row(f);
      assert.equal(pending.status, 'PENDING'); assert.equal(pending.manualReviewRequired, true);
      assert.equal(pending.eligibleAt.getTime(), invalid.eligibleAt.getTime()); assert.equal(await score(f), 0);
      await referrals.processDue(); assert.equal((await row(f)).status, 'PENDING');
      await review(f, r.id); assert.equal(await score(f), 1);
      await review(f, r.id); assert.equal(await score(f), 1);
      const history = await referrals.history(f.actor, f.campaign.id, r.id);
      assert.equal(history.filter(e => e.action === 'referral.reopen').length, 1);
      assert.equal(history.find(e => e.action === 'referral.reopen').metadata.previousRejectionReason, 'Synthetic review reason');
      assert.ok(history.some(e => e.metadata.to === 'INVALID'));
    });
    await t.test('automatic invalidation can be reopened; original problem must be resolved', async () => {
      const f = await fixture({ minValidityHours: 1 }); const result = await referred(f); const r = await row(f); await mature(r.id);
      await db.participant.update({ where: { id: result.participantId }, data: { status: 'BLOCKED' } });
      await referrals.processDue(); assert.equal((await row(f)).status, 'INVALID');
      await reopen(f, r.id); await assert.rejects(review(f, r.id), /inativo/);
      await db.participant.update({ where: { id: result.participantId }, data: { status: 'ACTIVE' } });
      await review(f, r.id); assert.equal(await score(f), 1);
      const history = await referrals.history(f.actor, f.campaign.id, r.id);
      assert.ok(history.some(e => e.action === 'referral.review.automatic' && e.metadata.to === 'INVALID'));
    });
    await t.test('reopened future referral retains its deadline and cannot be approved early', async () => {
      const f = await fixture({ minValidityHours: 2 }); await referred(f); const r = await row(f);
      await review(f, r.id, 'INVALID'); await reopen(f, r.id);
      assert.equal((await row(f)).eligibleAt.getTime(), r.eligibleAt.getTime());
      await assert.rejects(review(f, r.id), /não elegível/);
      await review(f, r.id, 'INVALID'); assert.equal(await score(f), 0);
      await reopen(f, r.id); assert.equal((await row(f)).status, 'PENDING');
    });
    await t.test('stale decision and stale reopen cannot change a later review cycle', async () => {
      const f = await fixture(); await referred(f); const r = await row(f);
      await review(f, r.id, 'INVALID'); const rejected = await row(f);
      await reopen(f, r.id);
      await assert.rejects(referrals.reopen(f.actor, f.campaign.id, r.id, { reason: 'Old retry', expectedVersion: rejected.reviewVersion }), /alterada/);
      await assert.rejects(referrals.review(f.actor, f.campaign.id, r.id, { status: 'VALID', reason: 'Missing version' }), /alterada/);
      await assert.rejects(referrals.review(f.actor, f.campaign.id, r.id, { status: 'INVALID', reason: 'Old retry', expectedVersion: r.reviewVersion }), /alterada/);
      assert.equal((await row(f)).status, 'PENDING');
    });
    await t.test('reopening requires a free reserved slot', async () => {
      const f = await fixture({ maxReferralsPerParticipant: 1 }); await referred(f); const r = await row(f);
      await review(f, r.id, 'INVALID'); await referred(f);
      await assert.rejects(reopen(f, r.id), /Não há vaga/);
      assert.equal((await db.referral.findUniqueOrThrow({ where: { id: r.id } })).status, 'INVALID');
    });
    await t.test('concurrent reopens reserve the last slot only once', async () => {
      const f = await fixture({ maxReferralsPerParticipant: 1 }); await referred(f); const first = await row(f);
      await review(f, first.id, 'INVALID'); await referred(f);
      const second = await db.referral.findFirstOrThrow({ where: { campaignId: f.campaign.id, status: 'VALID' } });
      await review(f, second.id, 'INVALID');
      const outcomes = await Promise.allSettled([reopen(f, first.id), reopen(f, second.id)]);
      assert.equal(outcomes.filter(o => o.status === 'fulfilled').length, 1);
      assert.equal(await db.referral.count({ where: { campaignId: f.campaign.id, status: 'PENDING' } }), 1);
    });
    await t.test('two reopens of the same version create a single audit event', async () => {
      const f = await fixture(); await referred(f); const r = await row(f); await review(f, r.id, 'INVALID');
      const dto = { reason: 'Concurrent reopen', expectedVersion: (await row(f)).reviewVersion };
      const outcomes = await Promise.allSettled([referrals.reopen(f.actor, f.campaign.id, r.id, dto), referrals.reopen(f.actor, f.campaign.id, r.id, dto)]);
      assert.equal(outcomes.filter(o => o.status === 'fulfilled').length, 1);
      assert.equal(await db.auditLog.count({ where: { entityId: r.id, action: 'referral.reopen' } }), 1);
    });
    await t.test('manual hold survives worker selection and campaign mode changes', async () => {
      const f = await fixture(); await referred(f); const r = await row(f); await review(f, r.id, 'INVALID'); await reopen(f, r.id);
      await db.campaignRule.update({ where: { campaignId: f.campaign.id }, data: { requiresManualApproval: false } });
      // Exercise the internal decision after a potentially stale worker selection too.
      await referrals.decide(f.actor.organizationId, f.campaign.id, r.id);
      await referrals.processDue(); assert.equal((await row(f)).status, 'PENDING'); assert.equal(await score(f), 0);
    });
    await t.test('fraud, cancelled referrals and cancelled campaigns cannot be reopened', async () => {
      for (const status of ['FRAUD', 'CANCELLED']) {
        const f = await fixture(); await referred(f); const r = await row(f);
        await db.referral.update({ where: { id: r.id }, data: { status } });
        await assert.rejects(reopen(f, r.id), /Somente/);
      }
      const f = await fixture(); await referred(f); const r = await row(f); await review(f, r.id, 'INVALID');
      await db.campaign.update({ where: { id: f.campaign.id }, data: { status: 'CANCELLED' } });
      await assert.rejects(reopen(f, r.id), /campanha/);
    });
    await t.test('reopening and history are scoped to organization and current permissions', async () => {
      const f = await fixture(); const other = await fixture(); await referred(f); const r = await row(f); await review(f, r.id, 'INVALID');
      await assert.rejects(referrals.reopen(other.actor, f.campaign.id, r.id, { reason: 'Cross tenant', expectedVersion: 1 }), /não encontrada/);
      await assert.rejects(referrals.history(other.actor, f.campaign.id, r.id), /não encontrada/);
      await db.organizationUser.updateMany({ where: { userId: f.actor.sub }, data: { role: 'ANALYST' } });
      await assert.rejects(reopen(f, r.id), /Sem permissão/);
      assert.ok((await referrals.history(f.actor, f.campaign.id, r.id)).length);
      await db.user.update({ where: { id: f.actor.sub }, data: { status: 'DISABLED' } });
      await assert.rejects(referrals.history(f.actor, f.campaign.id, r.id), /Sem permissão/);
    });
    await t.test('legacy invalid record retains its old reason and gets a safe deadline', async () => {
      const f = await fixture({ minValidityHours: 1 }); await referred(f); const r = await row(f);
      await db.referral.update({ where: { id: r.id }, data: { status: 'INVALID', eligibleAt: null, rejectionReason: 'Legacy rejection' } });
      await reopen(f, r.id); assert.equal((await row(f)).eligibleAt.getTime(), r.createdAt.getTime() + 3600000);
      assert.equal((await referrals.history(f.actor, f.campaign.id, r.id)).find(e => e.action === 'referral.reopen').metadata.previousRejectionReason, 'Legacy rejection');
    });
    await require('./scheduling.cjs')({ t, base, db, fixture, campaigns, register });
    await require('./campaign-transactions.cjs')({ t, db, fixture, campaigns });
    await require('./permissions.cjs')({ t, base, db, fixture, referred, row });
    await require('./tracking.cjs')({ t, base, db, fixture, referred, row, score });
    if (process.env.TEST_WEB === 'true') await t.test('Next.js renders review panel and forwards authenticated decisions', async webTest => {
      const web = path.resolve(__dirname, '../../web');
      const f = await fixture({ requiresManualApproval: true }); await referred(f); const r = await row(f);
      // Bind only to loopback; the child is always stopped in finally.
      const child = spawn(process.execPath, [path.join(web, 'node_modules/next/dist/bin/next'), 'start', '-H', '127.0.0.1', '-p', '55440'], {
        cwd: web, env: { ...process.env, API_INTERNAL_URL: base, NEXT_TELEMETRY_DISABLED: '1' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      });
      let log = ''; child.stdout.on('data', d => { log += d; }); child.stderr.on('data', d => { log += d; });
      const webBase = 'http://127.0.0.1:55440';
      try {
        let ready = false;
        for (let i = 0; i < 100; i++) {
          try { if ((await fetch(webBase + '/login')).ok) { ready = true; break; } } catch {}
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        assert.ok(ready, log);
        const jwt = new JwtService().sign(f.actor, { secret: process.env.JWT_SECRET });
        const headers = { 'Content-Type': 'application/json', Cookie: `e3d_token=${jwt}`, Origin: webBase };
        const page = await fetch(webBase + `/campaigns/${f.campaign.id}`, { headers });
        assert.equal(page.status, 200); assert.match(await page.text(), /Revisão de indicações/);
        const url = webBase + `/api/campaigns/${f.campaign.id}/referrals/${r.id}/review`;
        const body = JSON.stringify({ status: 'VALID', reason: 'Synthetic approval' });
        assert.equal((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })).status, 401);
        assert.equal((await fetch(url, { method: 'POST', headers: { ...headers, Origin: 'https://example.invalid' }, body })).status, 403);
        const response = await fetch(url, { method: 'POST', headers, body });
        assert.equal(response.status, 201, await response.text()); assert.equal(await score(f), 1);
        await review(f, r.id, 'INVALID'); const rejected = await row(f);
        const reopenUrl = webBase + `/api/campaigns/${f.campaign.id}/referrals/${r.id}/reopen`;
        const reopenBody = JSON.stringify({ reason: 'Reassessment from web', expectedVersion: rejected.reviewVersion });
        assert.equal((await fetch(reopenUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: reopenBody })).status, 401);
        assert.equal((await fetch(reopenUrl, { method: 'POST', headers: { ...headers, Origin: 'https://example.invalid' }, body: reopenBody })).status, 403);
        assert.equal((await fetch(reopenUrl, { method: 'POST', headers, body: JSON.stringify({ reason: 'Bad payload' }) })).status, 400);
        assert.equal((await fetch(reopenUrl, { method: 'POST', headers, body: reopenBody })).status, 201);
        const historyResponse = await fetch(webBase + `/api/campaigns/${f.campaign.id}/referrals/${r.id}/history`, { headers });
        assert.equal(historyResponse.status, 200); assert.ok((await historyResponse.json()).some(e => e.action === 'referral.reopen'));
        assert.equal(await score(f), 0);
        const heldPage = await fetch(webBase + `/campaigns/${f.campaign.id}`, { headers });
        assert.match(await heldPage.text(), /Em reavaliação manual/);
        const publicPage = await fetch(webBase + `/c/${f.campaign.slug}`);
        assert.equal(publicPage.status, 200); assert.match(await publicPage.text(), /indicações válidas/);
        if (process.env.TEST_PLAYWRIGHT_MODULE) await webTest.test('Sprint 3C browser feedback and reassessment', async () => {
          await require('./browser-feedback.cjs')({ webBase, jwt, f, r, review, row, score, db });
        });
      } finally { child.kill(); await new Promise(resolve => child.once('exit', resolve)); }
    });
  } finally {
    await db.organization.deleteMany({ where: { id: { in: orgs } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await app.close();
  }
});
