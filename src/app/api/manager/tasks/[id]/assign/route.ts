import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { TaskStatus } from '@prisma/client';
import { apiAuthDeniedResponse, requireManagerApiAuth } from '@/lib/auth';
import {
  assignmentNotEligibleMessage,
  inactiveAgentAssignmentMessage,
  invalidAssigneeRoleMessage,
  isUserEligibleForTaskType,
} from '@/lib/agent-specialization';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireManagerApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  try {
    const taskId = params.id;
    const body = await request.json();
    const { agentId } = body;

    if (!taskId || !agentId) {
      return NextResponse.json({
        success: false,
        error: 'Task ID and Agent ID are required',
      }, { status: 400 });
    }

    // Find the task
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { 
        id: true, 
        assignedToId: true, 
        status: true,
        taskType: true 
      },
    });

    if (!task) {
      return NextResponse.json({
        success: false,
        error: 'Task not found',
      }, { status: 404 });
    }

    // Verify the agent exists and may receive this task type
    const agent = await prisma.user.findUnique({
      where: { id: agentId },
      select: { id: true, name: true, email: true, agentTypes: true, isActive: true, role: true },
    });

    if (!agent) {
      return NextResponse.json({
        success: false,
        error: 'Agent not found',
      }, { status: 404 });
    }
    if (!agent.isActive) {
      return NextResponse.json(
        { success: false, error: inactiveAgentAssignmentMessage() },
        { status: 400 }
      );
    }
    if (agent.role !== 'AGENT' && agent.role !== 'MANAGER_AGENT') {
      return NextResponse.json(
        { success: false, error: invalidAssigneeRoleMessage() },
        { status: 400 }
      );
    }
    if (!isUserEligibleForTaskType(agent, task.taskType)) {
      return NextResponse.json(
        { success: false, error: assignmentNotEligibleMessage(task.taskType) },
        { status: 400 }
      );
    }

    // Update the task assignment (this will automatically unassign from previous agent)
    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: {
        assignedToId: agentId,
        // Status logic: PENDING when assigned (agent must click Start to begin)
        status: TaskStatus.PENDING,
        // Clear any previous task data when reassigning
        startTime: null,
        endTime: null,
        durationSec: null,
        disposition: null,
        assistanceRequestedAt: null,
        assistancePausedDurationSec: null,
        assistanceNotes: null,
        managerResponse: null,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Task assigned to ${agent.name}`,
      task: {
        id: updatedTask.id,
        assignedToId: updatedTask.assignedToId,
        status: updatedTask.status,
        taskType: updatedTask.taskType,
      },
    });
  } catch (error) {
    console.error('Error assigning task:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to assign task',
    }, { status: 500 });
  }
}
