import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET() {
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
        isRailway: dbInfo[0].inet_server_addr === 'interchange.proxy.rlwy.net' || 
                   dbInfo[0].inet_server_addr === 'postgres.railway.internal'
      },
      data: {
        userCount,
        taskCount,
        sampleUsers
      },
      environment: {
        DATABASE_URL: process.env.DATABASE_URL ? 'SET' : 'NOT SET'
      }
    });
    
  } catch (error) {
    return NextResponse.json({
      error: error.message,
      environment: {
        DATABASE_URL: process.env.DATABASE_URL ? 'SET' : 'NOT SET'
      }
    }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
