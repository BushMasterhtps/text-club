const { PrismaClient } = require('@prisma/client');

async function checkAllSentBackTasks() {
  const prisma = new PrismaClient();

  try {
    console.log('🔍 Checking all sent-back tasks...');
    
    // Get all sent-back tasks
    const sentBackTasks = await prisma.task.findMany({
      where: {
        sentBackBy: { not: null }
      },
      select: {
        id: true,
        taskType: true,
        status: true,
        sentBackBy: true,
        sentBackDisposition: true,
        sentBackAt: true,
        endTime: true,
        assignedToId: true
      },
      orderBy: {
        sentBackAt: 'desc'
      }
    });

    console.log(`📋 FOUND ${sentBackTasks.length} SENT-BACK TASKS:`);
    
    // Group by user
    const tasksByUser = {};
    sentBackTasks.forEach(task => {
      if (!tasksByUser[task.sentBackBy]) {
        tasksByUser[task.sentBackBy] = [];
      }
      tasksByUser[task.sentBackBy].push(task);
    });

    // Get user info
    const userIds = Object.keys(tasksByUser);
    const users = await prisma.user.findMany({
      where: {
        id: { in: userIds }
      },
      select: {
        id: true,
        email: true,
        name: true
      }
    });

    const userMap = {};
    users.forEach(user => {
      userMap[user.id] = user;
    });

    Object.keys(tasksByUser).forEach(userId => {
      const user = userMap[userId];
      const tasks = tasksByUser[userId];
      
      console.log(`\n👤 User: ${user ? user.email : 'Unknown'} (${user ? user.name : 'Unknown'})`);
      console.log(`   Total sent-back tasks: ${tasks.length}`);
      
      // Check today's tasks
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      
      const todayTasks = tasks.filter(task => {
        const taskDate = new Date(task.sentBackAt);
        return taskDate >= startOfToday && taskDate < endOfToday;
      });
      
      console.log(`   Today's sent-back tasks: ${todayTasks.length}`);
      
      todayTasks.forEach(task => {
        console.log(`     ${task.id}: ${task.taskType} - ${task.sentBackDisposition} (${new Date(task.sentBackAt).toLocaleString()})`);
      });
    });

  } catch (error) {
    console.error('❌ Error checking sent-back tasks:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAllSentBackTasks();
