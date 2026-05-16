import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = process.env.JWT_SECRET;

const PUBLIC_ROUTES = ['/', '/login', '/api/auth/login'];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.includes(pathname);
}

function isManagerPortalRoute(pathname: string): boolean {
  return (
    pathname.startsWith('/manager') ||
    pathname.startsWith('/holds') ||
    pathname.startsWith('/email-requests') ||
    pathname.startsWith('/yotpo') ||
    pathname.startsWith('/wod-ivcs') ||
    pathname.startsWith('/analytics')
  );
}

function isAgentPortalRoute(pathname: string): boolean {
  return pathname.startsWith('/agent');
}

function isProtectedPortalRoute(pathname: string): boolean {
  return isManagerPortalRoute(pathname) || isAgentPortalRoute(pathname);
}

function isManagerRole(role: string): boolean {
  return role === 'MANAGER' || role === 'MANAGER_AGENT';
}

function isAgentRole(role: string): boolean {
  return role === 'AGENT' || role === 'MANAGER_AGENT';
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get('auth-token')?.value;

  if (!token) {
    if (isProtectedPortalRoute(pathname)) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    return NextResponse.next();
  }

  try {
    if (!JWT_SECRET) {
      console.error('JWT_SECRET is not set in edge runtime; redirecting to /login');
      if (isProtectedPortalRoute(pathname)) {
        return NextResponse.redirect(new URL('/login', request.url));
      }
      return NextResponse.next();
    }

    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(JWT_SECRET)
    );

    const role = payload.role as string;

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-user-id', payload.userId as string);
    requestHeaders.set('x-user-role', role);
    requestHeaders.set('x-user-email', payload.email as string);
    requestHeaders.set(
      'x-must-change-password',
      (payload.mustChangePassword as boolean)?.toString() || 'false'
    );

    if (isManagerPortalRoute(pathname) && !isManagerRole(role)) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    if (isAgentPortalRoute(pathname) && !isAgentRole(role)) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  } catch {
    if (isProtectedPortalRoute(pathname)) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    '/manager/:path*',
    '/agent/:path*',
    '/holds/:path*',
    '/email-requests/:path*',
    '/yotpo/:path*',
    '/wod-ivcs/:path*',
    '/analytics/:path*',
    '/api/manager/:path*',
    '/api/agent/:path*',
    '/api/auth/change-password',
    '/api/auth/check-password-change',
    '/api/auth/me',
  ],
};
