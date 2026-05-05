import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type DbClient = Prisma.TransactionClient | typeof prisma;

/**
 * Removes draft (PENDING) QA reviews whose reservation TTL has passed.
 * Submitted reviews and history are untouched. Line results only exist after submit.
 */
export async function deleteExpiredQaPendingReviewsForTask(
  db: DbClient,
  taskId: string,
  now: Date = new Date()
): Promise<{ count: number }> {
  const result = await db.qATaskReview.deleteMany({
    where: {
      taskId,
      status: "PENDING",
      expiresAt: { lt: now },
    },
  });
  return { count: result.count };
}
