import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const taskId = params.id;

    if (!taskId) {
      return NextResponse.json({
        success: false,
        error: 'Task ID is required',
      }, { status: 400 });
    }

    // Find the task
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, assignedToId: true, status: true },
    });

    if (!task) {
      return NextResponse.json({
        success: false,
        error: 'Task not found',
      }, { status: 404 });
    }

    if (!task.assignedToId) {
      return NextResponse.json({
        success: false,
        error: 'Task is not assigned to anyone',
      }, { status: 400 });
    }

    // Unassign the task
    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: {
        assignedToId: null,
        status: 'PENDING', // Reset to pending when unassigned
        startTime: null, // Clear start time
        endTime: null, // Clear end time
        durationSec: null, // Clear duration
        disposition: null, // Clear disposition
        assistanceNotes: null, // Clear assistance notes
        managerResponse: null, // Clear manager response
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Task unassigned successfully',
      task: {
        id: updatedTask.id,
        assignedToId: updatedTask.assignedToId,
        status: updatedTask.status,
      },
    });
  } catch (error) {
    console.error('Error unassigning task:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to unassign task',
    }, { status: 500 });
  }
}