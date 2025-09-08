import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST() {
  try {
    console.log('🔧 Fixing assigned task status in production...');
    
    // Find all assigned tasks that are still PENDING
    const assignedPendingTasks = await prisma.task.findMany({
      where: {
        assignedToId: { not: null },
        status: 'PENDING'
      },
      select: {
        id: true,
        taskType: true,
        status: true,
        assignedToId: true,
        brand: true
      }
    });
    
    console.log(`📊 Found ${assignedPendingTasks.length} assigned tasks that are still PENDING`);
    
    if (assignedPendingTasks.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No assigned PENDING tasks found',
        fixed: 0
      });
    }
    
    // Update all assigned PENDING tasks to IN_PROGRESS
    const updateResult = await prisma.task.updateMany({
      where: {
        assignedToId: { not: null },
        status: 'PENDING'
      },
      data: {
        status: 'IN_PROGRESS'
      }
    });
    
    console.log(`✅ Updated ${updateResult.count} tasks from PENDING to IN_PROGRESS`);
    
    // Verify the fix
    const [assignedInProgress, assignedPending] = await Promise.all([
      prisma.task.count({
        where: {
          assignedToId: { not: null },
          status: 'IN_PROGRESS'
        }
      }),
      prisma.task.count({
        where: {
          assignedToId: { not: null },
          status: 'PENDING'
        }
      })
    ]);
    
    return NextResponse.json({
      success: true,
      message: `Fixed ${updateResult.count} assigned tasks from PENDING to IN_PROGRESS`,
      fixed: updateResult.count,
      before: {
        assignedPending: assignedPendingTasks.length
      },
      after: {
        assignedInProgress,
        assignedPending
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error fixing assigned task status:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}
