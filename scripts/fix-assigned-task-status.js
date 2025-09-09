#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function fixAssignedTaskStatus() {
  try {
    console.log('🔧 Fixing assigned task status...');
    
    // Find all assigned tasks that are still PENDING
    const assignedPendingTasks = await prisma.task.findMany({
      where: {
        assignedToId: { not: null },
        status: 'PENDING'
      },
      select: {
        id: true,
        taskType: true,
        status: true,
        assignedToId: true,
        brand: true
      }
    });
    
    console.log(`📊 Found ${assignedPendingTasks.length} assigned tasks that are still PENDING`);
    
    if (assignedPendingTasks.length === 0) {
      console.log('✅ No assigned PENDING tasks found');
      return;
    }
    
    // Show what we're about to fix
    console.log('📋 Tasks to fix:');
    assignedPendingTasks.forEach((task, index) => {
      console.log(`  ${index + 1}. ID: ${task.id}, Type: ${task.taskType}, Status: ${task.status}, Assigned: ${task.assignedToId}, Brand: ${task.brand}`);
    });
    
    // Update all assigned PENDING tasks to IN_PROGRESS
    const updateResult = await prisma.task.updateMany({
      where: {
        assignedToId: { not: null },
        status: 'PENDING'
      },
      data: {
        status: 'IN_PROGRESS'
      }
    });
    
    console.log(`✅ Updated ${updateResult.count} tasks from PENDING to IN_PROGRESS`);
    
    // Verify the fix
    const [assignedInProgress, assignedPending] = await Promise.all([
      prisma.task.count({
        where: {
          assignedToId: { not: null },
          status: 'IN_PROGRESS'
        }
      }),
      prisma.task.count({
        where: {
          assignedToId: { not: null },
          status: 'PENDING'
        }
      })
    ]);
    
    console.log(`📊 After fix: ${assignedInProgress} assigned IN_PROGRESS tasks, ${assignedPending} assigned PENDING tasks`);
    
    if (assignedPending === 0) {
      console.log('✅ All assigned tasks are now IN_PROGRESS!');
    } else {
      console.log('⚠️  Some assigned tasks are still PENDING');
    }
    
  } catch (error) {
    console.error('❌ Error fixing assigned task status:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the fix
fixAssignedTaskStatus()
  .then(() => {
    console.log('🎉 Assigned task status fix completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Assigned task status fix failed:', error);
    process.exit(1);
  });
