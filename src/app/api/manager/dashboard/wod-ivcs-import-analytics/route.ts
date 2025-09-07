import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    // Get all WOD_IVCS tasks ordered by creation time (newest first)
    const allTasks = await prisma.task.findMany({
      where: {
        taskType: 'WOD_IVCS',
      },
      include: {
        assignedTo: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc', // Newest first
      },
    });

    // Group tasks by import sessions (tasks created within 5 minutes of each other)
    const importSessions: Array<{
      id: string;
      timestamp: Date;
      formattedTime: string;
      tasks: typeof allTasks;
      sources: Record<string, {
        total: number;
        duplicates: number;
        previouslyCompleted: number;
        duplicateDetails: any[];
      }>;
      totalTasks: number;
      totalDuplicates: number;
      totalPreviouslyCompleted: number;
    }> = [];

    // Create duplicate groups for analysis
    const duplicateGroups = new Map<string, any[]>();
    allTasks.forEach(task => {
      const key = createTaskKey(task);
      if (!duplicateGroups.has(key)) {
        duplicateGroups.set(key, []);
      }
      duplicateGroups.get(key)!.push(task);
    });

    // Group tasks into import sessions
    let currentSession: typeof allTasks = [];
    let sessionStartTime: Date | null = null;

    for (const task of allTasks) {
      if (currentSession.length === 0) {
        // Start new session
        currentSession = [task];
        sessionStartTime = task.createdAt;
      } else if (sessionStartTime && 
                 Math.abs(task.createdAt.getTime() - sessionStartTime.getTime()) <= 5 * 60 * 1000) {
        // Within 5 minutes, add to current session
        currentSession.push(task);
      } else {
        // More than 5 minutes gap, finalize current session and start new one
        if (currentSession.length > 0) {
          const session = analyzeImportSession(currentSession, duplicateGroups);
          importSessions.push(session);
        }
        currentSession = [task];
        sessionStartTime = task.createdAt;
      }
    }

    // Don't forget the last session
    if (currentSession.length > 0) {
      const session = analyzeImportSession(currentSession, duplicateGroups);
      importSessions.push(session);
    }

    // Get only the last 3 import sessions
    const lastThreeImports = importSessions.slice(0, 3);

    const response = NextResponse.json({
      success: true,
      data: {
        lastThreeImports,
        totalSessions: importSessions.length,
      },
    });

    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');

    return response;
  } catch (error) {
    console.error('Error fetching WOD/IVCS import analytics:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch WOD/IVCS import analytics' }, { status: 500 });
  }
}

function analyzeImportSession(sessionTasks: any[], duplicateGroups: Map<string, any[]>) {
  // Sort tasks by creation time (oldest first for this session)
  const sortedTasks = [...sessionTasks].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const sessionStartTime = sortedTasks[0].createdAt;
  
  // Format the timestamp for display
  const formattedTime = sessionStartTime.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short'
  });

  // Analyze sources and duplicates
  const sources: Record<string, {
    total: number;
    duplicates: number;
    previouslyCompleted: number;
    duplicateDetails: any[];
  }> = {};

  let totalDuplicates = 0;
  let totalPreviouslyCompleted = 0;

  sessionTasks.forEach(task => {
    const source = task.wodIvcsSource;
    
    if (!sources[source]) {
      sources[source] = {
        total: 0,
        duplicates: 0,
        previouslyCompleted: 0,
        duplicateDetails: []
      };
    }

    sources[source].total += 1;

    // Check if this task is a duplicate
    const taskKey = createTaskKey(task);
    const duplicateGroup = duplicateGroups.get(taskKey);

    if (duplicateGroup && duplicateGroup.length > 1) {
      // Sort by creation time to find the original
      const sortedGroup = duplicateGroup.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      const original = sortedGroup[0];
      
      // Only count as duplicate if this task was created after the original
      if (task.createdAt > original.createdAt) {
        sources[source].duplicates += 1;
        totalDuplicates += 1;

        // Check if the original was completed
        if (original.status === 'COMPLETED') {
          sources[source].previouslyCompleted += 1;
          totalPreviouslyCompleted += 1;
          
          const duplicateDetail = {
            duplicateTask: {
              id: task.id,
              documentNumber: task.documentNumber,
              webOrder: task.webOrder,
              customerName: task.customerName,
              source: task.wodIvcsSource,
              createdAt: task.createdAt
            },
            originalTask: {
              id: original.id,
              documentNumber: original.documentNumber,
              webOrder: original.webOrder,
              customerName: original.customerName,
              source: original.wodIvcsSource,
              completedOn: original.endTime,
              disposition: original.disposition,
              completedBy: original.assignedTo?.name || 'Unknown',
              createdAt: original.createdAt
            },
            ageInDays: Math.floor((task.createdAt.getTime() - original.createdAt.getTime()) / (1000 * 60 * 60 * 24))
          };
          
          sources[source].duplicateDetails.push(duplicateDetail);
        }
      }
    }
  });

  return {
    id: `session-${sessionStartTime.getTime()}`,
    timestamp: sessionStartTime,
    formattedTime,
    tasks: sessionTasks,
    sources,
    totalTasks: sessionTasks.length,
    totalDuplicates,
    totalPreviouslyCompleted,
  };
}

function createTaskKey(task: any): string {
  switch (task.wodIvcsSource) {
    case 'INVALID_CASH_SALE':
      return `ICS-${task.documentNumber}`;
    case 'ORDERS_NOT_DOWNLOADING':
      return `OND-${task.webOrder}`;
    case 'SO_VS_WEB_DIFFERENCE':
      return `SWD-${task.webOrder}`;
    default:
      return `UNKNOWN-${task.id}`;
  }
}