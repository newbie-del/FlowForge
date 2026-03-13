-- Add missing index on session.userId for fast per-user session lookups
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- Add missing index on account.userId for fast per-user account lookups
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- Add ownership, timestamps, and index to the Workflow table
ALTER TABLE "Workflow" RENAME TO "workflow";

-- Add userId as nullable first so the migration succeeds on tables that
-- already contain rows; the application must back-fill / prevent NULL values
-- before a follow-up migration tightens it to NOT NULL.
ALTER TABLE "workflow"
  ADD COLUMN "userId"    TEXT,
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Back-fill updatedAt to match createdAt for any pre-existing rows so that
-- the two timestamps are consistent until the next real write.
UPDATE "workflow" SET "updatedAt" = "createdAt";

ALTER TABLE "workflow"
  ADD CONSTRAINT "workflow_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "workflow_userId_idx" ON "workflow"("userId");

