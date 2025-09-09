#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function deleteTextClubData() {
  try {
    console.log('🗑️  Starting Text Club data deletion...');
    
    // First, let's see what we have
    const [taskCount, rawMessageCount] = await Promise.all([
      prisma.task.count({
        where: { taskType: 'TEXT_CLUB' }
      }),
      prisma.rawMessage.count({
        where: { 
          OR: [
            { status: 'READY' },
            { status: 'PROMOTED' },
            { status: 'SPAM_REVIEW' }
          ]
        }
      })
    ]);
    
    console.log(`📊 Found ${taskCount} TEXT_CLUB tasks and ${rawMessageCount} raw messages`);
    
    if (taskCount === 0 && rawMessageCount === 0) {
      console.log('✅ No Text Club data to delete');
      return;
    }
    
    // Delete all TEXT_CLUB tasks
    if (taskCount > 0) {
      console.log(`🗑️  Deleting ${taskCount} TEXT_CLUB tasks...`);
      const deletedTasks = await prisma.task.deleteMany({
        where: { taskType: 'TEXT_CLUB' }
      });
      console.log(`✅ Deleted ${deletedTasks.count} TEXT_CLUB tasks`);
    }
    
    // Delete all raw messages (these are the Text Club messages)
    if (rawMessageCount > 0) {
      console.log(`🗑️  Deleting ${rawMessageCount} raw messages...`);
      const deletedRawMessages = await prisma.rawMessage.deleteMany({
        where: { 
          OR: [
            { status: 'READY' },
            { status: 'PROMOTED' },
            { status: 'SPAM_REVIEW' }
          ]
        }
      });
      console.log(`✅ Deleted ${deletedRawMessages.count} raw messages`);
    }
    
    // Verify deletion
    const [remainingTasks, remainingRawMessages] = await Promise.all([
      prisma.task.count({
        where: { taskType: 'TEXT_CLUB' }
      }),
      prisma.rawMessage.count({
        where: { 
          OR: [
            { status: 'READY' },
            { status: 'PROMOTED' },
            { status: 'SPAM_REVIEW' }
          ]
        }
      })
    ]);
    
    console.log(`📊 After deletion: ${remainingTasks} TEXT_CLUB tasks, ${remainingRawMessages} raw messages`);
    
    if (remainingTasks === 0 && remainingRawMessages === 0) {
      console.log('✅ All Text Club data successfully deleted!');
    } else {
      console.log('⚠️  Some data may still remain');
    }
    
  } catch (error) {
    console.error('❌ Error deleting Text Club data:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the deletion
deleteTextClubData()
  .then(() => {
    console.log('🎉 Text Club data deletion completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Text Club data deletion failed:', error);
    process.exit(1);
  });
