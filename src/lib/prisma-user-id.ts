/**
 * True if `s` looks like a Prisma `@default(cuid())` id — not a display name or email local-part.
 * Used when resolving "assigned" filters so values like "DevTesting" match User.name / User.email, not User.id.
 */
export function looksLikePrismaCuid(s: string): boolean {
  const t = s.trim();
  return /^c[a-z0-9]{24}$/i.test(t);
}
