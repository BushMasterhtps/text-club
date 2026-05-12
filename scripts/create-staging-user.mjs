/**
 * Create or update exactly one User row for Railway *staging* login testing.
 *
 * SAFETY:
 * - Requires ALLOW_STAGING_USER_BOOTSTRAP=1
 * - Refuses known production DB host (interchange.proxy.rlwy.net) in DATABASE_URL
 * - Does not print passwords
 *
 * Usage (staging DATABASE_URL only — from Railway staging Postgres, not production):
 *
 *   ALLOW_STAGING_USER_BOOTSTRAP=1 \
 *   DATABASE_URL="postgresql://..." \
 *   STAGING_USER_EMAIL="daniel+staging@example.com" \
 *   STAGING_USER_PASSWORD="..." \
 *   STAGING_USER_NAME="Daniel Staging" \
 *   STAGING_USER_ROLE="MANAGER" \
 *   node scripts/create-staging-user.mjs
 *
 * Optional CLI (same keys; env vars win if both set). Prefer env for password
 * so it does not appear in `ps` / shell history:
 *   node scripts/create-staging-user.mjs --email=a@b.com --name="..." --role=MANAGER --password=...
 *
 * Role must be one of: AGENT | MANAGER | MANAGER_AGENT
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

/** Known production Railway Postgres proxy host from ops docs — do not use with this script. */
const BLOCKED_DATABASE_HOST_SUBSTRINGS = ["interchange.proxy.rlwy.net"];

const VALID_ROLES = new Set(["AGENT", "MANAGER", "MANAGER_AGENT"]);

function fail(message) {
  console.error(`[create-staging-user] ${message}`);
  process.exit(1);
}

function parseDbHost(databaseUrl) {
  try {
    const u = new URL(databaseUrl);
    return (u.hostname || "").toLowerCase();
  } catch {
    return null;
  }
}

function assertNotProductionDatabase(databaseUrl) {
  const host = parseDbHost(databaseUrl);
  if (!host) {
    fail("DATABASE_URL is missing or not a valid URL (could not parse hostname).");
  }
  const haystack = databaseUrl.toLowerCase();
  for (const blocked of BLOCKED_DATABASE_HOST_SUBSTRINGS) {
    if (haystack.includes(blocked.toLowerCase()) || host.includes(blocked.toLowerCase())) {
      fail(
        "Refusing to run: DATABASE_URL matches a blocked production database host pattern. " +
          "Use the staging Postgres URL from Railway only.",
      );
    }
  }
}

function getCliArg(longName) {
  const prefix = `--${longName}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  if (!hit) return null;
  return hit.slice(prefix.length).trim() || null;
}

/** Env wins over CLI for each field. */
function requireField(envName, cliLongName, label) {
  const fromEnv = process.env[envName];
  const fromCli = getCliArg(cliLongName);
  const v = (fromEnv != null && String(fromEnv).trim() !== "" ? String(fromEnv).trim() : null) ?? fromCli;
  if (v == null || v === "") {
    fail(`Missing required ${label}: set ${envName} or --${cliLongName}=...`);
  }
  return v;
}

async function main() {
  if (process.env.ALLOW_STAGING_USER_BOOTSTRAP !== "1") {
    fail(
      'Set ALLOW_STAGING_USER_BOOTSTRAP=1 to confirm intentional staging-only user bootstrap.',
    );
  }

  const databaseUrl = requireField("DATABASE_URL", "database-url", "DATABASE_URL");
  assertNotProductionDatabase(databaseUrl);

  const emailRaw = requireField("STAGING_USER_EMAIL", "email", "STAGING_USER_EMAIL");
  const password = requireField("STAGING_USER_PASSWORD", "password", "STAGING_USER_PASSWORD");
  const name = requireField("STAGING_USER_NAME", "name", "STAGING_USER_NAME");
  const roleRaw = requireField("STAGING_USER_ROLE", "role", "STAGING_USER_ROLE").toUpperCase();

  const email = emailRaw.toLowerCase().trim();
  if (!email.includes("@")) {
    fail("STAGING_USER_EMAIL must look like a valid email address.");
  }
  if (password.length < 8) {
    fail("STAGING_USER_PASSWORD must be at least 8 characters (same minimum as change-password).");
  }
  if (!VALID_ROLES.has(roleRaw)) {
    fail(`STAGING_USER_ROLE must be one of: ${[...VALID_ROLES].join(", ")}`);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const prisma = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });

  try {
    const user = await prisma.user.upsert({
      where: { email },
      create: {
        email,
        name,
        password: passwordHash,
        role: roleRaw,
        isActive: true,
        mustChangePassword: false,
      },
      update: {
        name,
        password: passwordHash,
        role: roleRaw,
        isActive: true,
        mustChangePassword: false,
      },
      select: { id: true, email: true, role: true, name: true, isActive: true },
    });

    console.info(
      "[create-staging-user] Upserted staging user (password not logged):",
      JSON.stringify({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        isActive: user.isActive,
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[create-staging-user] Unexpected error:", err?.message || err);
  process.exit(1);
});
