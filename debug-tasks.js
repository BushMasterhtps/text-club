const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function debugTasks() {
  try {
    // Get the test user
    const user = await prisma.user.findUnique({
      where: { email: 'test@local.com' }
    });

    if (!user) {
      console.log('❌ Test user not found');
      return;
    }

    console.log(`🔍 Debugging tasks for user: ${user.email} (ID: ${user.id})`);
    console.log('='.repeat(60));

    // Get all tasks for this user
    const tasks = await prisma.task.findMany({
      where: { assignedToId: user.id },
      select: {
        id: true,
        status: true,
        startTime: true,
        endTime: true,
        durationSec: true,
        disposition: true,
        createdAt: true,
        sentBackBy: true,
        sentBackAt: true,
        sentBackDisposition: true
      },
      orderBy: { createdAt: 'desc' }
    });

    console.log(`📊 Total tasks assigned to user: ${tasks.length}`);
    console.log('');

    // Check today's date range
    const today = new Date();
    const dateStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const dateEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    
    console.log(`📅 Date range for today: ${dateStart.toISOString()} to ${dateEnd.toISOString()}`);
    console.log('');

    // Analyze tasks
    const assigned = tasks.filter(t => 
      ["PENDING", "IN_PROGRESS", "ASSISTANCE_REQUIRED"].includes(t.status)
    ).length;

    const completed = tasks.filter(t => {
      if (!t.endTime) return false;
      const endTime = new Date(t.endTime);
      const isCompleted = t.status === "COMPLETED";
      const isSentBack = t.status === "PENDING" && t.endTime;
      return (isCompleted || isSentBack) && endTime >= dateStart && endTime < dateEnd;
    });

    console.log(`📈 Current stats calculation:`);
    console.log(`   Assigned: ${assigned}`);
    console.log(`   Completed: ${completed.length}`);
    console.log('');

    console.log(`📋 Detailed task breakdown:`);
    tasks.forEach((task, index) => {
      const endTime = task.endTime ? new Date(task.endTime) : null;
      const isToday = endTime && endTime >= dateStart && endTime < dateEnd;
      const isSentBack = task.status === "PENDING" && task.endTime;
      const isCompleted = task.status === "COMPLETED";
      
      console.log(`${index + 1}. Task ${task.id}:`);
      console.log(`   Status: ${task.status}`);
      console.log(`   Disposition: ${task.disposition || 'N/A'}`);
      console.log(`   End Time: ${endTime ? endTime.toISOString() : 'N/A'}`);
      console.log(`   Is Today: ${isToday}`);
      console.log(`   Is Completed: ${isCompleted}`);
      console.log(`   Is Sent Back: ${isSentBack}`);
      console.log(`   Sent Back By: ${task.sentBackBy || 'N/A'}`);
      console.log(`   Sent Back At: ${task.sentBackAt ? new Date(task.sentBackAt).toISOString() : 'N/A'}`);
      console.log(`   Sent Back Disposition: ${task.sentBackDisposition || 'N/A'}`);
      console.log(`   Counts as Work: ${(isCompleted || isSentBack) && isToday}`);
      console.log('');
    });

  } catch (error) {
    console.error('Error debugging tasks:', error);
  } finally {
    await prisma.$disconnect();
  }
}

debugTasks();
