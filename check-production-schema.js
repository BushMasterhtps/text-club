const { PrismaClient } = require('@prisma/client');

async function checkProductionSchema() {
  // This will use the production DATABASE_URL from Railway's environment variables
  const prisma = new PrismaClient();

  try {
    console.log('🔍 Checking production database schema...');
    
    // Try to query a task with the new fields
    const task = await prisma.task.findFirst({
      select: {
        id: true,
        sentBackBy: true,
        sentBackAt: true,
        sentBackDisposition: true
      }
    });

    console.log('✅ Production database schema check:');
    console.log('   - sentBackBy field exists:', task ? 'YES' : 'NO');
    console.log('   - sentBackAt field exists:', task ? 'YES' : 'NO');
    console.log('   - sentBackDisposition field exists:', task ? 'YES' : 'NO');
    
    if (task) {
      console.log('   - Sample task with new fields:', task);
    }

  } catch (error) {
    console.error('❌ Error checking production schema:', error.message);
    
    if (error.message.includes('Unknown field')) {
      console.log('🚨 The new fields are missing from the production database!');
      console.log('   This explains why the task counting is not working.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

checkProductionSchema();
