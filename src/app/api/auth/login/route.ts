import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('CRITICAL: JWT_SECRET environment variable is not set');
}

/** TEMP: structured login diagnostics — remove or reduce after production login issue is resolved. */
function loginLog(payload: Record<string, unknown>) {
  console.info('[auth/login]', JSON.stringify({ ...payload, ts: new Date().toISOString() }));
}

function loginError(payload: Record<string, unknown>) {
  console.error('[auth/login]', JSON.stringify({ ...payload, ts: new Date().toISOString() }));
}

/** Bcrypt modular crypt format; length is normally 60. Avoid rejecting valid edge variants. */
function passwordLooksLikeBcryptHash(s: string): boolean {
  return s.length >= 59 && /^\$2[aby]\$\d{2}\$/.test(s);
}

export async function POST(request: NextRequest) {
  let normalizedEmail = '';

  try {
    let body: { email?: string; password?: string };
    try {
      body = await request.json();
    } catch {
      loginLog({ step: 'parse_body', ok: false, reason: 'invalid_json' });
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const email = body?.email;
    const password = body?.password;

    if (!email || !password) {
      loginLog({ step: 'validate_input', ok: false, reason: 'missing_email_or_password' });
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    normalizedEmail = email.toLowerCase().trim();
    loginLog({
      step: 'lookup_start',
      normalizedEmail,
    });

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        email: true,
        name: true,
        password: true,
        role: true,
        isActive: true,
        mustChangePassword: true,
      },
    });

    loginLog({
      step: 'lookup_complete',
      normalizedEmail,
      userFound: !!user,
      userId: user?.id ?? null,
      role: user?.role ?? null,
      isActive: user?.isActive ?? null,
      mustChangePassword: user?.mustChangePassword ?? null,
      namePresent: user ? user.name != null && user.name !== '' : null,
      passwordHashLength: user?.password != null ? String(user.password).length : null,
      passwordHashPresent: user ? Boolean(user.password && String(user.password).length > 0) : false,
      passwordLooksLikeBcrypt: user?.password ? passwordLooksLikeBcryptHash(String(user.password)) : false,
    });

    if (!user) {
      loginLog({ step: 'reject', normalizedEmail, reason: 'user_not_found' });
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    if (!user.isActive) {
      loginLog({ step: 'reject', normalizedEmail, userId: user.id, reason: 'account_inactive' });
      return NextResponse.json(
        { error: 'Account is deactivated' },
        { status: 401 }
      );
    }

    // Defensive: malformed rows should not throw from bcrypt — compare can throw on invalid hash format
    if (typeof user.password !== 'string' || user.password.length === 0) {
      loginError({
        step: 'invalid_user_record',
        normalizedEmail,
        userId: user.id,
        reason: 'password_field_missing_or_empty',
      });
      return NextResponse.json(
        { error: 'Unable to sign in with this account. Please contact an administrator.' },
        { status: 401 }
      );
    }

    if (!passwordLooksLikeBcryptHash(user.password)) {
      loginError({
        step: 'invalid_user_record',
        normalizedEmail,
        userId: user.id,
        reason: 'password_not_valid_bcrypt_hash',
        passwordHashLength: user.password.length,
      });
      return NextResponse.json(
        { error: 'Unable to sign in with this account. Please contact an administrator.' },
        { status: 401 }
      );
    }

    loginLog({
      step: 'password_compare_start',
      normalizedEmail,
      userId: user.id,
    });

    let isValidPassword = false;
    try {
      isValidPassword = await bcrypt.compare(password, user.password);
    } catch (compareErr) {
      loginError({
        step: 'password_compare_error',
        normalizedEmail,
        userId: user.id,
        errorMessage: compareErr instanceof Error ? compareErr.message : String(compareErr),
      });
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    loginLog({
      step: 'password_compare_complete',
      normalizedEmail,
      userId: user.id,
      passwordValid: isValidPassword,
    });

    if (!isValidPassword) {
      loginLog({ step: 'reject', normalizedEmail, userId: user.id, reason: 'wrong_password' });
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    loginLog({
      step: 'jwt_sign_start',
      normalizedEmail,
      userId: user.id,
    });

    let token: string;
    try {
      token = jwt.sign(
        {
          userId: user.id,
          email: user.email,
          role: user.role,
          name: user.name,
          mustChangePassword: user.mustChangePassword,
        },
        JWT_SECRET,
        { expiresIn: '24h' }
      );
    } catch (jwtErr) {
      loginError({
        step: 'jwt_sign_failed',
        normalizedEmail,
        userId: user.id,
        errorMessage: jwtErr instanceof Error ? jwtErr.message : String(jwtErr),
      });
      return NextResponse.json(
        { error: 'Sign-in failed. Please try again or contact support.' },
        { status: 500 }
      );
    }

    loginLog({
      step: 'jwt_sign_complete',
      normalizedEmail,
      userId: user.id,
    });

    prisma.user
      .update({
        where: { id: user.id },
        data: { lastSeen: new Date() },
      })
      .catch((err) => loginError({ step: 'last_seen_update_failed', userId: user.id, errorMessage: err?.message }));

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });

    response.cookies.set('auth-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24,
    });

    loginLog({
      step: 'success',
      normalizedEmail,
      userId: user.id,
    });

    return response;
  } catch (error) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    loginError({
      step: 'unhandled_exception',
      normalizedEmail: normalizedEmail || null,
      errorMessage: err.message,
      stack: err.stack,
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
