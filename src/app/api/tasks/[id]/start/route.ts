import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";

const prisma = new PrismaClient();

async function startTask(id: string) {
  try {
    const existing = await prisma.task.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const task = await prisma.task.update({
      where: { id },
      data: {
        status: "IN_PROGRESS",
        startTime: new Date(),
        history: { create: { action: "START", newStatus: "IN_PROGRESS" } },
      },
    });

    return NextResponse.json(task);
  } catch (err) {
    console.error("startTask error:", err);
    return NextResponse.json({ error: "Failed to start task" }, { status: 500 });
  }
}

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  return startTask(id);
}