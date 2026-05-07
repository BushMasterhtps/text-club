-- Intentionally a no-op: this folder predates `20250902005505_init_postgres` in apply order but tried to CREATE INDEX ON "Task" before that table existed.
-- The composite index required by prisma/schema.prisma is created once `Task.completedBy` exists, in migration `20251129133531_add_task_performance_index`.

SELECT 1;
