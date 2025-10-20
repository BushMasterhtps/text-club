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
    
    return NextResponse.json({
      success: true,
      message: 'Database connection successful',
      userCount,
      testUser,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Database connection test failed:', error);
    return NextResponse.json({
      success: false,
      error: 'Database connection failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
