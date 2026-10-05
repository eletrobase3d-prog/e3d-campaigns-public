ALTER TABLE "campaign_rules" ADD COLUMN "requires_manual_approval" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "referrals" ADD COLUMN "eligible_at" TIMESTAMPTZ;
-- Preserve existing decisions. Only pending rows need a due date.
UPDATE "referrals" r
SET "eligible_at" = r."created_at" + make_interval(hours => COALESCE(cr."min_validity_hours", 0))
FROM "campaigns" c LEFT JOIN "campaign_rules" cr ON cr."campaign_id" = c."id"
WHERE r."campaign_id" = c."id" AND r."status" = 'PENDING';
CREATE INDEX "referrals_status_eligible_at_idx" ON "referrals"("status", "eligible_at");
