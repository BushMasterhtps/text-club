import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public routes that don't require authentication
  const publicRoutes = ['/', '/login', '/api/auth/login'];
  
  if (publicRoutes.includes(pathname)) {
    return NextResponse.next();
  }

  // Check for auth token in cookies
  const token = request.cookies.get('auth-token')?.value;

  if (!token) {
    // Redirect to login if no token
    if (pathname.startsWith('/manager') || pathname.startsWith('/agent')) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    return NextResponse.next();
  }

  try {
    // Verify JWT token
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(JWT_SECRET)
    );

    // Add user info to headers for API routes
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-user-id', payload.userId as string);
    requestHeaders.set('x-user-role', payload.role as string);
    requestHeaders.set('x-user-email', payload.email as string);
    requestHeaders.set('x-must-change-password', (payload.mustChangePassword as boolean)?.toString() || 'false');

    // Role-based access control
    if (pathname.startsWith('/manager') && payload.role !== 'MANAGER' && payload.role !== 'MANAGER_AGENT') {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    if (pathname.startsWith('/agent') && payload.role !== 'AGENT' && payload.role !== 'MANAGER_AGENT') {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });

  } catch (error) {
    // Invalid token, redirect to login
    if (pathname.startsWith('/manager') || pathname.startsWith('/agent')) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    '/manager/:path*',
    '/agent/:path*',
    '/api/manager/:path*',
    '/api/agent/:path*',
    '/api/auth/change-password',
    '/api/auth/check-password-change',
    '/api/auth/me',
  ],
};
