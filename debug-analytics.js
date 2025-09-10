const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function debugAnalytics() {
  try {
    console.log('🔍 Debugging Analytics Data...\n');

    // Get today's date range
    const today = new Date();
    const dateStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
    const dateEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
    
    // Convert to UTC
    const utcDateStart = new Date(dateStart.getTime() - dateStart.getTimezoneOffset() * 60000);
    const utcDateEnd = new Date(dateEnd.getTime() - dateEnd.getTimezoneOffset() * 60000);

    console.log('📅 Date Range:');
    console.log('Local Start:', dateStart.toISOString());
    console.log('Local End:', dateEnd.toISOString());
    console.log('UTC Start:', utcDateStart.toISOString());
    console.log('UTC End:', utcDateEnd.toISOString());
    console.log('');

    // Check all completed tasks today
    const completedToday = await prisma.task.findMany({
      where: {
        OR: [
          {
            status: "COMPLETED",
            endTime: { gte: utcDateStart, lte: utcDateEnd }
          },
          {
            status: "PENDING",
            sentBackBy: { not: null },
            endTime: { gte: utcDateStart, lte: utcDateEnd }
          }
        ]
      },
      select: {
        id: true,
        taskType: true,
        status: true,
        endTime: true,
        durationSec: true,
        sentBackBy: true,
        disposition: true
      },
      orderBy: { endTime: 'desc' }
    });

    console.log('✅ Completed Tasks Today:', completedToday.length);
    completedToday.forEach((task, index) => {
      console.log(`${index + 1}. ${task.taskType} - ${task.status} - ${task.endTime?.toISOString()} - ${task.durationSec}s - Sent back by: ${task.sentBackBy || 'N/A'} - Disposition: ${task.disposition || 'N/A'}`);
    });
    console.log('');

    // Check by task type
    const wodIvcsCompleted = completedToday.filter(t => t.taskType === 'WOD_IVCS');
    console.log('🔧 WOD/IVCS Completed Today:', wodIvcsCompleted.length);
    wodIvcsCompleted.forEach((task, index) => {
      console.log(`${index + 1}. ${task.status} - ${task.endTime?.toISOString()} - ${task.durationSec}s - Sent back by: ${task.sentBackBy || 'N/A'} - Disposition: ${task.disposition || 'N/A'}`);
    });
    console.log('');

    // Check all tasks with endTime today (regardless of status)
    const allTasksWithEndTime = await prisma.task.findMany({
      where: {
        endTime: { gte: utcDateStart, lte: utcDateEnd }
      },
      select: {
        id: true,
        taskType: true,
        status: true,
        endTime: true,
        durationSec: true,
        sentBackBy: true,
        disposition: true
      },
      orderBy: { endTime: 'desc' }
    });

    console.log('📊 All Tasks with EndTime Today:', allTasksWithEndTime.length);
    allTasksWithEndTime.forEach((task, index) => {
      console.log(`${index + 1}. ${task.taskType} - ${task.status} - ${task.endTime?.toISOString()} - ${task.durationSec}s - Sent back by: ${task.sentBackBy || 'N/A'} - Disposition: ${task.disposition || 'N/A'}`);
    });
    console.log('');

    // Check average duration
    const avgDuration = completedToday.reduce((sum, task) => sum + (task.durationSec || 0), 0) / completedToday.length;
    console.log('⏱️ Average Duration:', Math.round(avgDuration), 'seconds');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

debugAnalytics();
