#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixInconsistentTaskStatus() {
  try {
    console.log('🔄 Starting task status consistency fix...');
    
    // Find tasks that are assigned but still have PENDING status
    const inconsistentTasks = await prisma.task.findMany({
      where: {
        assignedToId: { not: null },
        status: 'PENDING'
      },
      select: {
        id: true,
        assignedToId: true,
        status: true,
        taskType: true
      }
    });
    
    console.log(`📋 Found ${inconsistentTasks.length} tasks with inconsistent status`);
    
    if (inconsistentTasks.length === 0) {
      console.log('✅ No inconsistent tasks found. All tasks have correct status.');
      return;
    }
    
    // Group by task type for reporting
    const byTaskType = inconsistentTasks.reduce((acc, task) => {
      acc[task.taskType] = (acc[task.taskType] || 0) + 1;
      return acc;
    }, {});
    
    console.log('📊 Inconsistent tasks by type:');
    Object.entries(byTaskType).forEach(([type, count]) => {
      console.log(`   - ${type}: ${count} tasks`);
    });
    
    // Fix the inconsistent tasks
    const updateResult = await prisma.task.updateMany({
      where: {
        assignedToId: { not: null },
        status: 'PENDING'
      },
      data: {
        status: 'IN_PROGRESS'
      }
    });
    
    console.log(`✅ Fixed ${updateResult.count} tasks from PENDING to IN_PROGRESS`);
    
    // Also find tasks that are unassigned but have IN_PROGRESS status
    const unassignedInProgress = await prisma.task.findMany({
      where: {
        assignedToId: null,
        status: 'IN_PROGRESS'
      },
      select: {
        id: true,
        status: true,
        taskType: true
      }
    });
    
    console.log(`📋 Found ${unassignedInProgress.length} unassigned tasks with IN_PROGRESS status`);
    
    if (unassignedInProgress.length > 0) {
      const fixUnassignedResult = await prisma.task.updateMany({
        where: {
          assignedToId: null,
          status: 'IN_PROGRESS'
        },
        data: {
          status: 'PENDING'
        }
      });
      
      console.log(`✅ Fixed ${fixUnassignedResult.count} unassigned tasks from IN_PROGRESS to PENDING`);
    }
    
    // Final verification
    const finalCheck = await prisma.task.groupBy({
      by: ['status', 'assignedToId'],
      _count: {
        id: true
      }
    });
    
    console.log('📊 Final task status distribution:');
    finalCheck.forEach(group => {
      const assigned = group.assignedToId ? 'Assigned' : 'Unassigned';
      console.log(`   - ${group.status} (${assigned}): ${group._count.id} tasks`);
    });
    
    console.log('🎉 Task status consistency fix completed!');
    
  } catch (error) {
    console.error('❌ Fix failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

fixInconsistentTaskStatus();
