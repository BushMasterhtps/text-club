import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { gateSensitiveDebugEndpoint } from '@/lib/debug-api-gate';

export async function GET(request: NextRequest) {
  const denied = await gateSensitiveDebugEndpoint(request);
  if (denied) return denied;

  try {
    console.log('🔍 Debug: Checking database status...');
    
    // Check all tasks
    const allTasks = await prisma.task.findMany({
      select: {
        id: true,
        taskType: true,
        status: true,
        assignedToId: true,
        brand: true,
        text: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });
    
    // Check task counts by type
    const taskCounts = await prisma.task.groupBy({
      by: ['taskType'],
      _count: { _all: true }
    });
    
    // Check task counts by status
    const statusCounts = await prisma.task.groupBy({
      by: ['status'],
      _count: { _all: true }
    });
    
    // Check raw messages
    const rawMessageCounts = await prisma.rawMessage.groupBy({
      by: ['status'],
      _count: { _all: true }
    });
    
    // Check assigned tasks
    const assignedTasks = await prisma.task.findMany({
      where: { assignedToId: { not: null } },
      select: {
        id: true,
        taskType: true,
        status: true,
        assignedToId: true,
        brand: true
      }
    });
    
    // Check users
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true
      }
    });
    
    return NextResponse.json({
      success: true,
      debug: {
        totalTasks: allTasks.length,
        sampleTasks: allTasks,
        taskCountsByType: taskCounts,
        taskCountsByStatus: statusCounts,
        rawMessageCounts: rawMessageCounts,
        assignedTasks: assignedTasks.length,
        assignedTasksDetails: assignedTasks,
        users: users.length,
        usersDetails: users,
      }
    });
    
  } catch (error) {
    console.error('❌ Debug database status error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}
