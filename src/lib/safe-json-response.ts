import { NextResponse } from 'next/server';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * JSON.stringify helper for API routes: avoids 500s from Prisma.Decimal / bigint in nested payloads.
 * Dates are emitted as ISO strings (JSON.stringify default for Date).
 */
export function stringifyJsonSafe(payload: unknown): string {
  return JSON.stringify(payload, (_key, val) => {
    if (typeof val === 'bigint') return val.toString();
    if (val instanceof Decimal) {
      try {
        return val.toNumber();
      } catch {
        return null;
      }
    }
    if (
      val !== null &&
      typeof val === 'object' &&
      typeof (val as { toFixed?: unknown }).toFixed === 'function' &&
      typeof (val as { toNumber?: () => number }).toNumber === 'function'
    ) {
      try {
        return (val as { toNumber: () => number }).toNumber();
      } catch {
        return null;
      }
    }
    return val;
  });
}

/** Content-Type JSON response that safely serializes Decimal/BigInt in nested structures. */
export function NextResponseJsonSafe(body: unknown, init?: ResponseInit): NextResponse {
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new NextResponse(stringifyJsonSafe(body), { ...init, headers });
}
