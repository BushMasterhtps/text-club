const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'postgresql://postgres:OUYdvdsKqOUGwpTWTUUniqINJdjqIBdy@interchange.proxy.rlwy.net:43835/railway'
    }
  }
});

async function verifyIndex() {
  try {
    const result = await prisma.$queryRaw`
      SELECT indexname, indexdef 
      FROM pg_indexes 
      WHERE tablename = 'Task' 
      AND indexname LIKE '%status_endTime%'
    `;
    
    if (result.length > 0) {
      console.log('✅ Index found:');
      console.log(`   Name: ${result[0].indexname}`);
      console.log(`   Definition: ${result[0].indexdef}`);
      console.log('\n🎉 Migration successful! Index exists in Railway database.');
    } else {
      console.log('❌ Index not found!');
    }
  } catch (error) {
    console.error('Error checking index:', error);
  } finally {
    await prisma.$disconnect();
  }
}

verifyIndex();

