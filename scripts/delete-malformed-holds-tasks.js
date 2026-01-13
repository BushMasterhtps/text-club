/**
 * Script to delete 6 malformed Holds tasks from Agent Research queue
 * 
 * These tasks were imported from an incorrect CSV (analytics export instead of import CSV)
 * and show as just numbers (5, 4) instead of proper customer information.
 * 
 * Identifying characteristics:
 * - taskType: HOLDS
 * - holdsStatus: Agent Research
 * - holdsCustomerEmail is a single digit (5, 4, etc.) instead of an email
 * - Order dates from late November 2025
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function deleteMalformedHoldsTasks() {
  try {
    console.log('🔍 Searching for malformed Holds tasks...\n');

    // Find tasks where the customer email is just a single digit (malformed data)
    // These are in Agent Research queue and have order dates from late November
    const malformedTasks = await prisma.task.findMany({
      where: {
        taskType: 'HOLDS',
        holdsStatus: 'Agent Research',
        // Customer email is a single digit (1-9) - this is clearly malformed
        holdsCustomerEmail: {
          in: ['1', '2', '3', '4', '5', '6', '7', '8', '9']
        },
        // Order dates from late November 2025
        holdsOrderDate: {
          gte: new Date('2025-11-24T00:00:00Z'),
          lte: new Date('2025-11-30T23:59:59Z')
        }
      },
      select: {
        id: true,
        holdsOrderNumber: true,
        holdsCustomerEmail: true,
        holdsOrderDate: true,
        holdsStatus: true,
        createdAt: true
      },
      orderBy: {
        holdsOrderDate: 'asc'
      }
    });

    console.log(`Found ${malformedTasks.length} malformed tasks:\n`);

    if (malformedTasks.length === 0) {
      console.log('✅ No malformed tasks found. They may have already been deleted.');
      return;
    }

    // Display the tasks that will be deleted
    malformedTasks.forEach((task, index) => {
      console.log(`${index + 1}. Task ID: ${task.id}`);
      console.log(`   Order Number: ${task.holdsOrderNumber || 'N/A'}`);
      console.log(`   Customer Email: ${task.holdsCustomerEmail} (MALFORMED)`);
      console.log(`   Order Date: ${task.holdsOrderDate?.toISOString().split('T')[0] || 'N/A'}`);
      console.log(`   Queue: ${task.holdsStatus}`);
      console.log(`   Created: ${task.createdAt.toISOString()}`);
      console.log('');
    });

    // Confirm before deletion
    if (malformedTasks.length !== 6) {
      console.log(`⚠️  WARNING: Expected 6 tasks, but found ${malformedTasks.length}`);
      console.log('Please review the tasks above before proceeding.\n');
    }

    console.log(`\n🗑️  Deleting ${malformedTasks.length} malformed tasks...\n`);

    // Delete the tasks
    const taskIds = malformedTasks.map(t => t.id);
    const deleteResult = await prisma.task.deleteMany({
      where: {
        id: {
          in: taskIds
        }
      }
    });

    console.log(`✅ Successfully deleted ${deleteResult.count} malformed tasks!\n`);

    // Summary
    console.log('📊 Summary:');
    console.log(`   - Tasks deleted: ${deleteResult.count}`);
    console.log(`   - Queue: Agent Research`);
    console.log(`   - Reason: Malformed data from incorrect CSV import`);
    console.log('\n✨ Cleanup complete!');

  } catch (error) {
    console.error('❌ Error deleting malformed tasks:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
deleteMalformedHoldsTasks()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });









