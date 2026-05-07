-- Idempotent parity: ensures PostgreSQL enum "TaskType" includes HOLDS and YOTPO even if an earlier
-- migration was marked applied without SQL running against THIS database (wrong DATABASE_URL, manual repair, etc.).

ALTER TYPE "TaskType" ADD VALUE IF NOT EXISTS 'HOLDS';
ALTER TYPE "TaskType" ADD VALUE IF NOT EXISTS 'YOTPO';
