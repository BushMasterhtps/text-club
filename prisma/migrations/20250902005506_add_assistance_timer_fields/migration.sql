-- Replay of assistance timer columns (see no-op `20241229190000_add_assistance_timer_fields`), after `Task` exists.

ALTER TABLE "Task"
  ADD COLUMN IF NOT EXISTS "assistancePausedDurationSec" INTEGER,
  ADD COLUMN IF NOT EXISTS "assistanceRequestedAt" TIMESTAMP(3);
