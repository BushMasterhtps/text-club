#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function forceDeleteAllTasks() {
  try {
    console.log('🗑️  Force deleting ALL tasks and raw messages...');
    
    // Delete ALL tasks regardless of type
    const deletedTasks = await prisma.task.deleteMany({});
    console.log(`✅ Deleted ${deletedTasks.count} tasks`);
    
    // Delete ALL raw messages regardless of status
    const deletedRawMessages = await prisma.rawMessage.deleteMany({});
    console.log(`✅ Deleted ${deletedRawMessages.count} raw messages`);
    
    // Verify deletion
    const [remainingTasks, remainingRawMessages] = await Promise.all([
      prisma.task.count(),
      prisma.rawMessage.count()
    ]);
    
    console.log(`📊 After deletion: ${remainingTasks} tasks, ${remainingRawMessages} raw messages`);
    
    if (remainingTasks === 0 && remainingRawMessages === 0) {
      console.log('✅ All tasks and raw messages successfully deleted!');
    } else {
      console.log('⚠️  Some data may still remain');
    }
    
  } catch (error) {
    console.error('❌ Error force deleting data:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the deletion
forceDeleteAllTasks()
  .then(() => {
    console.log('🎉 Force deletion completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Force deletion failed:', error);
    process.exit(1);
  });
