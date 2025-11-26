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

    // Parse dates and create date range in PST timezone (matching Agent Status API)
    // PST = UTC - 8 hours, so PST day boundaries are:
    // Start: 8:00 AM UTC on the given date (12:00 AM PST)
    // End: 7:59 AM UTC on the next day (11:59 PM PST)
    const parsePSTDate = (dateStr: string) => {
      const [year, month, day] = dateStr.split('-').map(Number);
      return { year, month: month - 1, day }; // month is 0-indexed
    };
    
    const startDateParts = parsePSTDate(startDate);
    const endDateParts = parsePSTDate(endDate);
    
    // Start: 8 AM UTC on start date (12 AM PST)
    const start = new Date(Date.UTC(startDateParts.year, startDateParts.month, startDateParts.day, 8, 0, 0, 0));
    // End: 7:59 AM UTC on day after end date (11:59 PM PST on end date)
    const end = new Date(Date.UTC(endDateParts.year, endDateParts.month, endDateParts.day + 1, 7, 59, 59, 999));

    // Get all agents (including manager-agents)
    const agents = await prisma.user.findMany({
      where: {
        role: { in: ["AGENT", "MANAGER_AGENT"] }
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
      // First, get TOTAL count (matching Agent Status API exactly - no taskType filter)
      const totalCompletedTasks = await prisma.task.count({
        where: {
          OR: [
            {
              assignedToId: agent.id,
              status: "COMPLETED",
              endTime: { gte: start, lte: end }
            },
            {
              sentBackBy: agent.id,
              status: "PENDING",
              endTime: { gte: start, lte: end }
            },
            // Include tasks completed by this agent but now unassigned (e.g., "Unable to Resolve" for Holds)
            {
              completedBy: agent.id,
              status: "COMPLETED",
              endTime: { gte: start, lte: end }
            }
          ]
        }
      });

      // Get completed tasks for each task type (for breakdown)
      const taskTypes = ['TEXT_CLUB', 'WOD_IVCS', 'EMAIL_REQUESTS', 'YOTPO', 'HOLDS', 'STANDALONE_REFUNDS'];
      
      for (const taskType of taskTypes) {
        // Count completed tasks (including sent-back tasks and unassigned completed tasks)
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
              },
              // Include tasks completed by this agent but now unassigned (e.g., "Unable to Resolve" for Holds)
              {
                completedBy: agent.id,
                status: "COMPLETED",
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
            totalDuration: totalDuration,
            totalCompleted: totalCompletedTasks // Add total count matching Agent Status
          });
        }
      }

      // If agent has tasks but none match the known task types, still include them with total
      if (totalCompletedTasks > 0) {
        // Check if we already added this agent (has at least one task type)
        const agentHasTaskType = teamPerformanceData.some(item => item.agentId === agent.id);
        if (!agentHasTaskType) {
          // Agent has tasks but they're all NULL or unknown taskType - add a placeholder
          teamPerformanceData.push({
            agentId: agent.id,
            agentName: agent.name || 'Unknown',
            agentEmail: agent.email,
            taskType: 'OTHER',
            completedCount: totalCompletedTasks,
            avgHandleTime: 0,
            totalDuration: 0,
            totalCompleted: totalCompletedTasks
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
