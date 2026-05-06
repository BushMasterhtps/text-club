"use client";

import { parseFetchJsonSafely } from "@/lib/safe-fetch-json";

const ASSISTANCE_PATH = "/api/manager/assistance";
/** Short TTL coalesces duplicate polls in the same tab without hiding fresh data for long. */
const TTL_MS = 8000;

export type ManagerAssistanceFetchPayload = {
  success?: boolean;
  requests?: unknown[];
  error?: string;
  _degraded?: boolean;
  [key: string]: unknown;
};

export type ManagerAssistanceFetchResult = {
  ok: boolean;
  status: number;
  data: ManagerAssistanceFetchPayload | null;
};

let inflight: Promise<ManagerAssistanceFetchResult> | null = null;

type CacheEntry = { at: number; result: ManagerAssistanceFetchResult };

let cache: CacheEntry | null = null;

async function performFetch(): Promise<ManagerAssistanceFetchResult> {
  try {
    const res = await fetch(ASSISTANCE_PATH, { cache: "no-store" });
    const parsed = await parseFetchJsonSafely(res);
    return {
      ok: parsed.ok,
      status: parsed.status,
      data: parsed.data !== null ? (parsed.data as ManagerAssistanceFetchPayload) : null,
    };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

/**
 * One in-flight GET per tab process; optional short TTL reuse for identical calls.
 * Use bypassCache=true after mutations (respond to assistance, etc.).
 */
export async function fetchManagerAssistance(options?: {
  bypassCache?: boolean;
}): Promise<ManagerAssistanceFetchResult> {
  const bypass = options?.bypassCache ?? false;
  const now = Date.now();

  if (!bypass && cache && now - cache.at < TTL_MS) {
    return cache.result;
  }

  if (!inflight) {
    inflight = performFetch()
      .then((result) => {
        if (
          result.ok &&
          result.data?.success === true &&
          Array.isArray(result.data.requests) &&
          !result.data._degraded
        ) {
          cache = { at: Date.now(), result };
        }
        return result;
      })
      .finally(() => {
        inflight = null;
      });
  }

  return inflight;
}
