#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'postgresql://postgres:OUYdvdsKqOUGwpTWTUUniqINJdjqIBdy@interchange.proxy.rlwy.net:43835/railway'
    }
  }
});

async function checkHoldsQueues() {
  try {
    console.log('🔍 Checking Holds Queue Data...\n');

    // Get all HOLDS tasks
    const allTasks = await prisma.task.findMany({
      where: {
        taskType: 'HOLDS'
      },
      select: {
        id: true,
        holdsOrderNumber: true,
        holdsStatus: true,
        status: true,
        endTime: true,
        createdAt: true
      }
    });

    console.log(`Total HOLDS tasks: ${allTasks.length}\n`);

    // Group by holdsStatus
    const queueCounts = {};
    const statusBreakdown = {
      PENDING: 0,
      IN_PROGRESS: 0,
      COMPLETED: 0,
      ASSISTANCE_REQUIRED: 0,
      RESOLVED: 0
    };

    allTasks.forEach(task => {
      const queue = task.holdsStatus || 'NULL';
      queueCounts[queue] = (queueCounts[queue] || 0) + 1;
      
      if (task.status) {
        statusBreakdown[task.status] = (statusBreakdown[task.status] || 0) + 1;
      }
    });

    console.log('📊 Queue Counts (by holdsStatus):');
    console.log('=' .repeat(50));
    Object.entries(queueCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([queue, count]) => {
        console.log(`  ${queue || '(null)'}: ${count}`);
      });

    console.log('\n📊 Task Status Breakdown:');
    console.log('=' .repeat(50));
    Object.entries(statusBreakdown).forEach(([status, count]) => {
      console.log(`  ${status}: ${count}`);
    });

    // Check for tasks in Customer Contact queue
    const customerContactTasks = allTasks.filter(t => 
      t.holdsStatus === 'Customer Contact' || 
      t.holdsStatus === 'customer contact' ||
      t.holdsStatus === 'CUSTOMER CONTACT'
    );

    console.log('\n🔍 Customer Contact Queue Analysis:');
    console.log('=' .repeat(50));
    console.log(`Exact match "Customer Contact": ${allTasks.filter(t => t.holdsStatus === 'Customer Contact').length}`);
    console.log(`Case-insensitive matches: ${customerContactTasks.length}`);
    
    // Show sample tasks
    const sampleTasks = customerContactTasks.slice(0, 5);
    console.log('\nSample Customer Contact tasks:');
    sampleTasks.forEach((task, idx) => {
      console.log(`  ${idx + 1}. Order: ${task.holdsOrderNumber || 'N/A'}, Status: ${task.status}, Completed: ${task.endTime ? 'Yes' : 'No'}`);
    });

    // Check for tasks NOT completed
    const notCompleted = allTasks.filter(t => !t.endTime);
    console.log(`\n📋 Tasks NOT completed (no endTime): ${notCompleted.length}`);
    
    const notCompletedInCustomerContact = notCompleted.filter(t => 
      t.holdsStatus === 'Customer Contact'
    );
    console.log(`   - In "Customer Contact" queue: ${notCompletedInCustomerContact.length}`);

    // Check for Escalated Call
    const escalatedCallTasks = allTasks.filter(t => 
      t.holdsStatus === 'Escalated Call 4+ Day' ||
      t.holdsStatus === 'escalated call 4+ day' ||
      t.holdsStatus === 'ESCALATED CALL 4+ DAY'
    );
    console.log(`\n📋 Tasks in "Escalated Call 4+ Day" queue: ${escalatedCallTasks.length}`);
    console.log(`   - Not completed: ${escalatedCallTasks.filter(t => !t.endTime).length}`);

    // Check unique queue names (to see if there are variations)
    const uniqueQueues = [...new Set(allTasks.map(t => t.holdsStatus).filter(Boolean))];
    console.log('\n📝 All unique queue names found:');
    uniqueQueues.forEach(queue => {
      const count = allTasks.filter(t => t.holdsStatus === queue).length;
      console.log(`  "${queue}": ${count} tasks`);
    });

    // Check for Nov 18, 2025 specifically
    const nov18Start = new Date('2025-11-18T08:00:00Z'); // 12 AM PST = 8 AM UTC
    const nov18End = new Date('2025-11-19T01:00:00Z'); // 5 PM PST Nov 18 = 1 AM UTC Nov 19
    
    const tasksOnNov18 = allTasks.filter(t => {
      const created = new Date(t.createdAt);
      return created >= nov18Start && created < nov18End;
    });
    
    console.log(`\n📅 Tasks created on Nov 18, 2025: ${tasksOnNov18.length}`);
    
    const tasksInQueuesOnNov18 = allTasks.filter(t => {
      // Task existed before end of Nov 18
      const created = new Date(t.createdAt);
      if (created >= nov18End) return false;
      
      // Task wasn't completed BEFORE end of Nov 18
      // If completed AFTER end of day, it was still in queue at EOD
      if (t.endTime) {
        const completed = new Date(t.endTime);
        if (completed < nov18End) {
          // Completed before EOD, so it wasn't in queue at EOD
          return false;
        }
        // Completed after EOD (or on a later day), so it WAS in queue at EOD
      }
      
      return true;
    });
    
    // Also check the Customer Contact tasks specifically
    console.log(`\n🔍 Detailed Customer Contact Analysis for Nov 18:`);
    const customerContactAll = allTasks.filter(t => t.holdsStatus === 'Customer Contact');
    console.log(`Total Customer Contact tasks: ${customerContactAll.length}`);
    
    customerContactAll.forEach((task, idx) => {
      const created = new Date(task.createdAt);
      const completed = task.endTime ? new Date(task.endTime) : null;
      const wasInQueueAtEOD = created < nov18End && (!completed || completed >= nov18End);
      
      if (idx < 10) { // Show first 10
        console.log(`  ${idx + 1}. Order: ${task.holdsOrderNumber || 'N/A'}, Created: ${created.toISOString()}, Completed: ${completed ? completed.toISOString() : 'Not completed'}, In queue at EOD: ${wasInQueueAtEOD}`);
      }
    });
    
    const customerContactAtEOD = customerContactAll.filter(t => {
      const created = new Date(t.createdAt);
      if (created >= nov18End) return false;
      if (t.endTime) {
        const completed = new Date(t.endTime);
        return completed >= nov18End; // Completed after EOD
      }
      return true; // Not completed
    });
    
    console.log(`\n✅ Customer Contact tasks that were in queue at Nov 18 EOD: ${customerContactAtEOD.length}`);
    
    // Check CURRENT state - what's in Customer Contact queue RIGHT NOW
    console.log(`\n📊 CURRENT STATE (Today):`);
    const currentCustomerContact = allTasks.filter(t => 
      t.holdsStatus === 'Customer Contact' && !t.endTime
    );
    console.log(`Tasks currently in Customer Contact (not completed): ${currentCustomerContact.length}`);
    
    // Check if maybe the user wants CURRENT queue state, not historical
    // Maybe the 53 tasks are currently in Customer Contact and should show for today's EOD
    const today = new Date();
    const today5PM = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1, 1, 0, 0, 0)); // 5 PM PST today
    const currentInQueues = allTasks.filter(t => {
      if (!t.endTime) return true; // Not completed, so in queue
      const completed = new Date(t.endTime);
      return completed >= today5PM; // Completed after today's 5 PM
    });
    
    const currentQueueCounts = {};
    currentInQueues.forEach(task => {
      const queue = task.holdsStatus || 'NULL';
      currentQueueCounts[queue] = (currentQueueCounts[queue] || 0) + 1;
    });
    
    console.log(`\n📊 Current Queue Counts (as of now):`);
    Object.entries(currentQueueCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([queue, count]) => {
        console.log(`  ${queue || '(null)'}: ${count}`);
      });
    
    const currentPending = (currentQueueCounts['Customer Contact'] || 0) + 
                          (currentQueueCounts['Escalated Call 4+ Day'] || 0);
    console.log(`\n✅ Current Pending (Customer Contact + Escalated): ${currentPending}`);
    
    // Maybe the issue is that for Nov 18, we should use CURRENT status if task wasn't completed before Nov 18 EOD?
    // Let's try a different approach - use current holdsStatus for tasks that existed on Nov 18
    console.log(`\n🔄 Alternative Calculation (using current status for tasks that existed on Nov 18):`);
    const tasksExistedNov18 = allTasks.filter(t => {
      const created = new Date(t.createdAt);
      return created < nov18End; // Existed before Nov 18 EOD
    });
    
    const altQueueCounts = {};
    tasksExistedNov18.forEach(task => {
      // Only count if task wasn't completed before Nov 18 EOD
      if (task.endTime) {
        const completed = new Date(task.endTime);
        if (completed < nov18End) return; // Completed before EOD, don't count
      }
      
      // Use current holdsStatus
      const queue = task.holdsStatus || 'NULL';
      altQueueCounts[queue] = (altQueueCounts[queue] || 0) + 1;
    });
    
    console.log(`Tasks that existed on Nov 18 and weren't completed before EOD: ${tasksExistedNov18.filter(t => {
      if (t.endTime) {
        const completed = new Date(t.endTime);
        return completed >= nov18End;
      }
      return true;
    }).length}`);
    
    Object.entries(altQueueCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([queue, count]) => {
        console.log(`  ${queue || '(null)'}: ${count}`);
      });
    
    const altPending = (altQueueCounts['Customer Contact'] || 0) + 
                      (altQueueCounts['Escalated Call 4+ Day'] || 0);
    console.log(`\n✅ Alternative Pending Calculation: ${altPending}`);
    
    console.log(`📅 Tasks that would be counted for Nov 18 EOD: ${tasksInQueuesOnNov18.length}`);
    
    const queueCountsNov18 = {};
    tasksInQueuesOnNov18.forEach(task => {
      const queue = task.holdsStatus || 'NULL';
      queueCountsNov18[queue] = (queueCountsNov18[queue] || 0) + 1;
    });
    
    console.log('\n📊 Queue Counts for Nov 18 EOD:');
    Object.entries(queueCountsNov18)
      .sort((a, b) => b[1] - a[1])
      .forEach(([queue, count]) => {
        console.log(`  ${queue || '(null)'}: ${count}`);
      });
    
    const pendingNov18 = (queueCountsNov18['Customer Contact'] || 0) + 
                        (queueCountsNov18['Escalated Call 4+ Day'] || 0);
    console.log(`\n✅ Calculated Pending at EOD (Nov 18): ${pendingNov18}`);
    console.log(`   - Customer Contact: ${queueCountsNov18['Customer Contact'] || 0}`);
    console.log(`   - Escalated Call 4+ Day: ${queueCountsNov18['Escalated Call 4+ Day'] || 0}`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkHoldsQueues();

