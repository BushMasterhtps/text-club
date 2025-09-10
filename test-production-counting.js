const { PrismaClient } = require('@prisma/client');

async function testProductionCounting() {
  const prisma = new PrismaClient();

  try {
    console.log('🔍 Testing production task counting logic...');
    
    // Get current date boundaries for "today"
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    console.log(`📅 Date range for today: ${startOfToday.toISOString()} to ${endOfToday.toISOString()}`);
    console.log('');

    // Find tasks that were sent back today
    const sentBackTasks = await prisma.task.findMany({
      where: {
        sentBackBy: { not: null },
        endTime: { gte: startOfToday, lt: endOfToday }
      },
      select: {
        id: true,
        taskType: true,
        status: true,
        sentBackBy: true,
        sentBackAt: true,
        sentBackDisposition: true,
        endTime: true
      }
    });

    console.log(`📋 SENT-BACK TASKS TODAY:`);
    sentBackTasks.forEach(task => {
      console.log(`   Task ${task.id}:`);
      console.log(`     Type: ${task.taskType}`);
      console.log(`     Status: ${task.status}`);
      console.log(`     Sent back by: ${task.sentBackBy}`);
      console.log(`     Disposition: ${task.sentBackDisposition}`);
      console.log(`     End time: ${task.endTime}`);
      console.log('');
    });

    // Test the main agent stats logic
    const testUserEmail = 'daniel.murcia@goldenboltllc.com'; // Use your actual email
    const user = await prisma.user.findUnique({
      where: { email: testUserEmail }
    });

    if (!user) {
      console.log('❌ User not found:', testUserEmail);
      return;
    }

    console.log(`👤 Testing for user: ${user.email} (ID: ${user.id})`);

    // Test the main completed count (from /api/agent/stats)
    const completedCount = await prisma.task.count({
      where: {
        OR: [
          {
            assignedToId: user.id,
            status: "COMPLETED",
            endTime: { gte: startOfToday, lt: endOfToday }
          },
          {
            sentBackBy: user.id,
            status: "PENDING",
            endTime: { gte: startOfToday, lt: endOfToday }
          }
        ]
      }
    });

    console.log(`📊 MAIN AGENT STATS (completed count): ${completedCount}`);

    // Test the WOD/IVCS specific count (from /api/agent/completion-stats)
    const wodIvcsCount = await prisma.task.count({
      where: {
        OR: [
          {
            assignedToId: user.id,
            status: "COMPLETED",
            taskType: "WOD_IVCS",
            endTime: { gte: startOfToday, lt: endOfToday }
          },
          {
            sentBackBy: user.id,
            status: "PENDING",
            taskType: "WOD_IVCS",
            endTime: { gte: startOfToday, lt: endOfToday }
          }
        ]
      }
    });

    console.log(`📊 WOD/IVCS COUNT: ${wodIvcsCount}`);

    // Check if there are any sent-back WOD/IVCS tasks for this user
    const sentBackWodIvcs = await prisma.task.findMany({
      where: {
        sentBackBy: user.id,
        status: "PENDING",
        taskType: "WOD_IVCS",
        endTime: { gte: startOfToday, lt: endOfToday }
      },
      select: {
        id: true,
        sentBackDisposition: true,
        endTime: true
      }
    });

    console.log(`📋 SENT-BACK WOD/IVCS TASKS FOR USER:`);
    sentBackWodIvcs.forEach(task => {
      console.log(`   ${task.id}: ${task.sentBackDisposition} (${new Date(task.endTime).toLocaleString()})`);
    });

  } catch (error) {
    console.error('❌ Error testing production counting:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testProductionCounting();
