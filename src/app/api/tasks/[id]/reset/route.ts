import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";

const prisma = new PrismaClient();

async function resetTask(id: string) {
  try {
    const task = await prisma.task.update({
      where: { id },
      data: {
        status: "PENDING",
        startTime: null,
        endTime: null,
        durationSec: null,
        disposition: null,
        sfOrderNumber: null,
        assistanceNotes: null,
        history: { create: { action: "RESET", newStatus: "PENDING" } },
      },
    });
    return NextResponse.json(task);
  } catch (err) {
    console.error("resetTask error:", err);
    return NextResponse.json({ error: "Failed to reset task" }, { status: 500 });
  }
}

export async function PATCH(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  return resetTask(id);
}

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  return resetTask(id);
}