import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Cleanup Holds Test Data
 * 
 * This endpoint deletes all Holds test data:
 * - All Holds tasks from all workflow queues
 * - All Holds import sessions (duplicate history)
 * - Related TaskHistory and AssistanceRequests for Holds tasks
 * 
 * ⚠️ WARNING: This is a destructive operation. Use with caution!
 */

export async function POST(request: NextRequest) {
  try {
    console.log('🧹 Starting Holds test data cleanup...');

    // Step 1: Get all Holds task IDs first
    const holdsTaskIds = await prisma.task.findMany({
      where: {
        taskType: 'HOLDS'
      },
      select: {
        id: true
      }
    });

    const taskIds = holdsTaskIds.map(t => t.id);
    console.log(`📋 Found ${taskIds.length} Holds tasks to delete`);

    // Step 2: Delete related records first (to avoid foreign key constraints)
    
    // Delete TaskHistory entries for Holds tasks
    const deleteHistoryResult = await prisma.taskHistory.deleteMany({
      where: {
        taskId: {
          in: taskIds
        }
      }
    });
    console.log(`✅ Deleted ${deleteHistoryResult.count} Holds task history entries`);

    // Delete AssistanceRequests for Holds tasks
    const deleteAssistanceResult = await prisma.assistanceRequest.deleteMany({
      where: {
        taskId: {
          in: taskIds
        }
      }
    });
    console.log(`✅ Deleted ${deleteAssistanceResult.count} Holds assistance requests`);

    // Step 3: Delete all Holds tasks
    const deleteTasksResult = await prisma.task.deleteMany({
      where: {
        taskType: 'HOLDS'
      }
    });
    console.log(`✅ Deleted ${deleteTasksResult.count} Holds tasks`);

    // Step 4: Delete all Holds import sessions (this includes duplicate history)
    const deleteImportSessionsResult = await prisma.importSession.deleteMany({
      where: {
        taskType: 'HOLDS'
      }
    });
    console.log(`✅ Deleted ${deleteImportSessionsResult.count} Holds import sessions`);

    // Note: ImportDuplicate records should be automatically deleted due to CASCADE
    // when we delete ImportSession records

    // Summary
    const summary = {
      tasksDeleted: deleteTasksResult.count,
      importSessionsDeleted: deleteImportSessionsResult.count,
      historyDeleted: deleteHistoryResult.count,
      assistanceRequestsDeleted: deleteAssistanceResult.count,
      totalDeleted: 
        deleteTasksResult.count + 
        deleteImportSessionsResult.count + 
        deleteHistoryResult.count + 
        deleteAssistanceResult.count
    };

    console.log('🎉 Holds test data cleanup completed!', summary);

    return NextResponse.json({
      success: true,
      message: 'Holds test data cleanup completed successfully',
      summary
    });

  } catch (error) {
    console.error('❌ Error during Holds test data cleanup:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to cleanup Holds test data',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

