import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    console.log('🔍 Checking task status in production...');
    
    // Check if we should fix assigned task status
    const url = new URL(request.url);
    const shouldFix = url.searchParams.get('fix') === 'true';
    
    if (shouldFix) {
      console.log('🔧 Fixing assigned task status...');
      
      // Find and fix assigned PENDING tasks
      const updateResult = await prisma.task.updateMany({
        where: {
          assignedToId: { not: null },
          status: 'PENDING'
        },
        data: {
          status: 'IN_PROGRESS'
        }
      });
      
      console.log(`✅ Fixed ${updateResult.count} assigned tasks from PENDING to IN_PROGRESS`);
    }
    
    // Get all tasks with their status and assignment info
    const tasks = await prisma.task.findMany({
      select: {
        id: true,
        taskType: true,
        status: true,
        assignedToId: true,
        brand: true,
        text: true,
        createdAt: true,
        assignedTo: {
          select: {
            id: true,
            email: true,
            name: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    
    // Get raw messages
    const rawMessages = await prisma.rawMessage.findMany({
      select: {
        id: true,
        status: true,
        brand: true,
        text: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    
    // Count by status
    const taskStatusCounts = await prisma.task.groupBy({
      by: ['status'],
      _count: { _all: true }
    });
    
    // Count by task type
    const taskTypeCounts = await prisma.task.groupBy({
      by: ['taskType'],
      _count: { _all: true }
    });
    
    // Count assigned vs unassigned
    const assignedCount = await prisma.task.count({
      where: { assignedToId: { not: null } }
    });
    
    const unassignedCount = await prisma.task.count({
      where: { assignedToId: null }
    });
    
    return NextResponse.json({
      success: true,
      debug: {
        totalTasks: tasks.length,
        totalRawMessages: rawMessages.length,
        taskStatusCounts,
        taskTypeCounts,
        assignedCount,
        unassignedCount,
        sampleTasks: tasks.slice(0, 10),
        sampleRawMessages: rawMessages.slice(0, 10),
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('❌ Check task status error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}
