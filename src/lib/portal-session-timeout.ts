import { clientLogoutAndRedirect } from '@/lib/client-logout';

/** Portal-wide inactivity policy. */
export const PORTAL_INACTIVITY_TIMEOUT_MINUTES = 30;
export const PORTAL_INACTIVITY_WARNING_MINUTES = 5;

/** Clears portal client state and httpOnly auth-token (current browser only). */
export function performPortalLogout(): void {
  localStorage.removeItem('currentRole');
  localStorage.removeItem('agentEmail');
  localStorage.removeItem('authToken');
  void clientLogoutAndRedirect();
}
