import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { denyDebugApiOutsideDevelopment } from '@/lib/debug-api-gate';

const prisma = new PrismaClient();

export async function GET() {
  const denied = denyDebugApiOutsideDevelopment();
  if (denied) return denied;

  try {
    // Get database connection info
    const dbInfo = await prisma.$queryRaw`
      SELECT current_database(), current_user, inet_server_addr(), inet_server_port();
    `;
    
    // Check data counts
    const userCount = await prisma.user.count();
    const taskCount = await prisma.task.count();
    
    // Get a few sample users
    const sampleUsers = await prisma.user.findMany({
      take: 3,
      select: { id: true, name: true, email: true }
    });
    
    return NextResponse.json({
      database: {
        name: dbInfo[0].current_database,
        user: dbInfo[0].current_user,
        host: dbInfo[0].inet_server_addr,
        port: dbInfo[0].inet_server_port,
      },
      data: {
        userCount,
        taskCount,
        sampleUsers
      },
    });
    
  } catch (error) {
    return NextResponse.json({
      error: error.message,
    }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
