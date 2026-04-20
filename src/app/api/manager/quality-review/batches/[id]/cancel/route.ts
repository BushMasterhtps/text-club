import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiAuthDeniedResponse, requireManagerApiAuth } from "@/lib/auth";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireManagerApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  const { id: batchId } = await context.params;

  try {
    const batch = await prisma.qASampleBatch.findFirst({
      where: { id: batchId, reviewerId: auth.userId },
    });

    if (!batch) {
      return NextResponse.json({ success: false, error: "Batch not found" }, { status: 404 });
    }

    if (batch.status === "COMPLETED") {
      return NextResponse.json(
        { success: false, error: "Cannot cancel a completed batch" },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.qASampleBatchTask.deleteMany({ where: { batchId } });
      await tx.qATaskReview.deleteMany({
        where: { batchId, status: "PENDING" },
      });
      await tx.qASampleBatch.update({
        where: { id: batchId },
        data: { status: "CANCELLED" },
      });
    });

    return NextResponse.json({ success: true, data: { batchId, status: "CANCELLED" } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[quality-review/batches/cancel]", e);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
