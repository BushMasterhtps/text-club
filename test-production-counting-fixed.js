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

    // Use the correct user email
    const testUserEmail = 'daniel@test.com';
    const user = await prisma.user.findUnique({
      where: { email: testUserEmail }
    });

    if (!user) {
      console.log('❌ User not found:', testUserEmail);
      return;
    }

    console.log(`👤 Testing for user: ${user.email} (ID: ${user.id})`);

    // Find all sent-back tasks for this user today
    const sentBackTasks = await prisma.task.findMany({
      where: {
        sentBackBy: user.id,
        endTime: { gte: startOfToday, lt: endOfToday }
      },
      select: {
        id: true,
        taskType: true,
        status: true,
        sentBackDisposition: true,
        endTime: true
      }
    });

    console.log(`📋 SENT-BACK TASKS FOR USER TODAY:`);
    sentBackTasks.forEach(task => {
      console.log(`   Task ${task.id}:`);
      console.log(`     Type: ${task.taskType}`);
      console.log(`     Status: ${task.status}`);
      console.log(`     Disposition: ${task.sentBackDisposition}`);
      console.log(`     End time: ${task.endTime}`);
      console.log('');
    });

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

    console.log(`\n🎯 EXPECTED RESULTS:`);
    console.log(`   - Main completed count should be: ${sentBackTasks.length}`);
    console.log(`   - WOD/IVCS count should be: ${sentBackWodIvcs.length}`);
    console.log(`   - Both should match: ${completedCount === sentBackTasks.length ? '✅ YES' : '❌ NO'}`);

  } catch (error) {
    console.error('❌ Error testing production counting:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testProductionCounting();
