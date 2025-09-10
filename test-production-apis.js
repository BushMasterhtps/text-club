const { PrismaClient } = require('@prisma/client');

async function testProductionAPIs() {
  const prisma = new PrismaClient();

  try {
    console.log('🔍 Testing production API endpoints...');
    
    // Get current date boundaries for "today"
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    console.log(`📅 Date range for today: ${startOfToday.toISOString()} to ${endOfToday.toISOString()}`);
    console.log('');

    // Find your user
    const user = await prisma.user.findUnique({
      where: { email: 'daniel.murcia@goldenboltllc.com' }
    });

    if (!user) {
      console.log('❌ User not found: daniel.murcia@goldenboltllc.com');
      return;
    }

    console.log(`👤 Testing for user: ${user.email} (ID: ${user.id})`);

    // Test 1: Check all tasks completed today (any status)
    const allCompletedToday = await prisma.task.findMany({
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
      },
      select: {
        id: true,
        taskType: true,
        status: true,
        disposition: true,
        endTime: true,
        sentBackBy: true,
        sentBackDisposition: true
      }
    });

    console.log(`📊 ALL COMPLETED TASKS TODAY (any status):`);
    allCompletedToday.forEach(task => {
      console.log(`   ${task.id}: ${task.taskType} - ${task.status} - ${task.disposition || task.sentBackDisposition} (${new Date(task.endTime).toLocaleString()})`);
    });
    console.log(`   Total: ${allCompletedToday.length}`);
    console.log('');

    // Test 2: Check specifically WOD/IVCS tasks
    const wodIvcsCompletedToday = await prisma.task.findMany({
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
      },
      select: {
        id: true,
        status: true,
        disposition: true,
        endTime: true,
        sentBackBy: true,
        sentBackDisposition: true
      }
    });

    console.log(`📊 WOD/IVCS COMPLETED TODAY:`);
    wodIvcsCompletedToday.forEach(task => {
      console.log(`   ${task.id}: ${task.status} - ${task.disposition || task.sentBackDisposition} (${new Date(task.endTime).toLocaleString()})`);
    });
    console.log(`   Total: ${wodIvcsCompletedToday.length}`);
    console.log('');

    // Test 3: Check what the API endpoints should return
    const mainStatsCount = await prisma.task.count({
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

    console.log(`🎯 API ENDPOINT RESULTS:`);
    console.log(`   Main stats count: ${mainStatsCount}`);
    console.log(`   WOD/IVCS count: ${wodIvcsCount}`);
    console.log('');

    console.log(`🚨 EXPECTED vs ACTUAL:`);
    console.log(`   Expected "Tasks Completed": ${mainStatsCount}`);
    console.log(`   Expected "WOD/IVCS Today": ${wodIvcsCount}`);
    console.log(`   Actual "Tasks Completed": 0 (from screenshot)`);
    console.log(`   Actual "WOD/IVCS Today": 0 (from screenshot)`);

  } catch (error) {
    console.error('❌ Error testing production APIs:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testProductionAPIs();
