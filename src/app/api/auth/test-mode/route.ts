import { NextRequest, NextResponse } from 'next/server';
import { SignJWT } from 'jose';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is not set');
}

/**
 * Test Mode API - Only available in development
 * Creates a test JWT token for local testing without database
 */
export async function POST(request: NextRequest) {
  // Only allow in development
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json(
      { success: false, error: 'Test mode only available in development' },
      { status: 403 }
    );
  }

  try {
    // Create a test JWT token
    const secret = new TextEncoder().encode(JWT_SECRET);
    
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
