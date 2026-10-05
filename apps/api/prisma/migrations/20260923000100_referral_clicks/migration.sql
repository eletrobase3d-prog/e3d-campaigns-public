CREATE TABLE "referral_clicks" (
  "event_id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "campaign_id" UUID NOT NULL,
  "participant_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "referral_clicks_pkey" PRIMARY KEY ("event_id"),
  CONSTRAINT "referral_clicks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "referral_clicks_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "referral_clicks_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "referral_clicks_campaign_id_created_at_idx" ON "referral_clicks"("campaign_id", "created_at");
CREATE INDEX "referral_clicks_participant_id_created_at_idx" ON "referral_clicks"("participant_id", "created_at");
CREATE INDEX "referral_clicks_organization_id_idx" ON "referral_clicks"("organization_id");
