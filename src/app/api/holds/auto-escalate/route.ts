import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Auto-escalate Holds tasks that are 4+ days old
 * Moves tasks from any queue to "Escalated Call 4+ Day" if order date is 4+ days old
 */

export async function POST(request: NextRequest) {
  try {
    // Find all Holds tasks that are 4+ days old but NOT in Escalated Call queue
    const currentDate = new Date();
    const fourDaysAgo = new Date(currentDate.getTime() - (4 * 24 * 60 * 60 * 1000));
    
    const tasksToEscalate = await prisma.task.findMany({
      where: {
        taskType: 'HOLDS',
        status: { in: ['PENDING', 'IN_PROGRESS', 'ASSISTANCE_REQUIRED'] },
        holdsStatus: { not: 'Escalated Call 4+ Day' },
        holdsOrderDate: {
          lte: fourDaysAgo // Order date is 4+ days ago
        }
      },
      select: {
        id: true,
        holdsOrderNumber: true,
        holdsOrderDate: true,
        holdsStatus: true,
        holdsQueueHistory: true,
        assignedTo: {
          select: {
            name: true,
            email: true
          }
        }
      }
    });

    console.log(`🔍 Found ${tasksToEscalate.length} tasks to auto-escalate`);

    if (tasksToEscalate.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No tasks need auto-escalation',
        escalated: 0
      });
    }

    // Log tasks being escalated
    tasksToEscalate.forEach((task, index) => {
      const daysSince = task.holdsOrderDate 
        ? Math.floor((currentDate.getTime() - task.holdsOrderDate.getTime()) / (1000 * 60 * 60 * 24))
        : 0;
      
      if (index < 5) {
        console.log(`  ${index + 1}. ${task.holdsOrderNumber}: ${daysSince} days old, moving from "${task.holdsStatus}" to "Escalated Call 4+ Day"`);
      }
    });

    // Update each task to Escalated Call queue
    let escalatedCount = 0;
    for (const task of tasksToEscalate) {
      // Update queue history
      const history = Array.isArray(task.holdsQueueHistory) ? [...task.holdsQueueHistory] : [];
      
      // Close out current queue entry
      if (history.length > 0 && !history[history.length - 1].exitedAt) {
        history[history.length - 1].exitedAt = new Date().toISOString();
      }
      
      // Add entry for Escalated Call queue
      history.push({
        queue: 'Escalated Call 4+ Day',
        enteredAt: new Date().toISOString(),
        exitedAt: null,
        movedBy: 'System (Auto-escalation)',
        note: 'Auto-escalated: Order reached 4+ days old',
        previousQueue: task.holdsStatus
      });
      
      await prisma.task.update({
        where: { id: task.id },
        data: {
          holdsStatus: 'Escalated Call 4+ Day',
          holdsQueueHistory: history,
          updatedAt: new Date()
        }
      });
      
      escalatedCount++;
    }

    console.log(`✅ Auto-escalated ${escalatedCount} tasks`);

    return NextResponse.json({
      success: true,
      message: `Successfully auto-escalated ${escalatedCount} task(s) to Escalated Call queue`,
      escalated: escalatedCount,
      tasks: tasksToEscalate.map(t => ({
        orderNumber: t.holdsOrderNumber,
        previousQueue: t.holdsStatus,
        assignedTo: t.assignedTo?.name || 'Unassigned'
      }))
    });

  } catch (error) {
    console.error('Error auto-escalating tasks:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to auto-escalate tasks'
    }, { status: 500 });
  }
}

