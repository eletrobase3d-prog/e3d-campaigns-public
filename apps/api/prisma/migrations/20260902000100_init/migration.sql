-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');
CREATE TYPE "OrganizationStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
CREATE TYPE "OrganizationRole" AS ENUM ('OWNER', 'ADMIN', 'MANAGER', 'ANALYST');
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'FINISHED', 'CANCELLED');
CREATE TYPE "ParticipantStatus" AS ENUM ('ACTIVE', 'BLOCKED', 'DISQUALIFIED');
CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'VALID', 'INVALID', 'FRAUD', 'CANCELLED');

CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "status" "OrganizationStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "organization_users" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "OrganizationRole" NOT NULL DEFAULT 'MANAGER',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "organization_users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "campaigns" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "title" VARCHAR(255),
    "subtitle" VARCHAR(255),
    "description" TEXT,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "starts_at" TIMESTAMPTZ,
    "ends_at" TIMESTAMPTZ,
    "timezone" VARCHAR(60) NOT NULL DEFAULT 'America/Sao_Paulo',
    "referral_code_prefix" VARCHAR(10),
    "max_participants" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "campaign_rules" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "referral_requires_registration" BOOLEAN NOT NULL DEFAULT true,
    "allow_self_referral" BOOLEAN NOT NULL DEFAULT false,
    "min_validity_hours" INTEGER NOT NULL DEFAULT 0,
    "max_referrals_per_participant" INTEGER,
    "require_unique_phone" BOOLEAN NOT NULL DEFAULT true,
    "require_unique_email" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "campaign_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "campaign_rewards" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "position_start" INTEGER,
    "position_end" INTEGER,
    "reward_type" VARCHAR(30) NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "monetary_value" DECIMAL(12,2),
    "description" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "campaign_rewards_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "participants" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "email" VARCHAR(255),
    "phone" VARCHAR(40),
    "referral_code" VARCHAR(40) NOT NULL,
    "status" "ParticipantStatus" NOT NULL DEFAULT 'ACTIVE',
    "registered_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validated_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "participants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "referrals" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "referrer_participant_id" UUID NOT NULL,
    "referred_participant_id" UUID,
    "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING',
    "source" VARCHAR(60),
    "ip_hash" VARCHAR(128),
    "device_hash" VARCHAR(128),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validated_at" TIMESTAMPTZ,
    "rejected_at" TIMESTAMPTZ,
    "rejection_reason" TEXT,
    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "user_id" UUID,
    "action" VARCHAR(100) NOT NULL,
    "entity_type" VARCHAR(80),
    "entity_id" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");
CREATE UNIQUE INDEX "organization_users_organization_id_user_id_key" ON "organization_users"("organization_id", "user_id");
CREATE INDEX "organization_users_user_id_idx" ON "organization_users"("user_id");
CREATE UNIQUE INDEX "campaigns_organization_id_slug_key" ON "campaigns"("organization_id", "slug");
CREATE INDEX "campaigns_organization_id_status_idx" ON "campaigns"("organization_id", "status");
CREATE UNIQUE INDEX "campaign_rules_campaign_id_key" ON "campaign_rules"("campaign_id");
CREATE INDEX "campaign_rewards_campaign_id_idx" ON "campaign_rewards"("campaign_id");
CREATE UNIQUE INDEX "participants_campaign_id_referral_code_key" ON "participants"("campaign_id", "referral_code");
CREATE INDEX "participants_campaign_id_idx" ON "participants"("campaign_id");
CREATE INDEX "participants_campaign_id_phone_idx" ON "participants"("campaign_id", "phone");
CREATE INDEX "participants_campaign_id_email_idx" ON "participants"("campaign_id", "email");
CREATE INDEX "referrals_campaign_id_status_idx" ON "referrals"("campaign_id", "status");
CREATE INDEX "referrals_referrer_participant_id_idx" ON "referrals"("referrer_participant_id");
CREATE INDEX "referrals_referred_participant_id_idx" ON "referrals"("referred_participant_id");
CREATE INDEX "audit_logs_organization_id_created_at_idx" ON "audit_logs"("organization_id", "created_at");

ALTER TABLE "organization_users" ADD CONSTRAINT "organization_users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_users" ADD CONSTRAINT "organization_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaign_rules" ADD CONSTRAINT "campaign_rules_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaign_rewards" ADD CONSTRAINT "campaign_rewards_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "participants" ADD CONSTRAINT "participants_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "participants" ADD CONSTRAINT "participants_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_participant_id_fkey" FOREIGN KEY ("referrer_participant_id") REFERENCES "participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referred_participant_id_fkey" FOREIGN KEY ("referred_participant_id") REFERENCES "participants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
