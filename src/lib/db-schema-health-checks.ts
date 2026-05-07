/**
 * Read-only Postgres checks for /api/holds/health (no secrets, no row contents).
 */

import type { PrismaClient } from '@prisma/client';

export type SchemaHealthChecks = {
  ok: boolean;
  timestamp: string;
  postgresReachable: boolean;
  enumTaskType: { holds: boolean; yotpo: boolean };
  taskColumns: Record<string, boolean>;
  importSessionColumns: Record<string, boolean>;
  userColumns: Record<string, boolean>;
  prismaImportSessionProbe: boolean;
  prismaHoldsQueuesProbe: boolean;
  /** Mirrors GET /api/holds/import-history Prisma WHERE (needs ImportSession.taskType). */
  importHistoryWhereProbe?: boolean;
  errors?: string[];
};

async function pgHasColumn(
  prisma: PrismaClient,
  table: PrismaUpsertSafeTable,
  column: string,
): Promise<boolean> {
  try {
    const rows = await prisma.$queryRaw<{ ok: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = ${table}
          AND column_name = ${column}
      ) AS ok
    `;
    return !!rows[0]?.ok;
  } catch {
    return false;
  }
}

async function pgEnumHasLabels(
  prisma: PrismaClient,
  enumName: string,
  labels: string[],
): Promise<Record<string, boolean>> {
  const out: Record<string, boolean> = {};
  for (const label of labels) {
    try {
      const rows = await prisma.$queryRaw<{ ok: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM pg_enum e
          JOIN pg_type t ON e.enumtypid = t.oid
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE n.nspname = 'public'
            AND t.typname = ${enumName}
            AND e.enumlabel = ${label}
        ) AS ok
      `;
      out[label] = !!rows[0]?.ok;
    } catch {
      out[label] = false;
    }
  }
  return out;
}

type PrismaUpsertSafeTable = 'Task' | 'ImportSession' | 'User';

export async function runHoldsProductionHealthChecks(prisma: PrismaClient): Promise<SchemaHealthChecks> {
  const errors: string[] = [];
  let postgresReachable = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    postgresReachable = true;
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }

  let enumLabels: Record<string, boolean> = {};
  try {
    enumLabels = await pgEnumHasLabels(prisma, 'TaskType', ['HOLDS', 'YOTPO']);
  } catch (e) {
    errors.push(`enum_probe: ${e instanceof Error ? e.message : String(e)}`);
  }

  const taskCols = ['holdsOrderNumber', 'holdsQueueHistory', 'yotpoEmail', 'taskType'] as const;
  const sessionCols = ['taskType', 'duplicateDetails'] as const;
  const userCols = ['agentTypes'] as const;

  const taskColumns: Record<string, boolean> = {};
  const importSessionColumns: Record<string, boolean> = {};
  const userColumns: Record<string, boolean> = {};

  for (const c of taskCols) {
    taskColumns[c] = postgresReachable && (await pgHasColumn(prisma, 'Task', c));
  }
  for (const c of sessionCols) {
    importSessionColumns[c] = postgresReachable && (await pgHasColumn(prisma, 'ImportSession', c));
  }
  for (const c of userCols) {
    userColumns[c] = postgresReachable && (await pgHasColumn(prisma, 'User', c));
  }

  let prismaImportSessionProbe = false;
  let prismaHoldsQueuesProbe = false;

  if (postgresReachable) {
    try {
      await prisma.importSession.findMany({ take: 0 });
      prismaImportSessionProbe = true;
    } catch {
      prismaImportSessionProbe = false;
    }
    try {
      await prisma.task.findMany({ where: { taskType: 'HOLDS' }, take: 0 });
      prismaHoldsQueuesProbe = true;
    } catch {
      prismaHoldsQueuesProbe = false;
    }
  }

  let importHistoryWhereProbe = false;
  if (postgresReachable && importSessionColumns.taskType) {
    try {
      await prisma.importSession.findMany({
        where: { taskType: 'HOLDS', duplicates: { gt: 0 } },
        take: 0,
      });
      importHistoryWhereProbe = true;
    } catch {
      importHistoryWhereProbe = false;
    }
  }

  const ok =
    postgresReachable &&
    enumLabels.HOLDS === true &&
    enumLabels.YOTPO === true &&
    taskColumns.holdsOrderNumber &&
    taskColumns.yotpoEmail &&
    taskColumns.taskType &&
    Object.values(importSessionColumns).every(Boolean) &&
    Object.values(userColumns).every(Boolean) &&
    prismaImportSessionProbe &&
    prismaHoldsQueuesProbe &&
    importHistoryWhereProbe;

  return {
    ok,
    timestamp: new Date().toISOString(),
    postgresReachable,
    enumTaskType: { holds: !!enumLabels.HOLDS, yotpo: !!enumLabels.YOTPO },
    taskColumns,
    importSessionColumns,
    userColumns,
    prismaImportSessionProbe,
    prismaHoldsQueuesProbe,
    importHistoryWhereProbe,
    ...(errors.length ? { errors } : {}),
  };
}
