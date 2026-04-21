import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiAuthDeniedResponse, requireManagerApiAuth } from "@/lib/auth";

/** Prisma Decimal / BigInt / Date → JSON-safe values for the manager UI. */
function serializeForClientJson<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, v) => {
      if (typeof v === "bigint") return v.toString();
      if (v instanceof Date) return v.toISOString();
      if (v && typeof v === "object") {
        const ctor = (v as { constructor?: { name?: string } }).constructor?.name;
        if (ctor === "Decimal") return (v as { toString: () => string }).toString();
      }
      return v;
    })
  );
}

const taskReviewSelect = {
  id: true,
  taskId: true,
  status: true,
  templateVersionId: true,
  batchId: true,
} as const;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string; taskId: string }> }
) {
  const auth = await requireManagerApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  const { id: batchId, taskId } = await context.params;

  try {
    const batch = await prisma.qASampleBatch.findFirst({
      where: { id: batchId, reviewerId: auth.userId },
      select: { id: true },
    });
    if (!batch) {
      return NextResponse.json({ success: false, error: "Batch not found" }, { status: 404 });
    }

    const link = await prisma.qASampleBatchTask.findFirst({
      where: { batchId, taskId },
    });
    if (!link) {
      return NextResponse.json({ success: false, error: "Task not in this batch" }, { status: 404 });
    }

    const review = await prisma.qATaskReview.findFirst({
      where: { batchId, taskId },
      select: taskReviewSelect,
    });
    if (!review) {
      return NextResponse.json({ success: false, error: "Review row missing" }, { status: 500 });
    }

    const [task, lines] = await Promise.all([
      prisma.task.findFirst({
        where: { id: taskId },
        include: {
          rawMessage: {
            select: { brand: true, phone: true, text: true, email: true },
          },
          assignedTo: { select: { id: true, name: true, email: true } },
          completedByUser: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.qALine.findMany({
        where: { templateVersionId: review.templateVersionId },
        orderBy: [{ sectionOrder: "asc" }, { lineOrder: "asc" }],
        select: {
          id: true,
          slug: true,
          sectionOrder: true,
          sectionTitle: true,
          lineOrder: true,
          label: true,
          helpText: true,
          weight: true,
          isCritical: true,
          allowNa: true,
        },
      }),
    ]);

    if (!task) {
      return NextResponse.json({ success: false, error: "Task not found" }, { status: 404 });
    }

    const taskForClient = serializeForClientJson(task);

    return NextResponse.json({
      success: true,
      data: {
        review,
        lines,
        task: taskForClient,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[quality-review/batches/task GET]", e);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
