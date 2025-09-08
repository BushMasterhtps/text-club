import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    // Get current date boundaries for "today"
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    // Get all agents (including Manager + Agent users)
    const agents = await prisma.user.findMany({
      where: {
        role: { in: ['AGENT', 'MANAGER_AGENT'] }
      },
      select: {
        id: true,
        name: true,
        email: true,
        isLive: true,
        lastSeen: true
      }
    });

    // Get progress data for each agent with task type breakdowns
    const agentProgress = await Promise.all(
      agents.map(async (agent) => {
        const [
          assigned, 
          inProgress, 
          completedToday, 
          lastActivity,
          // Task type breakdowns
          textClubAssigned,
          textClubInProgress,
          textClubCompletedToday,
          wodIvcsAssigned,
          wodIvcsInProgress,
          wodIvcsCompletedToday,
          emailRequestsAssigned,
          emailRequestsInProgress,
          emailRequestsCompletedToday,
          standaloneRefundsAssigned,
          standaloneRefundsInProgress,
          standaloneRefundsCompletedToday
        ] = await Promise.all([
          // Total assigned tasks (PENDING + IN_PROGRESS + ASSISTANCE_REQUIRED + COMPLETED)
          prisma.task.count({
            where: { assignedToId: agent.id }
          }),
          // Currently in progress
          prisma.task.count({
            where: { 
              assignedToId: agent.id,
              status: "IN_PROGRESS"
            }
          }),
          // Completed today
          prisma.task.count({
            where: {
              assignedToId: agent.id,
              status: "COMPLETED",
              endTime: {
                gte: startOfToday,
                lt: endOfToday
              }
            }
          }),
          // Last activity (most recent task update)
          prisma.task.findFirst({
            where: { assignedToId: agent.id },
            orderBy: { updatedAt: "desc" },
            select: { updatedAt: true }
          }),
          // Text Club breakdown
          prisma.task.count({
            where: { assignedToId: agent.id, taskType: "TEXT_CLUB" }
          }),
          prisma.task.count({
            where: { assignedToId: agent.id, status: "IN_PROGRESS", taskType: "TEXT_CLUB" }
          }),
          prisma.task.count({
            where: {
              assignedToId: agent.id,
              status: "COMPLETED",
              taskType: "TEXT_CLUB",
              endTime: { gte: startOfToday, lt: endOfToday }
            }
          }),
          // WOD/IVCS breakdown
          prisma.task.count({
            where: { assignedToId: agent.id, taskType: "WOD_IVCS" }
          }),
          prisma.task.count({
            where: { assignedToId: agent.id, status: "IN_PROGRESS", taskType: "WOD_IVCS" }
          }),
          prisma.task.count({
            where: {
              assignedToId: agent.id,
              status: "COMPLETED",
              taskType: "WOD_IVCS",
              endTime: { gte: startOfToday, lt: endOfToday }
            }
          }),
          // Email Requests breakdown
          prisma.task.count({
            where: { assignedToId: agent.id, taskType: "EMAIL_REQUESTS" }
          }),
          prisma.task.count({
            where: { assignedToId: agent.id, status: "IN_PROGRESS", taskType: "EMAIL_REQUESTS" }
          }),
          prisma.task.count({
            where: {
              assignedToId: agent.id,
              status: "COMPLETED",
              taskType: "EMAIL_REQUESTS",
              endTime: { gte: startOfToday, lt: endOfToday }
            }
          }),
          // Standalone Refunds breakdown
          prisma.task.count({
            where: { assignedToId: agent.id, taskType: "STANDALONE_REFUNDS" }
          }),
          prisma.task.count({
            where: { assignedToId: agent.id, status: "IN_PROGRESS", taskType: "STANDALONE_REFUNDS" }
          }),
          prisma.task.count({
            where: {
              assignedToId: agent.id,
              status: "COMPLETED",
              taskType: "STANDALONE_REFUNDS",
              endTime: { gte: startOfToday, lt: endOfToday }
            }
          })
        ]);

        return {
          id: agent.id,
          name: agent.name || "Unknown",
          email: agent.email,
          assigned,
          inProgress,
          completedToday,
          lastActivity: lastActivity?.updatedAt || null,
          isLive: agent.isLive,
          taskTypeBreakdown: {
            textClub: {
              assigned: textClubAssigned,
              inProgress: textClubInProgress,
              completedToday: textClubCompletedToday
            },
            wodIvcs: {
              assigned: wodIvcsAssigned,
              inProgress: wodIvcsInProgress,
              completedToday: wodIvcsCompletedToday
            },
            emailRequests: {
              assigned: emailRequestsAssigned,
              inProgress: emailRequestsInProgress,
              completedToday: emailRequestsCompletedToday
            },
            standaloneRefunds: {
              assigned: standaloneRefundsAssigned,
              inProgress: standaloneRefundsInProgress,
              completedToday: standaloneRefundsCompletedToday
            }
          }
        };
      })
    );

    // Sort by completed today (descending), then by assigned (descending)
    agentProgress.sort((a, b) => {
      if (b.completedToday !== a.completedToday) {
        return b.completedToday - a.completedToday;
      }
      return b.assigned - a.assigned;
    });

    return NextResponse.json({
      success: true,
      agentProgress
    });

  } catch (error) {
    console.error('Error fetching WOD/IVCS agent progress:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch agent progress' },
      { status: 500 }
    );
  }
}
