import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

// Force the exact Railway database URL
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://postgres:OUYdvdsKqOUGwpTWTUUniqINJdjqIBdy@interchange.proxy.rlwy.net:43835/railway'
    }
  }
});

export async function GET() {
  try {
    // Test connection to the exact Railway database
    const dbInfo = await prisma.$queryRaw`
      SELECT current_database(), current_user, inet_server_addr(), inet_server_port();
    `;
    
    const userCount = await prisma.user.count();
    const taskCount = await prisma.task.count();
    
    return NextResponse.json({
      message: 'Connected to FORCED Railway database',
      database: {
        name: dbInfo[0].current_database,
        user: dbInfo[0].current_user,
        host: dbInfo[0].inet_server_addr,
        port: dbInfo[0].inet_server_port,
      },
      data: {
        userCount,
        taskCount
      }
    });
    
  } catch (error) {
    return NextResponse.json({
      error: error.message
    }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
