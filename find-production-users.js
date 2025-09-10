const { PrismaClient } = require('@prisma/client');

async function findProductionUsers() {
  const prisma = new PrismaClient();

  try {
    console.log('🔍 Finding users in production database...');
    
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true
      }
    });

    console.log(`📋 FOUND ${users.length} USERS:`);
    users.forEach(user => {
      console.log(`   ${user.email} (${user.name}) - ${user.role}`);
    });

    // Also check for any sent-back tasks
    const sentBackTasks = await prisma.task.findMany({
      where: {
        sentBackBy: { not: null }
      },
      select: {
        id: true,
        taskType: true,
        sentBackBy: true,
        sentBackDisposition: true,
        sentBackAt: true
      },
      take: 5
    });

    console.log(`\n📋 SENT-BACK TASKS (sample):`);
    sentBackTasks.forEach(task => {
      console.log(`   Task ${task.id}: ${task.taskType} - ${task.sentBackDisposition}`);
    });

  } catch (error) {
    console.error('❌ Error finding users:', error);
  } finally {
    await prisma.$disconnect();
  }
}

findProductionUsers();
