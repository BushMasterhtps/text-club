/**
 * Script to find ALL malformed Holds tasks (broader search)
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function findAllMalformedTasks() {
  try {
    console.log('🔍 Searching for ALL malformed Holds tasks (broader search)...\n');

    // Search for all Holds tasks with malformed emails (very broad)
    const allHoldsTasks = await prisma.task.findMany({
      where: {
        taskType: 'HOLDS',
        OR: [
          { holdsCustomerEmail: null },
          { holdsCustomerEmail: '' },
          { holdsCustomerEmail: '1' },
          { holdsCustomerEmail: '2' },
          { holdsCustomerEmail: '3' },
          { holdsCustomerEmail: '4' },
          { holdsCustomerEmail: '5' },
          { holdsCustomerEmail: '6' },
          { holdsCustomerEmail: '7' },
          { holdsCustomerEmail: '8' },
          { holdsCustomerEmail: '9' },
        ]
      },
      select: {
        id: true,
        holdsOrderNumber: true,
        holdsCustomerEmail: true,
        holdsOrderDate: true,
        holdsStatus: true,
        status: true,
        assignedToId: true,
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
        createdAt: 'desc'
      },
      take: 50 // Limit to most recent 50
    });

    console.log(`Found ${allHoldsTasks.length} tasks with malformed/missing customer emails:\n`);

    if (allHoldsTasks.length === 0) {
      console.log('✅ No malformed tasks found in the system.');
      
      // Let's also check for tasks created in the last 24 hours
      console.log('\n🔍 Checking all Holds tasks created in last 24 hours...\n');
      
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      const recentTasks = await prisma.task.findMany({
        where: {
          taskType: 'HOLDS',
          createdAt: {
            gte: yesterday
          }
        },
        select: {
          id: true,
          holdsOrderNumber: true,
          holdsCustomerEmail: true,
          holdsOrderDate: true,
          holdsStatus: true,
          status: true,
          createdAt: true
        },
        orderBy: {
          createdAt: 'desc'
        }
      });
      
      console.log(`Found ${recentTasks.length} Holds tasks created in last 24 hours:\n`);
      
      recentTasks.forEach((task, index) => {
        console.log(`${index + 1}. Task ID: ${task.id}`);
        console.log(`   Order Number: ${task.holdsOrderNumber || 'NULL'}`);
        console.log(`   Customer Email: ${task.holdsCustomerEmail || 'NULL'}`);
        console.log(`   Order Date: ${task.holdsOrderDate?.toISOString().split('T')[0] || 'NULL'}`);
        console.log(`   Status: ${task.status} | Queue: ${task.holdsStatus}`);
        console.log(`   Created: ${task.createdAt.toISOString()}`);
        console.log('');
      });
      
      return;
    }

    // Display all malformed tasks
    allHoldsTasks.forEach((task, index) => {
      console.log(`${index + 1}. Task ID: ${task.id}`);
      console.log(`   Order Number: ${task.holdsOrderNumber || 'NULL'}`);
      console.log(`   Customer Email: "${task.holdsCustomerEmail || 'NULL'}"`);
      console.log(`   Order Date: ${task.holdsOrderDate?.toISOString().split('T')[0] || 'NULL'}`);
      console.log(`   Status: ${task.status} | Queue: ${task.holdsStatus}`);
      console.log(`   Assigned: ${task.assignedTo ? `${task.assignedTo.name} (${task.assignedTo.email})` : 'Unassigned'}`);
      console.log(`   Created: ${task.createdAt.toISOString()}`);
      console.log(`   Updated: ${task.updatedAt.toISOString()}`);
      console.log('');
    });

    // Group by creation date
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const createdToday = allHoldsTasks.filter(t => t.createdAt >= today);
    
    console.log(`\n📊 Summary:`);
    console.log(`   Total malformed tasks: ${allHoldsTasks.length}`);
    console.log(`   Created today: ${createdToday.length}`);
    
    if (createdToday.length > 0) {
      console.log('\n🎯 Task IDs created today (likely the 6 problematic ones):');
      createdToday.forEach(task => {
        console.log(`   - ${task.id} (Email: "${task.holdsCustomerEmail || 'NULL'}", Queue: ${task.holdsStatus})`);
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
findAllMalformedTasks()
  .then(() => {
    console.log('\n✅ Search complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });









