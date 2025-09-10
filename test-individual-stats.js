const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testIndividualStats() {
  try {
    // Get the test user
    const user = await prisma.user.findUnique({
      where: { email: 'test@local.com' }
    });

    if (!user) {
      console.log('❌ Test user not found');
      return;
    }

    console.log(`🔍 Testing individual task type stats for user: ${user.email} (ID: ${user.id})`);
    console.log('='.repeat(60));

    // Get current date boundaries for "today"
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    
    console.log(`📅 Date range for today: ${startOfToday.toISOString()} to ${endOfToday.toISOString()}`);
    console.log('');

    // Test the old calculation (only COMPLETED tasks)
    const oldWodIvcsCompleted = await prisma.task.count({
      where: {
        assignedToId: user.id,
        status: "COMPLETED",
        taskType: "WOD_IVCS",
        endTime: { gte: startOfToday, lt: endOfToday }
      }
    });

    // Test the new calculation (COMPLETED + sent-back tasks)
    const newWodIvcsCompleted = await prisma.task.count({
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

    console.log(`📊 WOD/IVCS Completed Today:`);
    console.log(`   Old calculation (COMPLETED only): ${oldWodIvcsCompleted}`);
    console.log(`   New calculation (COMPLETED + sent-back): ${newWodIvcsCompleted}`);
    console.log(`   Difference: ${newWodIvcsCompleted - oldWodIvcsCompleted}`);
    console.log('');

    // Get details of sent-back tasks
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
        endTime: true,
        sentBackAt: true
      }
    });

    console.log(`🔄 Sent-back WOD/IVCS tasks today: ${sentBackTasks.length}`);
    sentBackTasks.forEach((task, index) => {
      console.log(`   ${index + 1}. Task ${task.id}:`);
      console.log(`      Disposition: ${task.disposition}`);
      console.log(`      End Time: ${task.endTime ? new Date(task.endTime).toISOString() : 'N/A'}`);
      console.log(`      Sent Back At: ${task.sentBackAt ? new Date(task.sentBackAt).toISOString() : 'N/A'}`);
    });

  } catch (error) {
    console.error('Error testing individual stats:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testIndividualStats();
