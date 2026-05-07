import { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiAuthDeniedResponse, requireManagerApiAuth } from '@/lib/auth';

const MIGRATION_NAMES = [
  '20260506210000_add_task_holds_columns',
  '20260506212000_add_holds_tasktype_enum',
  '20260506213000_add_task_yotpo_columns',
  '20260506230000_import_session_task_type_column',
  '20260507120000_add_user_agent_types',
  '20260507123000_force_tasktype_enum_parity',
  '20260507124000_force_task_schema_parity',
  '20260507223000_align_import_session_tasktype_enum',
] as const;

/**
 * Sanitize DATABASE_URL for display: host, port, database, user only (no password).
 * Lets you confirm which Postgres instance this runtime (e.g. Netlify function) uses.
 */
function sanitizeDatabaseUrl(): {
  host: string | null;
  port: string | null;
  database: string | null;
  user: string | null;
  rawHostLooksLike: string | null;
} | null {
  const raw = process.env.DATABASE_URL;
  if (!raw) return null;
  try {
    const normalized = raw.replace(/^postgresql:\/\//i, 'http://').replace(/^postgres:\/\//i, 'http://');
    const u = new URL(normalized);
    const dbPath = u.pathname.replace(/^\//, '').split('?')[0] ?? null;
    return {
      host: u.hostname || null,
      port: u.port || '5432',
      database: dbPath || null,
      user: u.username ? decodeURIComponent(u.username) : null,
      rawHostLooksLike: u.hostname || null,
    };
  } catch {
    return {
      host: null,
      port: null,
      database: null,
      user: null,
      rawHostLooksLike: 'URL_PARSE_ERROR',
    };
  }
}

async function hasColumn(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ ok: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ${table}
        AND column_name = ${column}
    ) AS ok
  `;
  return !!rows[0]?.ok;
}

export async function GET(request: NextRequest) {
  const auth = await requireManagerApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  try {
    const [session] = await prisma.$queryRaw<
      {
        current_database: string;
        current_schema: string;
        pg_version: string;
        server_addr: string | null;
        server_port: number | null;
      }[]
    >`
      SELECT
        current_database() AS current_database,
        current_schema() AS current_schema,
        version() AS pg_version,
        inet_server_addr()::text AS server_addr,
        inet_server_port() AS server_port
    `;

    const enumRows = await prisma.$queryRaw<{ label: string }[]>`
      SELECT e.enumlabel AS label
      FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
        AND t.typname = 'TaskType'
      ORDER BY e.enumsortorder
    `;

    const taskYotpoEmail = await hasColumn('Task', 'yotpoEmail');
    const taskHoldsOrderNumber = await hasColumn('Task', 'holdsOrderNumber');
    const userAgentTypes = await hasColumn('User', 'agentTypes');
    const importSessionTaskType = await hasColumn('ImportSession', 'taskType');

    const [importSessionTaskTypeType] = await prisma.$queryRaw<
      {
        data_type: string | null;
        udt_name: string | null;
        is_nullable: 'YES' | 'NO' | null;
      }[]
    >`
      SELECT data_type, udt_name, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'ImportSession'
        AND column_name = 'taskType'
      LIMIT 1
    `;

    const recentImportSessionTaskTypes = await prisma.$queryRaw<
      {
        id: string;
        importedAt: Date | null;
        taskType: string | null;
      }[]
    >`
      SELECT "id", "importedAt", "taskType"::text AS "taskType"
      FROM "ImportSession"
      ORDER BY "importedAt" DESC NULLS LAST
      LIMIT 20
    `;

    const placeholders = MIGRATION_NAMES.map((_, i) => `$${i + 1}`).join(', ');
    const migrationRows = await prisma.$queryRawUnsafe<
      {
        migration_name: string;
        finished_at: Date | null;
        rolled_back_at: Date | null;
        started_at: Date | null;
      }[]
    >(
      `SELECT migration_name, finished_at, rolled_back_at, started_at
       FROM "_prisma_migrations"
       WHERE migration_name IN (${placeholders})
       ORDER BY migration_name`,
      ...MIGRATION_NAMES,
    );

    const payload = {
      success: true,
      generatedAt: new Date().toISOString(),
      /** Which database this server process connects to (from env — compare local vs Netlify). */
      databaseUrlSanitized: sanitizeDatabaseUrl(),
      session: session
        ? {
            current_database: session.current_database,
            current_schema: session.current_schema,
            pg_version: session.pg_version,
            /** Internal listen address (may be null on some providers). */
            inet_server_addr: session.server_addr,
            inet_server_port: session.server_port,
          }
        : null,
      taskTypeEnumLabels: enumRows.map((r) => r.label),
      columns: {
        Task: {
          yotpoEmail: taskYotpoEmail,
          holdsOrderNumber: taskHoldsOrderNumber,
        },
        User: {
          agentTypes: userAgentTypes,
        },
        ImportSession: {
          taskType: importSessionTaskType,
          taskTypeColumnType: importSessionTaskTypeType ?? null,
          prismaExpectedType: 'TaskType? (enum)',
          recentTaskTypeRows: recentImportSessionTaskTypes.map((r) => ({
            id: r.id,
            importedAt: r.importedAt?.toISOString() ?? null,
            taskType: r.taskType,
          })),
        },
      },
      prismaMigrations: migrationRows,
      /** Hint: if HOLDS is missing from taskTypeEnumLabels, run migrate deploy including 20260507123000. */
      enumParityHint:
        enumRows.some((r) => r.label === 'HOLDS') && enumRows.some((r) => r.label === 'YOTPO')
          ? 'TaskType includes HOLDS and YOTPO'
          : 'TaskType missing HOLDS and/or YOTPO — deploy parity migration 20260507123000_force_tasktype_enum_parity',
    };

    return NextResponse.json(payload, {
      status: 200,
      headers: { 'cache-control': 'no-store' },
    });
  } catch (e) {
    console.error('[db-schema-truth]', e);
    return NextResponse.json(
      {
        success: false,
        error: e instanceof Error ? e.message : String(e),
        databaseUrlSanitized: sanitizeDatabaseUrl(),
      },
      { status: 500 },
    );
  }
}
