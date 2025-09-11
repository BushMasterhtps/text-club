import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    // Get all task statuses and types
    const taskStats = await prisma.task.groupBy({
      by: ['taskType', 'status'],
      _count: {
        id: true
      },
      orderBy: [
        { taskType: 'asc' },
        { status: 'asc' }
      ]
    });

    // Get TEXT_CLUB tasks specifically
    const textClubTasks = await prisma.task.findMany({
      where: {
        taskType: 'TEXT_CLUB'
      },
      select: {
        id: true,
        status: true,
        assignedToId: true,
        createdAt: true,
        taskType: true
      },
      take: 10,
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Get RawMessage statuses
    const rawMessageStats = await prisma.rawMessage.groupBy({
      by: ['status'],
      _count: {
        id: true
      },
      orderBy: {
        status: 'asc'
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        taskStats,
        textClubTasks,
        rawMessageStats,
        totalTasks: await prisma.task.count(),
        totalRawMessages: await prisma.rawMessage.count()
      }
    });

  } catch (error) {
    console.error('Debug Task Statuses Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to get task statuses'
    }, { status: 500 });
  }
}
