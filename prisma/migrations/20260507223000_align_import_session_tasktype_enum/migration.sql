-- Align ImportSession.taskType with Task.taskType enum.
-- Handles both legacy TEXT and enum-typed columns safely without data loss.

DO $$
DECLARE
  col_udt_name text;
BEGIN
  SELECT c.udt_name
  INTO col_udt_name
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'ImportSession'
    AND c.column_name = 'taskType';

  -- If the column is missing entirely, create it as nullable TaskType.
  IF col_udt_name IS NULL THEN
    ALTER TABLE "ImportSession"
      ADD COLUMN "taskType" "TaskType";

  -- If it's not already TaskType (e.g. text/varchar), convert safely.
  ELSIF col_udt_name <> 'TaskType' THEN
    ALTER TABLE "ImportSession"
      ALTER COLUMN "taskType" TYPE "TaskType"
      USING
        CASE
          WHEN "taskType" IS NULL THEN NULL
          WHEN "taskType" IN ('TEXT_CLUB','WOD_IVCS','EMAIL_REQUESTS','STANDALONE_REFUNDS','HOLDS','YOTPO')
            THEN "taskType"::"TaskType"
          ELSE NULL
        END;
  END IF;
END $$;

