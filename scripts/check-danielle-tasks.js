#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkDanielleTasks() {
  try {
    console.log('🔍 Checking Danielle Park Tasks...\n');
    
    // First, find Danielle's user ID
    const danielle = await prisma.user.findFirst({
      where: {
        OR: [
          { name: { contains: 'Danielle' } },
          { email: { contains: 'danielle' } }
        ]
      },
      select: {
        id: true,
        name: true,
        email: true
      }
    });
    
    if (!danielle) {
      console.log('❌ Danielle Park not found in users');
      return;
    }
    
    console.log(`👤 Found: ${danielle.name} (${danielle.email}) - ID: ${danielle.id}\n`);
    
    // Get all tasks assigned to Danielle
    const danielleTasks = await prisma.task.findMany({
      where: {
        assignedToId: danielle.id
      },
      select: {
        id: true,
        taskType: true,
        status: true,
        disposition: true,
        endTime: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });
    
    console.log(`📊 Total Tasks Assigned to Danielle: ${danielleTasks.length}\n`);
    
    if (danielleTasks.length > 0) {
      // Group by task type
      const byTaskType = danielleTasks.reduce((acc, task) => {
        acc[task.taskType] = (acc[task.taskType] || 0) + 1;
        return acc;
      }, {});
      
      console.log('📋 Tasks by Type:');
      Object.entries(byTaskType).forEach(([type, count]) => {
        console.log(`  ${type}: ${count}`);
      });
      
      // Group by status
      const byStatus = danielleTasks.reduce((acc, task) => {
        acc[task.status] = (acc[task.status] || 0) + 1;
        return acc;
      }, {});
      
      console.log('\n📋 Tasks by Status:');
      Object.entries(byStatus).forEach(([status, count]) => {
        console.log(`  ${status}: ${count}`);
      });
      
      // Check completed tasks
      const completedTasks = danielleTasks.filter(task => task.status === 'COMPLETED');
      console.log(`\n✅ Completed Tasks: ${completedTasks.length}`);
      
      if (completedTasks.length > 0) {
        // Group by task type for completed tasks
        const completedByType = completedTasks.reduce((acc, task) => {
          acc[task.taskType] = (acc[task.taskType] || 0) + 1;
          return acc;
        }, {});
        
        console.log('\n📋 Completed Tasks by Type:');
        Object.entries(completedByType).forEach(([type, count]) => {
          console.log(`  ${type}: ${count}`);
        });
        
        // Check dispositions for completed tasks
        const dispositions = completedTasks.reduce((acc, task) => {
          const disposition = task.disposition || 'Unknown';
          acc[disposition] = (acc[disposition] || 0) + 1;
          return acc;
        }, {});
        
        console.log('\n📋 Completed Tasks by Disposition:');
        Object.entries(dispositions).forEach(([disposition, count]) => {
          console.log(`  ${disposition}: ${count}`);
        });
        
        // Check dates for completed tasks
        const completedByDate = completedTasks.reduce((acc, task) => {
          if (task.endTime) {
            const date = task.endTime.toISOString().split('T')[0];
            acc[date] = (acc[date] || 0) + 1;
          }
          return acc;
        }, {});
        
        console.log('\n📅 Completed Tasks by Date:');
        Object.entries(completedByDate).forEach(([date, count]) => {
          console.log(`  ${date}: ${count} tasks`);
        });
      }
    }
    
    // Also check all task types in the database
    console.log('\n🔍 All Task Types in Database:');
    const allTaskTypes = await prisma.task.groupBy({
      by: ['taskType'],
      _count: {
        id: true
      }
    });
    
    allTaskTypes.forEach(group => {
      console.log(`  ${group.taskType}: ${group._count.id} tasks`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkDanielleTasks();
