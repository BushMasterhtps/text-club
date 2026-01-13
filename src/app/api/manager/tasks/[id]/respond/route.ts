import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const response = body.response;

    if (!response) {
      return NextResponse.json({ success: false, error: "Response message required" }, { status: 400 });
    }

    // Find the task and verify it needs assistance
    const task = await prisma.task.findFirst({
      where: {
        id,
        status: "ASSISTANCE_REQUIRED"
      },
      select: {
        id: true,
        status: true,
        assistanceNotes: true
      }
    });

    if (!task) {
      return NextResponse.json({ success: false, error: "Task not found or not in assistance state" }, { status: 404 });
    }

    // Update task with manager response and change status to RESOLVED (stays in Assistance Request column but becomes actionable)
    const updatedTask = await prisma.task.update({
      where: { id },
      data: {
        status: "RESOLVED",
        managerResponse: response,
        updatedAt: new Date()
      },
      select: {
        id: true,
        status: true,
        managerResponse: true
      }
    });

    return NextResponse.json({ 
      success: true, 
      task: updatedTask 
    });
  } catch (err: any) {
    console.error("Error sending manager response:", err);
    return NextResponse.json({ 
      success: false, 
      error: err?.message || "Failed to send response" 
    }, { status: 500 });
  }
}
