import { NextRequest, NextResponse } from 'next/server';
import { apiAuthDeniedResponse, requireManagerApiAuth } from '@/lib/auth';

/**
 * Debug/test APIs: 404 in production; otherwise require manager session (cookie JWT only).
 * Do not rely on middleware or x-user-* headers.
 */
export async function gateSensitiveDebugEndpoint(
  request: NextRequest
): Promise<NextResponse | null> {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const auth = await requireManagerApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);
  return null;
}
