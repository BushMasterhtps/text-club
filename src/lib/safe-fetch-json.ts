/**
 * Read response body as text once, parse JSON safely.
 * Avoids res.json() on empty 5xx bodies (Sentry noise, accidental throws).
 */
export async function parseFetchJsonSafely(response: Response): Promise<{
  ok: boolean;
  status: number;
  data: unknown | null;
}> {
  const status = response.status;
  let text = "";
  try {
    text = await response.text();
  } catch {
    return { ok: response.ok, status, data: null };
  }
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: response.ok, status, data: null };
  }
  try {
    const data = JSON.parse(trimmed) as unknown;
    return { ok: response.ok, status, data };
  } catch {
    return { ok: response.ok, status, data: null };
  }
}
