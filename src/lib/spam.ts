// src/lib/spam.ts
import { PrismaClient } from "@prisma/client";

// ---- Prisma singleton (prevents too many connections in dev) ----
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/**
 * Scan a message for spam based on SpamRules stored in DB.
 * If a rule matches, create a SpamLabel linking the Task and the Rule.
 */
export async function scanAndLabelSpam(
  taskId: string,
  text: string | null | undefined
): Promise<string[]> {
  if (!text || !text.trim()) return [];

  // Keep the type simple to avoid model-type import issues
  const rules: Array<{ id: string; pattern: string; enabled: boolean }> =
    await prisma.spamRule.findMany({
      where: { enabled: true },
      select: { id: true, pattern: true, enabled: true },
    });

  const lowerText = text.toLowerCase();

  const matched = rules.filter(
    (r) => !!r.pattern && lowerText.includes(r.pattern.toLowerCase())
  );

  for (const rule of matched) {
    await prisma.spamLabel.create({
      data: {
        taskId,        // scalar
        ruleId: rule.id,
      },
    });
  }

  return matched.map((r) => r.pattern);
}