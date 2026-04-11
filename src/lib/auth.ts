import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('CRITICAL: JWT_SECRET environment variable is not set! Check Netlify configuration.');
}

export interface AuthResult {
  success: boolean;
  userId?: string;
  userRole?: string;
  userEmail?: string;
  mustChangePassword?: boolean;
  error?: string;
}

export type ManagerApiAuthDenied = {
  allowed: false;
  status: 401 | 403;
  message: string;
};

export type ManagerApiAuthOk = {
  allowed: true;
  userId: string;
  userRole: string;
  userEmail: string;
};

/**
 * Handler-level manager check using the auth cookie JWT only (not x-user-* headers).
 * Use for sensitive routes outside /api/manager/* middleware header injection.
 * 401: missing/invalid token; 403: authenticated but not MANAGER / MANAGER_AGENT.
 */
export async function requireManagerApiAuth(
  request: NextRequest
): Promise<ManagerApiAuthOk | ManagerApiAuthDenied> {
  const auth = await verifyAuth(request);
  if (!auth.success) {
    return {
      allowed: false,
      status: 401,
      message: auth.error || 'Unauthorized',
    };
  }
  if (auth.userRole !== 'MANAGER' && auth.userRole !== 'MANAGER_AGENT') {
    return {
      allowed: false,
      status: 403,
      message: 'Forbidden: manager access required',
    };
  }
  return {
    allowed: true,
    userId: auth.userId!,
    userRole: auth.userRole!,
    userEmail: auth.userEmail!,
  };
}

/** Standard JSON response for handler-level 401/403 from require*ApiAuth helpers. */
export function apiAuthDeniedResponse(denied: ManagerApiAuthDenied) {
  return NextResponse.json(
    { success: false, error: denied.message },
    { status: denied.status }
  );
}

/**
 * Any logged-in staff (AGENT, MANAGER, MANAGER_AGENT). Use for read APIs shared by agent + manager UIs.
 */
export async function requireStaffApiAuth(
  request: NextRequest
): Promise<ManagerApiAuthOk | ManagerApiAuthDenied> {
  const auth = await verifyAuth(request);
  if (!auth.success) {
    return {
      allowed: false,
      status: 401,
      message: auth.error || 'Unauthorized',
    };
  }
  const role = auth.userRole!;
  if (role !== 'AGENT' && role !== 'MANAGER' && role !== 'MANAGER_AGENT') {
    return {
      allowed: false,
      status: 403,
      message: 'Forbidden: staff access required',
    };
  }
  return {
    allowed: true,
    userId: auth.userId!,
    userRole: role,
    userEmail: auth.userEmail!,
  };
}

export async function verifyAuth(request: NextRequest): Promise<AuthResult> {
  try {
    // Get token from cookies
    const token = request.cookies.get('auth-token')?.value;

    if (!token) {
      return { success: false, error: 'No authentication token found' };
    }

    // Verify JWT token
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(JWT_SECRET)
    );

    return {
      success: true,
      userId: payload.userId as string,
      userRole: payload.role as string,
      userEmail: payload.email as string,
      mustChangePassword: payload.mustChangePassword as boolean
    };

  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Invalid authentication token' 
    };
  }
}

export function getAuthFromHeaders(request: NextRequest): AuthResult {
  try {
    const userId = request.headers.get('x-user-id');
    const userRole = request.headers.get('x-user-role');
    const userEmail = request.headers.get('x-user-email');
    const mustChangePassword = request.headers.get('x-must-change-password') === 'true';

    if (!userId || !userRole || !userEmail) {
      return { success: false, error: 'Missing user information in headers' };
    }

    return {
      success: true,
      userId,
      userRole,
      userEmail,
      mustChangePassword
    };

  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to extract user information' 
    };
  }
}

/**
 * SECURITY: Verify manager role for API endpoints
 * Add this at the start of EVERY /api/manager/* route
 */
export function requireManagerRole(request: NextRequest): AuthResult {
  const auth = getAuthFromHeaders(request);
  
  if (!auth.success) {
    return auth;
  }
  
  // Verify user has manager access
  if (auth.userRole !== 'MANAGER' && auth.userRole !== 'MANAGER_AGENT') {
    return {
      success: false,
      error: 'Unauthorized: Manager access required'
    };
  }
  
  return auth;
}

/**
 * SECURITY: Verify agent role for API endpoints
 * Add this at the start of EVERY /api/agent/* route
 */
export function requireAgentRole(request: NextRequest): AuthResult {
  const auth = getAuthFromHeaders(request);
  
  if (!auth.success) {
    return auth;
  }
  
  // Verify user has agent access
  if (auth.userRole !== 'AGENT' && auth.userRole !== 'MANAGER_AGENT') {
    return {
      success: false,
      error: 'Unauthorized: Agent access required'
    };
  }
  
  return auth;
}
