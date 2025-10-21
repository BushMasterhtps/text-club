import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    console.log('Testing database connection...');
    
    // Test basic connection
    const userCount = await prisma.user.count();
    console.log('Database connection successful. User count:', userCount);
    
    // Test a simple query
    const testUser = await prisma.user.findFirst({
      select: { id: true, email: true, name: true }
    });
    
    // Test task counts by type
    const taskCounts = await Promise.all([
      prisma.task.count({ where: { taskType: 'TEXT_CLUB' } }),
      prisma.task.count({ where: { taskType: 'WOD_IVCS' } }),
      prisma.task.count({ where: { taskType: 'EMAIL_REQUESTS' } }),
      prisma.task.count({ where: { taskType: 'HOLDS' } }),
      prisma.task.count({ where: { taskType: 'STANDALONE_REFUNDS' } })
    ]);
    
    return NextResponse.json({
      success: true,
      message: 'Database connection successful',
      userCount,
      testUser,
      taskCounts: {
        TEXT_CLUB: taskCounts[0],
        WOD_IVCS: taskCounts[1],
        EMAIL_REQUESTS: taskCounts[2],
        HOLDS: taskCounts[3],
        STANDALONE_REFUNDS: taskCounts[4]
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Database connection test failed:', error);
    console.error('Database error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined
    });
    return NextResponse.json({
      success: false,
      error: 'Database connection failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
