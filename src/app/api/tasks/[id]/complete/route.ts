import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import { apiAuthDeniedResponse, requireManagerApiAuth } from "@/lib/auth";

const prisma = new PrismaClient();

async function completeTask(id: string) {
  try {
    const existing = await prisma.task.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const end = new Date();
    const start = existing.startTime ?? end;
    const durationSec = Math.max(0, Math.floor((+end - +start) / 1000));

    const task = await prisma.task.update({
      where: { id },
      data: {
        status: "COMPLETED",
        endTime: end,
        durationSec,
        history: {
          create: {
            action: "COMPLETE",
            prevStatus: existing.status,
            newStatus: "COMPLETED",
          },
        },
      },
    });

    return NextResponse.json(task);
  } catch (err) {
    console.error("completeTask error:", err);
    return NextResponse.json({ error: "Failed to complete task" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireManagerApiAuth(req);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);
  const { id } = await context.params;
  return completeTask(id);
}