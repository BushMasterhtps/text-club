import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiAuthDeniedResponse, requireManagerApiAuth } from '@/lib/auth';
import { Prisma } from '@prisma/client';
import { NextResponseJsonSafe } from '@/lib/safe-json-response';

const ROUTE = 'GET /api/holds/import-history';

function logImportHistory(phase: string, extra?: Record<string, unknown>) {
  console.info(
    '[holds/import-history]',
    JSON.stringify({ route: ROUTE, phase, timestamp: new Date().toISOString(), ...extra }),
  );
}

function logImportHistoryError(phase: string, error: unknown) {
  const base = { route: ROUTE, phase, timestamp: new Date().toISOString() };
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    console.error(
      '[holds/import-history]',
      JSON.stringify({
        ...base,
        prismaCode: error.code,
        message: error.message,
        meta: error.meta,
        stack: error.stack,
      }),
    );
    return;
  }
  if (error instanceof Prisma.PrismaClientValidationError) {
    console.error(
      '[holds/import-history]',
      JSON.stringify({
        ...base,
        prismaValidation: true,
        message: error.message,
        stack: error.stack,
      }),
    );
    return;
  }
  if (error instanceof Error) {
    console.error(
      '[holds/import-history]',
      JSON.stringify({
        ...base,
        message: error.message,
        name: error.name,
        stack: error.stack,
      }),
    );
    return;
  }
  console.error('[holds/import-history]', JSON.stringify({ ...base, error: String(error) }));
}

/**
 * Get Holds import history with duplicate details
 * Returns last 10 imports that had duplicates
 */
export async function GET(request: NextRequest) {
  const auth = await requireManagerApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  logImportHistory('route-start', { email: auth.userEmail });

  try {
    const { searchParams } = new URL(request.url);
    logImportHistory('params', { keys: [...searchParams.keys()] });

    const whereClause = {
      taskType: 'HOLDS' as const,
      duplicates: { gt: 0 } as const,
    };
    logImportHistory('prisma-findMany:start', { where: whereClause, take: 10 });

    const importSessions = await prisma.importSession.findMany({
      where: whereClause,
      select: {
        id: true,
        fileName: true,
        importedAt: true,
        importedBy: true,
        totalRows: true,
        imported: true,
        duplicates: true,
        errors: true,
        duplicateDetails: true,
      },
      orderBy: {
        importedAt: 'desc',
      },
      take: 10,
    });

    logImportHistory('prisma-findMany:success', { rowCount: importSessions.length });

    const sessionsPayload = importSessions.map((session) => ({
      timestamp: session.importedAt.toISOString(),
      fileName: session.fileName,
      duplicates: session.duplicateDetails ?? [],
      imported: session.imported,
      totalDuplicates: session.duplicates,
      errors: session.errors,
    }));

    logImportHistory('response:serialize', { sessionCount: sessionsPayload.length });

    return NextResponseJsonSafe({
      success: true,
      sessions: sessionsPayload,
    });
  } catch (error) {
    logImportHistoryError('GET catch', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch import history',
        ...((error instanceof Prisma.PrismaClientKnownRequestError
          ? { prismaCode: error.code, prismaMeta: error.meta }
          : {}) as Record<string, unknown>),
      },
      { status: 500 },
    );
  }
}
