import { NextRequest, NextResponse } from 'next/server';
import { SignJWT } from 'jose';
import { gateSensitiveDebugEndpoint } from '@/lib/debug-api-gate';

function getJwtSecretOrNull(): string | null {
  const secret = process.env.JWT_SECRET;
  return secret && secret.trim() ? secret : null;
}

/**
 * Test Mode API - Only available in development
 * Creates a test JWT token for local testing without database
 */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json(
      { success: false, error: 'Test mode only available in development' },
      { status: 403 }
    );
  }

  const denied = await gateSensitiveDebugEndpoint(request);
  if (denied) return denied;

  try {
    // Create a test JWT token
    const raw = getJwtSecretOrNull();
    if (!raw) {
      return NextResponse.json({ success: false, error: 'Server misconfigured' }, { status: 500 });
    }
    const secret = new TextEncoder().encode(raw);
    
    const token = await new SignJWT({
      userId: 'test-user-id',
      email: 'test@example.com',
      role: 'AGENT',
      mustChangePassword: false,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('24h')
      .sign(secret);

    // Create response with cookie
    const response = NextResponse.json({
      success: true,
      message: 'Test mode enabled',
      user: {
        id: 'test-user-id',
        email: 'test@example.com',
        role: 'AGENT',
      },
    });

    // Set cookie
    response.cookies.set('auth-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24, // 24 hours
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Test mode error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to enable test mode' },
      { status: 500 }
    );
  }
}
