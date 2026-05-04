-- Phase 1: neutral roster team (additive). Backfill from qaTeam where set; qaTeam unchanged.

ALTER TABLE "User" ADD COLUMN "rosterTeam" TEXT;

UPDATE "User"
SET "rosterTeam" = "qaTeam"
WHERE "qaTeam" IS NOT NULL AND btrim("qaTeam") <> '';

CREATE INDEX "User_rosterTeam_idx" ON "User" ("rosterTeam");
