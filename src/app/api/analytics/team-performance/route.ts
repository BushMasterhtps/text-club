import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!startDate || !endDate) {
      return NextResponse.json({
        success: false,
        error: 'Start date and end date are required'
      }, { status: 400 });
    }

    // Parse dates and create date range
    const start = new Date(startDate + 'T00:00:00.000Z');
    const end = new Date(endDate + 'T23:59:59.999Z');

    // Get all agents
    const agents = await prisma.user.findMany({
      where: {
        role: { in: ["AGENT", "MANAGER"] }
      },
      select: {
        id: true,
        name: true,
        email: true
      }
    });

    // Get team performance data
    const teamPerformanceData = [];

    for (const agent of agents) {
      // Get completed tasks for each task type
      const taskTypes = ['TEXT_CLUB', 'WOD_IVCS', 'EMAIL_REQUESTS', 'STANDALONE_REFUNDS'];
      
      for (const taskType of taskTypes) {
        // Count completed tasks (including sent-back tasks)
        const completedTasks = await prisma.task.findMany({
          where: {
            OR: [
              {
                assignedToId: agent.id,
                status: "COMPLETED",
                taskType: taskType as any,
                endTime: { gte: start, lte: end }
              },
              {
                sentBackBy: agent.id,
                status: "PENDING",
                taskType: taskType as any,
                endTime: { gte: start, lte: end }
              }
            ]
          },
          select: {
            durationSec: true,
            endTime: true
          }
        });

        if (completedTasks.length > 0) {
          const totalDuration = completedTasks.reduce((sum, task) => sum + (task.durationSec || 0), 0);
          const avgHandleTime = totalDuration / completedTasks.length;

          teamPerformanceData.push({
            agentId: agent.id,
            agentName: agent.name || 'Unknown',
            agentEmail: agent.email,
            taskType: taskType,
            completedCount: completedTasks.length,
            avgHandleTime: Math.round(avgHandleTime),
            totalDuration: totalDuration
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: teamPerformanceData
    });

  } catch (error) {
    console.error('Team Performance API Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to load team performance data'
    }, { status: 500 });
  }
}
