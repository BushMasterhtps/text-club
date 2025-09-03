import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    console.log("🔍 Assistance API: Fetching assistance requests...");
    
    // Fetch all tasks that have assistance notes
    const tasks = await prisma.task.findMany({
      where: {
        assistanceNotes: { not: null },
        status: { in: ["ASSISTANCE_REQUIRED", "IN_PROGRESS"] }
      },
      include: {
        assignedTo: {
          select: {
            name: true,
            email: true
          }
        },
        rawMessage: {
          select: {
            brand: true,
            phone: true,
            text: true
          }
        }
      },
      orderBy: {
        updatedAt: "desc"
      }
    });

    console.log("🔍 Assistance API: Found", tasks.length, "tasks with assistance notes");
    
    // Transform the data to match the frontend interface
    const requests = tasks.map(task => ({
      id: task.id,
      brand: task.brand || task.rawMessage?.brand || "Unknown",
      phone: task.phone || task.rawMessage?.phone || "Unknown",
      text: task.text || task.rawMessage?.text || "Unknown",
      agentName: task.assignedTo?.name || "Unknown",
      agentEmail: task.assignedTo?.email || "Unknown",
      assistanceNotes: task.assistanceNotes || "",
      managerResponse: task.managerResponse,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
      status: task.status
    }));

    console.log("🔍 Assistance API: Returning", requests.length, "requests");

    return NextResponse.json({
      success: true,
      requests
    });
  } catch (error: any) {
    console.error("Failed to fetch assistance requests:", error);
    return NextResponse.json({
      success: false,
      error: error?.message || "Failed to fetch assistance requests"
    }, { status: 500 });
  }
}
