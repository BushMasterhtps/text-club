#!/usr/bin/env node
/**
 * One-off manager password reset: reads secrets only from env, bcrypt-hashes, updates one user by email.
 * Intended for production recovery when no other manager can call /api/manager/users/reset-password.
 *
 * Required env:
 *   DATABASE_URL              — target DB (use production URL only when you intend prod)
 *   PASSWORD_RESET_EMAIL      — user email (lowercased for lookup)
 *   PASSWORD_RESET_PLAIN      — new temporary password (min 8 chars); never log or commit this value
 *
 * Only MANAGER or MANAGER_AGENT rows are updated (refuses other roles).
 *
 * Usage (PowerShell example):
 *   $env:DATABASE_URL="postgresql://..."
 *   $env:PASSWORD_RESET_EMAIL="daniel.murcia@goldenboltllc.com"
 *   $env:PASSWORD_RESET_PLAIN="<generate-a-strong-temp-password>"
 *   node scripts/reset-user-password-once.js
 *   Remove-Item Env:PASSWORD_RESET_PLAIN
 */

const { requireEnv } = require("./lib/require-env");
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const MANAGER_ROLES = new Set(["MANAGER", "MANAGER_AGENT"]);

async function main() {
  requireEnv("DATABASE_URL");
  const email = requireEnv("PASSWORD_RESET_EMAIL").toLowerCase().trim();
  const plain = requireEnv("PASSWORD_RESET_PLAIN");
  if (plain.length < 8) {
    console.error("PASSWORD_RESET_PLAIN must be at least 8 characters.");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, role: true, name: true },
    });
    if (!user) {
      console.error("No user found for email:", email);
      process.exit(1);
    }
    if (!MANAGER_ROLES.has(user.role)) {
      console.error(
        "Refusing to reset: role is",
        user.role,
        "(only MANAGER or MANAGER_AGENT)"
      );
      process.exit(1);
    }

    const hashed = await bcrypt.hash(plain, 10);
    await prisma.user.update({
      where: { email },
      data: {
        password: hashed,
        mustChangePassword: true,
      },
    });

    console.log("Password updated for:", user.email, `(${user.role})`);
    console.log(
      "Sign in with PASSWORD_RESET_PLAIN, then change password in the app (mustChangePassword=true)."
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
