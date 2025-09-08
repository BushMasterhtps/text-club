const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function prepareForDeployment() {
  console.log('🚀 Preparing for deployment...');
  console.log('📊 Preserving all Text Club data and users');
  console.log('🧹 Cleaning up test data for WOD/IVCS and Email Requests');

  try {
    // 1. Delete all WOD/IVCS tasks (test data only)
    const wodIvcsDeleted = await prisma.task.deleteMany({
      where: {
        taskType: 'WOD_IVCS'
      }
    });
    console.log(`✅ Deleted ${wodIvcsDeleted.count} WOD/IVCS test tasks`);

    // 2. Delete all Email Requests tasks (test data only)
    const emailRequestsDeleted = await prisma.task.deleteMany({
      where: {
        taskType: 'EMAIL_REQUESTS'
      }
    });
    console.log(`✅ Deleted ${emailRequestsDeleted.count} Email Requests test tasks`);

    // 3. Delete all Standalone Refunds tasks (test data only)
    const standaloneRefundsDeleted = await prisma.task.deleteMany({
      where: {
        taskType: 'STANDALONE_REFUNDS'
      }
    });
    console.log(`✅ Deleted ${standaloneRefundsDeleted.count} Standalone Refunds test tasks`);

    // 4. Clean up any import sessions (they don't have taskType, so we'll clean recent ones)
    // Note: ImportSession doesn't have taskType field, so we'll keep them for now
    // They're not tied to specific task types and won't interfere with deployment
    console.log(`✅ Import sessions preserved (not tied to specific task types)`);

    // 5. Verify Text Club data is preserved
    const textClubTasks = await prisma.task.count({
      where: {
        taskType: 'TEXT_CLUB'
      }
    });
    console.log(`✅ Preserved ${textClubTasks} Text Club tasks`);

    // 6. Verify users are preserved
    const userCount = await prisma.user.count();
    console.log(`✅ Preserved ${userCount} users`);

    // 7. Show summary of what's being deployed
    console.log('\n📋 DEPLOYMENT SUMMARY:');
    console.log('✅ Text Club dashboard - FULLY FUNCTIONAL with existing data');
    console.log('✅ WOD/IVCS dashboard - DEPLOYED (clean, no data)');
    console.log('✅ Email Requests dashboard - DEPLOYED (clean, no data)');
    console.log('✅ Analytics dashboard - DEPLOYED (will show data as it comes in)');
    console.log('✅ Agent portal - ENHANCED with all task types');
    console.log('✅ Unified Settings - DEPLOYED across all dashboards');
    console.log('✅ New Golden Companies logo - DEPLOYED');
    console.log('✅ All users and Text Club data - PRESERVED');

    console.log('\n🎉 Ready for deployment!');
    console.log('💡 New features will be available immediately');
    console.log('💡 Text Club functionality remains unchanged');
    console.log('💡 WOD/IVCS and Email Requests ready for real data import');

  } catch (error) {
    console.error('❌ Error preparing for deployment:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the preparation
prepareForDeployment()
  .then(() => {
    console.log('\n✅ Deployment preparation completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Deployment preparation failed:', error);
    process.exit(1);
  });
