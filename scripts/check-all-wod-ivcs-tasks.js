#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkAllWodIvcsTasks() {
  try {
    console.log('🔍 Checking ALL WOD/IVCS Tasks...\n');
    
    // Get all WOD/IVCS tasks
    const allTasks = await prisma.task.findMany({
      where: {
        taskType: 'WOD_IVCS'
      },
      select: {
        id: true,
        status: true,
        disposition: true,
        endTime: true,
        assignedTo: {
          select: {
            name: true,
            email: true
          }
        },
        createdAt: true,
        updatedAt: true
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });
    
    console.log(`📊 Total WOD/IVCS Tasks: ${allTasks.length}\n`);
    
    // Group by status
    const statusBreakdown = allTasks.reduce((acc, task) => {
      acc[task.status] = (acc[task.status] || 0) + 1;
      return acc;
    }, {});
    
    console.log('📋 Status Breakdown:');
    Object.entries(statusBreakdown).forEach(([status, count]) => {
      console.log(`  ${status}: ${count}`);
    });
    
    // Check completed tasks
    const completedTasks = allTasks.filter(task => task.status === 'COMPLETED');
    console.log(`\n✅ Completed Tasks: ${completedTasks.length}`);
    
    if (completedTasks.length > 0) {
      console.log('\n📅 Completed Tasks by Date:');
      const completedByDate = completedTasks.reduce((acc, task) => {
        if (task.endTime) {
          const date = task.endTime.toISOString().split('T')[0];
          acc[date] = (acc[date] || 0) + 1;
        }
        return acc;
      }, {});
      
      Object.entries(completedByDate).forEach(([date, count]) => {
        console.log(`  ${date}: ${count} tasks`);
      });
      
      // Check Danielle Park's completed tasks
      const danielleCompleted = completedTasks.filter(task => 
        task.assignedTo?.name === 'Danielle Park'
      );
      
      console.log(`\n🎯 Danielle Park's Completed Tasks: ${danielleCompleted.length}`);
      
      if (danielleCompleted.length > 0) {
        const danielleByDate = danielleCompleted.reduce((acc, task) => {
          if (task.endTime) {
            const date = task.endTime.toISOString().split('T')[0];
            acc[date] = (acc[date] || 0) + 1;
          }
          return acc;
        }, {});
        
        Object.entries(danielleByDate).forEach(([date, count]) => {
          console.log(`  ${date}: ${count} tasks`);
        });
        
        // Check dispositions
        const danielleDispositions = danielleCompleted.reduce((acc, task) => {
          const disposition = task.disposition || 'Unknown';
          acc[disposition] = (acc[disposition] || 0) + 1;
          return acc;
        }, {});
        
        console.log('\n📋 Danielle Dispositions:');
        Object.entries(danielleDispositions).forEach(([disposition, count]) => {
          console.log(`  ${disposition}: ${count}`);
        });
      }
    }
    
    // Check recent tasks (last 10)
    console.log('\n🕒 Recent Tasks (last 10):');
    allTasks.slice(0, 10).forEach((task, index) => {
      console.log(`  ${index + 1}. ${task.assignedTo?.name || 'Unassigned'} - ${task.status} - ${task.disposition || 'No disposition'} - ${task.updatedAt.toISOString()}`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAllWodIvcsTasks();
