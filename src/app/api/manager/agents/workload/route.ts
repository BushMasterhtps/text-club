import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    // Get all agents
    const agents = await prisma.user.findMany({
      where: {
        role: { in: ['AGENT', 'MANAGER_AGENT'] },
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });

    // Get workload breakdown for each agent
    const workloadData = await Promise.all(
      agents.map(async (agent) => {
        const [wodIvcsCount, textClubCount, emailRequestsCount, standaloneRefundsCount] = await Promise.all([
          // WOD/IVCS tasks (IN_PROGRESS only)
          prisma.task.count({
            where: {
              assignedToId: agent.id,
              taskType: 'WOD_IVCS',
              status: 'IN_PROGRESS',
            },
          }),
          // Text Club tasks (IN_PROGRESS only)
          prisma.task.count({
            where: {
              assignedToId: agent.id,
              taskType: 'TEXT_CLUB',
              status: 'IN_PROGRESS',
            },
          }),
          // Email Requests tasks (IN_PROGRESS only)
          prisma.task.count({
            where: {
              assignedToId: agent.id,
              taskType: 'EMAIL_REQUESTS',
              status: 'IN_PROGRESS',
            },
          }),
          // Standalone Refunds tasks (IN_PROGRESS only)
          prisma.task.count({
            where: {
              assignedToId: agent.id,
              taskType: 'STANDALONE_REFUNDS',
              status: 'IN_PROGRESS',
            },
          }),
        ]);

        return {
          agentId: agent.id,
          agentName: agent.name,
          agentEmail: agent.email,
          workload: {
            wodIvcs: wodIvcsCount,
            textClub: textClubCount,
            emailRequests: emailRequestsCount,
            standaloneRefunds: standaloneRefundsCount,
            total: wodIvcsCount + textClubCount + emailRequestsCount + standaloneRefundsCount,
          },
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: workloadData,
    });
  } catch (error) {
    console.error('Error fetching agent workload:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch agent workload',
    }, { status: 500 });
  }
}
