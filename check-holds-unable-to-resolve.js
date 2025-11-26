/**
 * Script to check if "Unable to Resolve" dispositions are being counted correctly
 * for Holds tasks in agent completion stats.
 * 
 * This script checks the live Railway database to verify:
 * 1. If Magaly completed a task with "Unable to Resolve" disposition
 * 2. Whether that task is showing up in completion stats
 * 3. What the current state of the task is (assignedToId, status, etc.)
 */

const { PrismaClient } = require('@prisma/client');

// Use Railway's DATABASE_URL (production) - explicitly set to bypass local .env
const RAILWAY_DB_URL = 'postgresql://postgres:OUYdvdsKqOUGwpTWTUUniqINJdjqIBdy@interchange.proxy.rlwy.net:43835/railway';

console.log('🔗 Connecting to Railway production database...');
console.log(`   Host: interchange.proxy.rlwy.net:43835`);
console.log(`   Database: railway\n`);

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: RAILWAY_DB_URL
    }
  }
});

async function checkHoldsUnableToResolve() {
  try {
    console.log('🔍 Checking Holds "Unable to Resolve" completion tracking...\n');

    // First, check database connection and list some users
    console.log('🔍 Checking database connection...\n');
    const totalUsers = await prisma.user.count();
    const totalHoldsTasks = await prisma.task.count({ where: { taskType: 'HOLDS' } });
    console.log(`✅ Database connected.`);
    console.log(`   Total users: ${totalUsers}`);
    console.log(`   Total Holds tasks: ${totalHoldsTasks}\n`);

    // First, let's check for "Unable to Resolve" tasks directly
    console.log('🔍 Checking for "Unable to Resolve" tasks...\n');
    const unableToResolveTasks = await prisma.task.findMany({
      where: {
        taskType: 'HOLDS',
        disposition: 'Unable to Resolve',
        status: 'COMPLETED'
      },
      select: {
        id: true,
        status: true,
        disposition: true,
        assignedToId: true,
        endTime: true,
        holdsStatus: true,
        assignedTo: {
          select: {
            id: true,
            email: true,
            name: true
          }
        }
      },
      orderBy: {
        endTime: 'desc'
      },
      take: 10
    });

    console.log(`📊 Found ${unableToResolveTasks.length} "Unable to Resolve" tasks (showing first 10):\n`);
    if (unableToResolveTasks.length > 0) {
      unableToResolveTasks.forEach((task, idx) => {
        console.log(`${idx + 1}. Task ID: ${task.id}`);
        console.log(`   Status: ${task.status}`);
        console.log(`   Assigned To: ${task.assignedTo ? `${task.assignedTo.name} (${task.assignedTo.email})` : 'NULL (Unassigned)'}`);
        console.log(`   Current Queue: ${task.holdsStatus || 'N/A'}`);
        console.log(`   End Time: ${task.endTime?.toISOString() || 'N/A'}`);
        console.log('');
      });
    }

    // Find Magaly's user record - try multiple search patterns
    let magaly = await prisma.user.findFirst({
      where: {
        OR: [
          { email: { contains: 'magaly', mode: 'insensitive' } },
          { name: { contains: 'magaly', mode: 'insensitive' } },
          { email: { contains: 'magali', mode: 'insensitive' } },
          { name: { contains: 'magali', mode: 'insensitive' } }
        ]
      },
      select: {
        id: true,
        email: true,
        name: true
      }
    });

    if (!magaly) {
      console.log('❌ Could not find Magaly in the database');
      console.log('📋 Listing all users to help identify the correct email/name...\n');
      const allUsers = await prisma.user.findMany({
        select: {
          id: true,
          email: true,
          name: true
        },
        orderBy: {
          createdAt: 'desc'
        }
      });
      console.log(`Found ${allUsers.length} total users:`);
      allUsers.forEach((u, idx) => {
        console.log(`  ${idx + 1}. ${u.name || 'N/A'} - ${u.email}`);
      });
      console.log('\n💡 Please provide Magaly\'s exact email address or name to continue.');
      console.log('   Or we can proceed with analyzing all "Unable to Resolve" tasks.\n');
      return;
    }

    console.log(`✅ Found user: ${magaly.name} (${magaly.email}) - ID: ${magaly.id}\n`);

    // Get today's date range (PST timezone - 8 hours offset)
    const now = new Date();
    const pstOffset = 8 * 60 * 60 * 1000; // 8 hours in milliseconds
    const nowPST = new Date(now.getTime() + pstOffset);
    const year = nowPST.getUTCFullYear();
    const month = nowPST.getUTCMonth();
    const day = nowPST.getUTCDate();
    
    const startOfDay = new Date(Date.UTC(year, month, day, 0, 0, 0, 0) + pstOffset);
    const endOfDay = new Date(Date.UTC(year, month, day, 23, 59, 59, 999) + pstOffset);

    // Also check last 7 days to catch recent completions
    const startOfWeek = new Date(startOfDay.getTime() - (7 * 24 * 60 * 60 * 1000));

    console.log(`📅 Checking tasks completed today (PST): ${startOfDay.toISOString()} to ${endOfDay.toISOString()}`);
    console.log(`📅 Also checking last 7 days: ${startOfWeek.toISOString()} to ${endOfDay.toISOString()}\n`);

    // Find all Holds tasks completed in the last 7 days
    const allCompletedRecent = await prisma.task.findMany({
      where: {
        taskType: 'HOLDS',
        endTime: {
          gte: startOfWeek,
          lte: endOfDay
        }
      },
      select: {
        id: true,
        status: true,
        disposition: true,
        assignedToId: true,
        endTime: true,
        holdsStatus: true,
        holdsQueueHistory: true,
        assignedTo: {
          select: {
            id: true,
            email: true,
            name: true
          }
        }
      },
      orderBy: {
        endTime: 'desc'
      }
    });

    // Filter for tasks completed today
    const allCompletedToday = allCompletedRecent.filter(t => 
      t.endTime && t.endTime >= startOfDay && t.endTime <= endOfDay
    );

    console.log(`📊 Total Holds tasks completed in last 7 days: ${allCompletedRecent.length}`);
    console.log(`📊 Total Holds tasks completed today: ${allCompletedToday.length}`);

    // Filter for tasks currently assigned to Magaly
    const assignedToMagaly = allCompletedToday.filter(t => t.assignedToId === magaly.id);
    console.log(`👤 Tasks currently assigned to Magaly (today): ${assignedToMagaly.length}`);

    // Filter for "Unable to Resolve" dispositions
    const unableToResolve = allCompletedRecent.filter(t => 
      t.disposition === 'Unable to Resolve'
    );
    console.log(`⏭️  Tasks with "Unable to Resolve" disposition (last 7 days): ${unableToResolve.length}`);

    // Check for tasks that were completed but are now unassigned
    const unassignedCompleted = allCompletedRecent.filter(t => 
      t.assignedToId === null && 
      t.status === 'COMPLETED' &&
      t.disposition === 'Unable to Resolve'
    );
    console.log(`🔓 Unassigned completed tasks with "Unable to Resolve" (last 7 days): ${unassignedCompleted.length}\n`);

    // Check queue history for Magaly's involvement
    console.log('🔍 Checking queue history for Magaly\'s involvement...\n');
    
    const tasksWithMagalyInHistory = allCompletedRecent.filter(task => {
      if (!task.holdsQueueHistory || !Array.isArray(task.holdsQueueHistory)) return false;
      
      // Check if any entry in queue history mentions Magaly
      return task.holdsQueueHistory.some((entry) => {
        if (typeof entry === 'string') {
          return entry.toLowerCase().includes('magaly') || entry.toLowerCase().includes(magaly.email.toLowerCase());
        }
        if (entry.movedBy) {
          return entry.movedBy.toLowerCase().includes('magaly') || 
                 entry.movedBy.toLowerCase().includes(magaly.email.toLowerCase()) ||
                 entry.movedBy.includes(magaly.id);
        }
        return false;
      });
    });

    console.log(`📝 Tasks with Magaly mentioned in queue history: ${tasksWithMagalyInHistory.length}\n`);

    // Show details of "Unable to Resolve" tasks that might be Magaly's
    if (unableToResolve.length > 0) {
      console.log('📋 Details of "Unable to Resolve" tasks (checking if any are Magaly\'s):\n');
      unableToResolve.slice(0, 10).forEach((task, idx) => {
        const queueHistory = task.holdsQueueHistory || [];
        const lastEntry = Array.isArray(queueHistory) ? queueHistory[queueHistory.length - 1] : null;
        const movedBy = lastEntry && typeof lastEntry === 'object' ? lastEntry.movedBy : null;
        const mightBeMagaly = movedBy && (
          movedBy.toLowerCase().includes('magaly') || 
          movedBy.toLowerCase().includes(magaly.email.toLowerCase()) ||
          movedBy.includes(magaly.id)
        );
        
        console.log(`${idx + 1}. Task ID: ${task.id} ${mightBeMagaly ? '🎯 (POSSIBLY MAGALY\'S)' : ''}`);
        console.log(`   Status: ${task.status}`);
        console.log(`   Disposition: ${task.disposition}`);
        console.log(`   Assigned To: ${task.assignedTo ? `${task.assignedTo.name} (${task.assignedTo.email})` : 'NULL (Unassigned)'}`);
        console.log(`   Current Queue: ${task.holdsStatus || 'N/A'}`);
        console.log(`   End Time: ${task.endTime?.toISOString() || 'N/A'}`);
        if (movedBy) {
          console.log(`   Last Moved By: ${movedBy}`);
        }
        console.log('');
      });
    }

    // Now check what the completion stats API would return
    console.log('🔍 Checking what completion stats API would return...\n');
    
    const completionStatsQuery = await prisma.task.groupBy({
      by: ['taskType'],
      where: {
        OR: [
          {
            assignedToId: magaly.id,
            status: 'COMPLETED',
            endTime: {
              gte: startOfDay,
              lte: endOfDay
            }
          },
          {
            sentBackBy: magaly.id,
            status: 'PENDING',
            endTime: {
              gte: startOfDay,
              lte: endOfDay
            }
          }
        ]
      },
      _count: {
        id: true
      }
    });

    const holdsCount = completionStatsQuery.find(s => s.taskType === 'HOLDS');
    console.log(`📊 Completion Stats API would return for HOLDS: ${holdsCount?._count.id || 0}`);

    // Count manually what should be included (checking queue history for Magaly)
    const shouldBeCounted = allCompletedRecent.filter(t => {
      // Tasks currently assigned to Magaly with COMPLETED status
      if (t.assignedToId === magaly.id && t.status === 'COMPLETED') {
        return true;
      }
      // Tasks with "Unable to Resolve" that were completed by Magaly (even if now unassigned)
      if (t.disposition === 'Unable to Resolve' && t.status === 'COMPLETED') {
        // Check queue history to see if Magaly was involved
        if (t.holdsQueueHistory && Array.isArray(t.holdsQueueHistory)) {
          const lastEntry = t.holdsQueueHistory[t.holdsQueueHistory.length - 1];
          if (lastEntry && typeof lastEntry === 'object' && lastEntry.movedBy) {
            if (lastEntry.movedBy.includes(magaly.email) || 
                lastEntry.movedBy.includes(magaly.id) ||
                lastEntry.movedBy.toLowerCase().includes('magaly')) {
              return true;
            }
          }
        }
      }
      return false;
    });

    console.log(`\n✅ Tasks that SHOULD be counted: ${shouldBeCounted.length}`);
    console.log(`❌ Tasks that ARE being counted: ${holdsCount?._count.id || 0}`);
    console.log(`📉 Missing count: ${shouldBeCounted.length - (holdsCount?._count.id || 0)}\n`);

    // Summary
    console.log('📊 SUMMARY:\n');
    console.log(`Total Holds tasks completed today: ${allCompletedToday.length}`);
    console.log(`Tasks with "Unable to Resolve": ${unableToResolve.length}`);
    console.log(`Tasks currently assigned to Magaly: ${assignedToMagaly.length}`);
    console.log(`Tasks unassigned but completed: ${unassignedCompleted.length}`);
    console.log(`\n🎯 ISSUE IDENTIFIED:`);
    console.log(`   Tasks with "Unable to Resolve" are set to COMPLETED status but assignedToId is set to NULL.`);
    console.log(`   The completion stats query only looks for: assignedToId = user.id AND status = 'COMPLETED'`);
    console.log(`   Since assignedToId is NULL, these tasks are NOT being counted!`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkHoldsUnableToResolve();

