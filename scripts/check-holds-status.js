/**
 * Script to check overall Holds status and recent imports
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkHoldsStatus() {
  try {
    console.log('🔍 Checking Holds system status...\n');

    // 1. Count all Holds tasks
    const totalHolds = await prisma.task.count({
      where: { taskType: 'HOLDS' }
    });
    console.log(`📊 Total Holds tasks in system: ${totalHolds}\n`);

    // 2. Count by queue
    const byQueue = await prisma.task.groupBy({
      by: ['holdsStatus'],
      where: { taskType: 'HOLDS' },
      _count: true
    });
    
    console.log('📋 Tasks by queue:');
    byQueue.forEach(q => {
      console.log(`   ${q.holdsStatus || 'NULL'}: ${q._count}`);
    });
    console.log('');

    // 3. Check recent import sessions
    console.log('📥 Recent import sessions (last 5):\n');
    const recentImports = await prisma.importSession.findMany({
      where: { taskType: 'HOLDS' },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        fileName: true,
        imported: true,
        duplicates: true,
        errors: true,
        createdAt: true,
        createdBy: {
          select: {
            name: true,
            email: true
          }
        }
      }
    });

    recentImports.forEach((session, index) => {
      console.log(`${index + 1}. ${session.fileName}`);
      console.log(`   Imported: ${session.imported}, Duplicates: ${session.duplicates}, Errors: ${session.errors}`);
      console.log(`   Created: ${session.createdAt.toISOString()}`);
      console.log(`   By: ${session.createdBy?.name || 'Unknown'} (${session.createdBy?.email || 'N/A'})`);
      console.log('');
    });

    // 4. Check for tasks with the specific order dates from the screenshots
    console.log('🔍 Checking for tasks with order dates from screenshots:\n');
    const specificDates = [
      '2025-11-29',
      '2025-11-27',
      '2025-11-28',
      '2025-11-26',
      '2025-11-24',
      '2025-11-25'
    ];

    for (const dateStr of specificDates) {
      const date = new Date(dateStr + 'T00:00:00Z');
      const nextDay = new Date(dateStr + 'T23:59:59Z');
      
      const tasks = await prisma.task.findMany({
        where: {
          taskType: 'HOLDS',
          holdsOrderDate: {
            gte: date,
            lte: nextDay
          }
        },
        select: {
          id: true,
          holdsOrderNumber: true,
          holdsCustomerEmail: true,
          holdsStatus: true,
          status: true
        }
      });

      if (tasks.length > 0) {
        console.log(`   ${dateStr}: ${tasks.length} tasks`);
        tasks.forEach(t => {
          console.log(`      - ${t.id}: ${t.holdsOrderNumber || 'NULL'} | Email: ${t.holdsCustomerEmail || 'NULL'} | Queue: ${t.holdsStatus}`);
        });
      }
    }

    // 5. Check duplicate records
    console.log('\n🔍 Checking recent duplicate records:\n');
    const recentDuplicates = await prisma.duplicateRecord.findMany({
      where: {
        importSession: {
          taskType: 'HOLDS'
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        documentNumber: true,
        webOrder: true,
        customerName: true,
        source: true,
        createdAt: true,
        importSession: {
          select: {
            fileName: true
          }
        }
      }
    });

    if (recentDuplicates.length > 0) {
      console.log(`Found ${recentDuplicates.length} recent duplicate records:\n`);
      recentDuplicates.forEach((dup, index) => {
        console.log(`${index + 1}. ${dup.documentNumber || dup.webOrder || 'NULL'}`);
        console.log(`   Customer: ${dup.customerName || 'NULL'}`);
        console.log(`   Source: ${dup.source || 'NULL'}`);
        console.log(`   Import: ${dup.importSession?.fileName || 'NULL'}`);
        console.log(`   Created: ${dup.createdAt.toISOString()}`);
        console.log('');
      });
    } else {
      console.log('No recent duplicate records found.');
    }

  } catch (error) {
    console.error('❌ Error checking status:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
checkHoldsStatus()
  .then(() => {
    console.log('\n✅ Status check complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });









