import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Production-safe health check. Call from browser or Netlify to verify DB reachability.
 * GET /api/health → { ok: true } or { ok: false, reason: "database" }
 */
export async function GET() {
  const hasDbUrl = !!process.env.DATABASE_URL;

  if (!hasDbUrl) {
    console.error('[Health] DATABASE_URL is not set');
    return NextResponse.json(
      { ok: false, reason: 'database', message: 'DATABASE_URL not configured' },
      { status: 503 }
    );
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Health] Database check failed:', msg);
    return NextResponse.json(
      { ok: false, reason: 'database', message: 'Database unreachable' },
      { status: 503 }
    );
  }
}
