-- Ensure Task.taskType enum includes HOLDS and YOTPO (schema parity; initial enum had four values).

ALTER TYPE "TaskType" ADD VALUE IF NOT EXISTS 'HOLDS';
ALTER TYPE "TaskType" ADD VALUE IF NOT EXISTS 'YOTPO';
