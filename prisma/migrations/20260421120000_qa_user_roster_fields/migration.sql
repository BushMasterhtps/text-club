-- QA roster: per-user tracking, team label, optional exempt note.

ALTER TABLE "User" ADD COLUMN "qaIsTracked" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "qaTeam" TEXT;
ALTER TABLE "User" ADD COLUMN "qaExemptReason" TEXT;

CREATE INDEX "User_qaIsTracked_idx" ON "User" ("qaIsTracked");
CREATE INDEX "User_qaTeam_idx" ON "User" ("qaTeam");
