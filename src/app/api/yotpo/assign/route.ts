import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Yotpo Task Assignment API
 * Assigns pending Yotpo tasks to agents
 */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { taskIds, agentIds, mode = 'distribute' } = body;

    if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No task IDs provided'
      }, { status: 400 });
    }

    if (!agentIds || !Array.isArray(agentIds) || agentIds.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No agent IDs provided'
      }, { status: 400 });
    }

    // Verify all agents exist
    const agents = await prisma.user.findMany({
      where: {
        id: { in: agentIds }
      },
      select: {
        id: true,
        name: true,
        email: true
      }
    });

    if (agents.length !== agentIds.length) {
      return NextResponse.json({
        success: false,
        error: 'One or more agents not found'
      }, { status: 404 });
    }

    // Distribute tasks among agents
    const assignments = [];
    const results = {
      assigned: 0,
      errors: 0,
      errorDetails: [] as any[]
    };

    for (let i = 0; i < taskIds.length; i++) {
      const taskId = taskIds[i];
      const agentId = agentIds[i % agentIds.length]; // Round-robin distribution

      try {
        const updated = await prisma.task.update({
          where: { id: taskId },
          data: {
            assignedToId: agentId,
            status: 'IN_PROGRESS',
            startTime: new Date()
          },
          include: {
            assignedTo: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        });

        assignments.push({
          taskId,
          agentId,
          agentName: updated.assignedTo?.name || updated.assignedTo?.email
        });

        results.assigned++;
      } catch (error) {
        console.error(`Error assigning task ${taskId}:`, error);
        results.errors++;
        results.errorDetails.push({
          taskId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Assigned ${results.assigned} Yotpo tasks to ${agents.length} agent(s)`,
      results: {
        assigned: results.assigned,
        errors: results.errors,
        assignments,
        errorDetails: results.errorDetails
      }
    });

  } catch (error) {
    console.error('Yotpo assignment API error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to assign tasks'
    }, { status: 500 });
  }
}

