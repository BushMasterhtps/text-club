-- User.agentTypes is required by prisma/schema.prisma and GET /api/holds/agents (has: 'HOLDS').
-- Never added after init; PostgreSQL TEXT[] maps to Prisma String[].

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "agentTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
