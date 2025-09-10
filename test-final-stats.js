const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testFinalStats() {
  try {
    // Get the test user
    const user = await prisma.user.findUnique({
      where: { email: 'test@local.com' }
    });

    if (!user) {
      console.log('❌ Test user not found');
      return;
    }

    console.log(`🔍 Testing FINAL individual task type stats for user: ${user.email} (ID: ${user.id})`);
    console.log('='.repeat(80));

    // Get current date boundaries for "today"
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    
    console.log(`📅 Date range for today: ${startOfToday.toISOString()} to ${endOfToday.toISOString()}`);
    console.log('');

    // Test the EXACT calculation used by the WOD/IVCS agent progress API
    const wodIvcsCompletedToday = await prisma.task.count({
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

    console.log('📊 WOD/IVCS COMPLETED TODAY (NEW CALCULATION):');
    console.log(`   Result: ${wodIvcsCompletedToday}`);
    console.log('');

    // Get breakdown of sent-back tasks
    const sentBackTasks = await prisma.task.findMany({
      where: {
        sentBackBy: user.id,
        status: "PENDING",
        taskType: "WOD_IVCS",
        endTime: { gte: startOfToday, lt: endOfToday }
      },
      select: {
        id: true,
        disposition: true,
        sentBackAt: true
      }
    });

    console.log('📋 SENT-BACK WOD/IVCS TASKS:');
    sentBackTasks.forEach(task => {
      console.log(`   ${task.disposition} (${task.sentBackAt})`);
    });
    console.log(`   Total sent-back WOD/IVCS tasks: ${sentBackTasks.length}`);
    console.log('');

    // Test the main agent stats calculation
    const mainStats = await prisma.task.findMany({
      where: { 
        OR: [
          { assignedToId: user.id },
          { sentBackBy: user.id }
        ]
      },
      select: {
        status: true,
        endTime: true,
        sentBackBy: true,
        taskType: true
      }
    });

    const completed = mainStats.filter(t => {
      if (!t.endTime) return false;
      const endTime = new Date(t.endTime);
      const isCompleted = t.status === "COMPLETED";
      const isSentBack = t.status === "PENDING" && t.sentBackBy === user.id;
      return (isCompleted || isSentBack) && endTime >= startOfToday && endTime < endOfToday;
    }).length;

    console.log('📈 MAIN AGENT STATS:');
    console.log(`   Total completed today: ${completed}`);
    console.log('');

    console.log('✅ Final test completed!');
    console.log('');
    console.log('🎯 EXPECTED RESULTS:');
    console.log(`   - WOD/IVCS Today should show: ${wodIvcsCompletedToday}`);
    console.log(`   - Total Tasks Completed should show: ${completed}`);
    console.log(`   - Both should match: ${wodIvcsCompletedToday === completed ? '✅ YES' : '❌ NO'}`);

  } catch (error) {
    console.error('Error testing stats:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testFinalStats();
