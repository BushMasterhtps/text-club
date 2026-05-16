/**
 * Clears the httpOnly auth-token cookie via the logout API.
 * Best-effort: callers should still redirect even if the request fails.
 */
export async function postLogoutClearCookie(): Promise<void> {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch {
    // Ignore network errors; redirect proceeds
  }
}

/** Clears cookie then navigates to login (current browser only). */
export async function clientLogoutAndRedirect(loginPath = '/login'): Promise<void> {
  await postLogoutClearCookie();
  window.location.href = loginPath;
}
