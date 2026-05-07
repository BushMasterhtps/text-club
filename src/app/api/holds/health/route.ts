import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiAuthDeniedResponse, requireManagerApiAuth } from '@/lib/auth';
import { NextResponseJsonSafe } from '@/lib/safe-json-response';
import { runHoldsProductionHealthChecks } from '@/lib/db-schema-health-checks';

/**
 * Production sanity checks for Holds + backing schema (manager-only).
 * Does not expose data rows, passwords, or connection strings.
 */
export async function GET(request: NextRequest) {
  const auth = await requireManagerApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  const diagnostics = await runHoldsProductionHealthChecks(prisma);

  return NextResponseJsonSafe({
    success: true,
    diagnostics,
  });
}
