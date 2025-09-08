// src/app/api/manager/tasks/promote/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const ids: string[] = Array.isArray(body?.ids) ? body.ids : [];
    if (ids.length === 0) {
      return NextResponse.json(
        { success: false, error: "Provide ids: string[]" },
        { status: 400 },
      );
    }

    // Load RAW rows that are still READY
    const raws = await prisma.rawMessage.findMany({
      where: { id: { in: ids }, status: "READY" },
      select: { id: true, phone: true, email: true, text: true, brand: true, createdAt: true },
    });

    if (raws.length === 0) {
      return NextResponse.json({ success: true, promoted: 0, skipped: ids.length });
    }

    await prisma.$transaction(async (tx) => {
      // Create Tasks with status PENDING
      // (use createMany once you’re comfortable w/ it; here we do a simple loop to keep it safe in SQLite)
      for (const r of raws) {
        await tx.task.create({
          data: {
            phone: r.phone ?? null,
            email: r.email ?? null,
            text: r.text ?? null,
            brand: r.brand ?? null,
            rawMessageId: r.id, // link task back to its source raw message
            status: "PENDING",
            createdAt: r.createdAt,
            taskType: "TEXT_CLUB", // Set task type for Text Club tasks
          },
        });
      }

      // Mark raws as PROMOTED
      await tx.rawMessage.updateMany({
        where: { id: { in: raws.map((r) => r.id) } },
        data: { status: "PROMOTED" },
      });
    });

    return NextResponse.json({
      success: true,
      promoted: raws.length,
      skipped: ids.length - raws.length,
    });
  } catch (err: any) {
    console.error("POST /api/manager/tasks/promote failed:", err?.message || err, err?.stack);
    return NextResponse.json(
      { success: false, error: err?.message || "Promote failed" },
      { status: 500 },
    );
  }
}