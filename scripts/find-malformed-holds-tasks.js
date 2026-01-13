/**
 * Script to find malformed Holds tasks
 * Search more broadly to identify the problematic tasks
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function findMalformedTasks() {
  try {
    console.log('🔍 Searching for malformed Holds tasks in Agent Research queue...\n');

    // Search for all tasks in Agent Research from recent imports
    const recentTasks = await prisma.task.findMany({
      where: {
        taskType: 'HOLDS',
        holdsStatus: 'Agent Research',
        createdAt: {
          gte: new Date('2025-12-02T00:00:00Z') // Tasks created today
        }
      },
      select: {
        id: true,
        holdsOrderNumber: true,
        holdsCustomerEmail: true,
        holdsOrderDate: true,
        holdsStatus: true,
        status: true,
        assignedToId: true,
        createdAt: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    console.log(`Found ${recentTasks.length} recent tasks in Agent Research:\n`);

    if (recentTasks.length === 0) {
      console.log('No recent tasks found in Agent Research queue.');
      return;
    }

    // Group by customer email to find the malformed ones
    const malformedTasks = recentTasks.filter(task => {
      const email = task.holdsCustomerEmail;
      // Check if email is a single digit, null, or doesn't look like an email
      return !email || 
             email.length <= 2 || 
             !email.includes('@');
    });

    console.log(`\n📋 All recent tasks (${recentTasks.length}):\n`);
    recentTasks.forEach((task, index) => {
      const isMalformed = malformedTasks.some(m => m.id === task.id);
      console.log(`${index + 1}. ${isMalformed ? '❌ MALFORMED' : '✅ OK'}`);
      console.log(`   Task ID: ${task.id}`);
      console.log(`   Order Number: ${task.holdsOrderNumber || 'NULL'}`);
      console.log(`   Customer Email: ${task.holdsCustomerEmail || 'NULL'}`);
      console.log(`   Order Date: ${task.holdsOrderDate?.toISOString().split('T')[0] || 'NULL'}`);
      console.log(`   Status: ${task.status} | Queue: ${task.holdsStatus}`);
      console.log(`   Assigned: ${task.assignedToId ? 'Yes' : 'No'}`);
      console.log(`   Created: ${task.createdAt.toISOString()}`);
      console.log('');
    });

    console.log(`\n🎯 Found ${malformedTasks.length} malformed tasks (missing or invalid email)\n`);

    if (malformedTasks.length > 0) {
      console.log('Task IDs to delete:');
      malformedTasks.forEach(task => {
        console.log(`  - ${task.id} (Email: "${task.holdsCustomerEmail || 'NULL'}")`);
      });
    }

  } catch (error) {
    console.error('❌ Error finding tasks:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
findMalformedTasks()
  .then(() => {
    console.log('\n✅ Search complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });









