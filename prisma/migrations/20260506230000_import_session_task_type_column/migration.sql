-- ImportSession.taskType is defined in prisma/schema.prisma but was missing from initial CreateTable migration.
-- Required by GET /api/holds/import-history and POST /api/holds/import (taskType: 'HOLDS').

ALTER TABLE "ImportSession" ADD COLUMN IF NOT EXISTS "taskType" TEXT;
