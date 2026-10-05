const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
if (!process.env.TEST_DATABASE_URL || !new URL(process.env.TEST_DATABASE_URL).pathname.endsWith('/e3d_sprint3a_test'))
  throw new Error('Use a disposable e3d_sprint3a_test database.');

test('migration preserves legacy decisions and backfills pending deadlines', async () => {
  const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  const schema = 'migration_' + randomUUID().replaceAll('-', '');
  try {
    await db.$transaction(async tx => {
      await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
      const migrations = path.join(__dirname, '../prisma/migrations');
      async function executeFile(relative) {
        const sql = fs.readFileSync(path.join(migrations, relative), 'utf8');
        for (const statement of sql.split(';').map(s => s.trim()).filter(Boolean)) await tx.$executeRawUnsafe(statement);
      }
      await executeFile('20260902000100_init/migration.sql');
      const org = randomUUID(), campaign = randomUUID(), participant = randomUUID();
      await tx.$executeRaw`INSERT INTO organizations (id,name,slug,updated_at) VALUES (${org}::uuid,'Synthetic','synthetic',now())`;
      await tx.$executeRaw`INSERT INTO campaigns (id,organization_id,name,slug,updated_at) VALUES (${campaign}::uuid,${org}::uuid,'Synthetic','synthetic',now())`;
      await tx.$executeRaw`INSERT INTO campaign_rules (id,campaign_id,min_validity_hours,updated_at) VALUES (${randomUUID()}::uuid,${campaign}::uuid,2,now())`;
      await tx.$executeRaw`INSERT INTO participants (id,organization_id,campaign_id,name,referral_code,updated_at) VALUES (${participant}::uuid,${org}::uuid,${campaign}::uuid,'Synthetic','SYNTHETIC',now())`;
      for (const status of ['PENDING','VALID','INVALID','FRAUD','CANCELLED']) {
        await tx.$executeRaw`INSERT INTO referrals (id,organization_id,campaign_id,referrer_participant_id,status,created_at,validated_at,rejected_at,rejection_reason)
        VALUES (${randomUUID()}::uuid,${org}::uuid,${campaign}::uuid,${participant}::uuid,${status}::"ReferralStatus",'2026-01-01T00:00:00Z',
          ${status === 'VALID' ? new Date('2026-01-01T00:00:00Z') : null}, ${['INVALID','FRAUD','CANCELLED'].includes(status) ? new Date('2026-01-01T00:00:00Z') : null}, ${status === 'INVALID' ? 'Synthetic reason' : null})`;
      }
      const before = await tx.$queryRawUnsafe('SELECT id,status,validated_at,rejected_at,rejection_reason FROM referrals ORDER BY id');
      await executeFile('20260916000100_referral_validation/migration.sql');
      const after = await tx.$queryRawUnsafe('SELECT id,status,validated_at,rejected_at,rejection_reason FROM referrals ORDER BY id');
      assert.deepEqual(after, before);
      const pending = await tx.$queryRawUnsafe("SELECT eligible_at FROM referrals WHERE status = 'PENDING'");
      assert.equal(pending[0].eligible_at.toISOString(), '2026-01-01T02:00:00.000Z');
      const rules = await tx.$queryRawUnsafe('SELECT requires_manual_approval FROM campaign_rules');
      assert.equal(rules[0].requires_manual_approval, false);
      await executeFile('20260916000200_referral_reassessment/migration.sql');
      const recheck = await tx.$queryRawUnsafe('SELECT id,status,validated_at,rejected_at,rejection_reason FROM referrals ORDER BY id');
      assert.deepEqual(recheck, before);
      const flags = await tx.$queryRawUnsafe('SELECT manual_review_required, review_version FROM referrals');
      assert.ok(flags.every(r => r.manual_review_required === false && r.review_version === 0));
      const identifiers = await tx.$queryRawUnsafe('SELECT id,referral_code FROM participants');
      await executeFile('20260923000100_referral_clicks/migration.sql');
      assert.deepEqual(await tx.$queryRawUnsafe('SELECT id,referral_code FROM participants'), identifiers);
      assert.deepEqual(await tx.$queryRawUnsafe('SELECT id,status,validated_at,rejected_at,rejection_reason FROM referrals ORDER BY id'), before);
      assert.equal((await tx.$queryRawUnsafe('SELECT count(*)::int AS count FROM referral_clicks'))[0].count, 0);
      // This schema was created in this transaction specifically for this test.
      await tx.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    }, { timeout: 30000 });
  } finally { await db.$disconnect(); }
});
