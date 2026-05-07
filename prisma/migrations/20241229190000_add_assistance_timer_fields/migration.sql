-- Intentionally a no-op: same ordering issue — `ALTER TABLE "Task"` ran before init created `Task`.
-- Columns are added (idempotently) in `20250902005506_add_assistance_timer_fields`.

SELECT 1;
