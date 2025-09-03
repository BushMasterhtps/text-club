import { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

export interface AuthResult {
  success: boolean;
  userId?: string;
  userRole?: string;
  userEmail?: string;
  mustChangePassword?: boolean;
  error?: string;
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
