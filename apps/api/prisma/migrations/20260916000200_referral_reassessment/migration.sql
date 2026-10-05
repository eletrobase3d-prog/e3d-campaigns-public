ALTER TABLE "referrals" ADD COLUMN "manual_review_required" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "referrals" ADD COLUMN "review_version" INTEGER NOT NULL DEFAULT 0;
