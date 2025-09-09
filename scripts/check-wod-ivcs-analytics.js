#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkWodIvcsAnalytics() {
  try {
    console.log('🔍 Checking WOD/IVCS Analytics Data...\n');
    
    // Get today's date range
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    
    console.log(`📅 Date Range: ${startOfToday.toISOString()} to ${endOfToday.toISOString()}\n`);
    
    // Get all WOD/IVCS completed tasks today
    const completedTasks = await prisma.task.findMany({
      where: {
        taskType: 'WOD_IVCS',
        status: 'COMPLETED',
        endTime: {
          gte: startOfToday,
          lte: endOfToday
        }
      },
      select: {
        id: true,
        disposition: true,
        assignedTo: {
          select: {
            name: true,
            email: true
          }
        },
        endTime: true
      },
      orderBy: {
        endTime: 'desc'
      }
    });
    
    console.log(`📊 Total WOD/IVCS Completed Today: ${completedTasks.length}\n`);
    
    // Group by agent
    const agentBreakdown = completedTasks.reduce((acc, task) => {
      const agentName = task.assignedTo?.name || 'Unassigned';
      if (!acc[agentName]) {
        acc[agentName] = {
          count: 0,
          dispositions: {}
        };
      }
      acc[agentName].count++;
      
      const disposition = task.disposition || 'Unknown';
      acc[agentName].dispositions[disposition] = (acc[agentName].dispositions[disposition] || 0) + 1;
      
      return acc;
    }, {});
    
    console.log('👥 Agent Breakdown:');
    Object.entries(agentBreakdown).forEach(([agent, data]) => {
      console.log(`  ${agent}: ${data.count} tasks`);
      Object.entries(data.dispositions).forEach(([disposition, count]) => {
        console.log(`    - ${disposition}: ${count}`);
      });
    });
    
    console.log('\n📋 Disposition Breakdown:');
    const dispositionBreakdown = completedTasks.reduce((acc, task) => {
      const disposition = task.disposition || 'Unknown';
      acc[disposition] = (acc[disposition] || 0) + 1;
      return acc;
    }, {});
    
    Object.entries(dispositionBreakdown).forEach(([disposition, count]) => {
      console.log(`  ${disposition}: ${count}`);
    });
    
    // Check Danielle Park specifically
    const danielleTasks = completedTasks.filter(task => 
      task.assignedTo?.name === 'Danielle Park'
    );
    
    console.log(`\n🎯 Danielle Park's Tasks: ${danielleTasks.length}`);
    if (danielleTasks.length > 0) {
      const danielleDispositions = danielleTasks.reduce((acc, task) => {
        const disposition = task.disposition || 'Unknown';
        acc[disposition] = (acc[disposition] || 0) + 1;
        return acc;
      }, {});
      
      Object.entries(danielleDispositions).forEach(([disposition, count]) => {
        console.log(`  - ${disposition}: ${count}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkWodIvcsAnalytics();
