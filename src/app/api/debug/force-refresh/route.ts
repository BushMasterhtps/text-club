import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST() {
  try {
    console.log('🔄 Force refresh: Clearing caches and checking database...');
    
    // Force a fresh database connection
    await prisma.$disconnect();
    await prisma.$connect();
    
    // Check database status
    const [taskCount, rawMessageCount, userCount] = await Promise.all([
      prisma.task.count(),
      prisma.rawMessage.count(),
      prisma.user.count()
    ]);
    
    // Get sample data
    const sampleTasks = await prisma.task.findMany({
      take: 5,
      select: {
        id: true,
        taskType: true,
        status: true,
        assignedToId: true,
        brand: true
      }
    });
    
    const sampleRawMessages = await prisma.rawMessage.findMany({
      take: 5,
      select: {
        id: true,
        status: true,
        brand: true,
        text: true
      }
    });
    
    return NextResponse.json({
      success: true,
      message: 'Force refresh completed',
      database: {
        taskCount,
        rawMessageCount,
        userCount,
        sampleTasks,
        sampleRawMessages,
        databaseUrl: process.env.DATABASE_URL ? 'Set' : 'Not set',
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('❌ Force refresh error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}
