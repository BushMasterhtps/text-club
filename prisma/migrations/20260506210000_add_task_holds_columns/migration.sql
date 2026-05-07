-- Holds-specific columns on Task (nullable). Safe when non-Holds tasks have no Holds data.
-- Aligns rebuilt / partial databases with prisma/schema.prisma Task holds* fields used by GET /api/holds/queues and related routes.

ALTER TABLE "Task"
  ADD COLUMN IF NOT EXISTS "holdsOrderDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "holdsOrderNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "holdsCustomerEmail" TEXT,
  ADD COLUMN IF NOT EXISTS "holdsPriority" INTEGER,
  ADD COLUMN IF NOT EXISTS "holdsDaysInSystem" INTEGER,
  ADD COLUMN IF NOT EXISTS "holdsStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "holdsPhoneNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "holdsOrderAmount" DECIMAL(65, 30),
  ADD COLUMN IF NOT EXISTS "holdsNotes" TEXT,
  ADD COLUMN IF NOT EXISTS "holdsQueueHistory" JSONB;
