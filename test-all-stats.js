const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testAllStats() {
  try {
    // Get the test user
    const user = await prisma.user.findUnique({
      where: { email: 'test@local.com' }
    });

    if (!user) {
      console.log('❌ Test user not found');
      return;
    }

    console.log(`🔍 Testing ALL individual task type stats for user: ${user.email} (ID: ${user.id})`);
    console.log('='.repeat(80));

    // Get current date boundaries for "today"
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    
    console.log(`📅 Date range for today: ${startOfToday.toISOString()} to ${endOfToday.toISOString()}`);
    console.log('');

    // Test WOD/IVCS completed today (new calculation)
    const wodIvcsCompletedNew = await prisma.task.count({
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

    // Test Text Club completed today (new calculation)
    const textClubCompletedNew = await prisma.task.count({
      where: {
        OR: [
          {
            assignedToId: user.id,
            status: "COMPLETED",
            taskType: "TEXT_CLUB",
            endTime: { gte: startOfToday, lt: endOfToday }
          },
          {
            sentBackBy: user.id,
            status: "PENDING",
            taskType: "TEXT_CLUB",
            endTime: { gte: startOfToday, lt: endOfToday }
          }
        ]
      }
    });

    // Test Email Requests completed today (new calculation)
    const emailRequestsCompletedNew = await prisma.task.count({
      where: {
        OR: [
          {
            assignedToId: user.id,
            status: "COMPLETED",
            taskType: "EMAIL_REQUESTS",
            endTime: { gte: startOfToday, lt: endOfToday }
          },
          {
            sentBackBy: user.id,
            status: "PENDING",
            taskType: "EMAIL_REQUESTS",
            endTime: { gte: startOfToday, lt: endOfToday }
          }
        ]
      }
    });

    // Test Standalone Refunds completed today (new calculation)
    const standaloneRefundsCompletedNew = await prisma.task.count({
      where: {
        OR: [
          {
            assignedToId: user.id,
            status: "COMPLETED",
            taskType: "STANDALONE_REFUNDS",
            endTime: { gte: startOfToday, lt: endOfToday }
          },
          {
            sentBackBy: user.id,
            status: "PENDING",
            taskType: "STANDALONE_REFUNDS",
            endTime: { gte: startOfToday, lt: endOfToday }
          }
        ]
      }
    });

    console.log('📊 INDIVIDUAL TASK TYPE PERFORMANCE (NEW CALCULATION):');
    console.log(`   WOD/IVCS Today: ${wodIvcsCompletedNew}`);
    console.log(`   Text Club Today: ${textClubCompletedNew}`);
    console.log(`   Email Requests Today: ${emailRequestsCompletedNew}`);
    console.log(`   Standalone Refunds Today: ${standaloneRefundsCompletedNew}`);
    console.log('');

    // Get breakdown of sent-back tasks
    const sentBackTasks = await prisma.task.findMany({
      where: {
        sentBackBy: user.id,
        status: "PENDING",
        endTime: { gte: startOfToday, lt: endOfToday }
      },
      select: {
        id: true,
        taskType: true,
        disposition: true,
        sentBackAt: true
      }
    });

    console.log('📋 SENT-BACK TASKS BREAKDOWN:');
    sentBackTasks.forEach(task => {
      console.log(`   ${task.taskType}: ${task.disposition} (${task.sentBackAt})`);
    });
    console.log(`   Total sent-back tasks: ${sentBackTasks.length}`);
    console.log('');

    // Test the main agent stats API
    const mainStats = await prisma.task.findMany({
      where: { 
        OR: [
          { assignedToId: user.id },
          { sentBackBy: user.id }
        ]
      },
      select: {
        status: true,
        startTime: true,
        endTime: true,
        sentBackBy: true,
        sentBackAt: true
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

    console.log('✅ All calculations completed successfully!');

  } catch (error) {
    console.error('Error testing stats:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testAllStats();
