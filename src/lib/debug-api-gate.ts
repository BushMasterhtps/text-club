import { NextResponse } from 'next/server';

/**
 * Debug API routes must not run outside local development.
 * Production/staging return 404 to avoid recon and accidental exposure.
 */
export function denyDebugApiOutsideDevelopment(): NextResponse | null {
  if (process.env.NODE_ENV === 'development') {
    return null;
  }
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
