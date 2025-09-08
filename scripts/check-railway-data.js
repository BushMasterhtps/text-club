#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');

// Use Railway's DATABASE_URL
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'postgresql://postgres:OUYdvdsKqOUGwpTWTUUniqINJdjqIBdy@interchange.proxy.rlwy.net:43835/railway'
    }
  }
});

async function checkData() {
  try {
    console.log('🔍 Checking Railway database contents...');
    
    // Check Users
    const userCount = await prisma.user.count();
    console.log(`👥 Users: ${userCount}`);
    if (userCount > 0) {
      const users = await prisma.user.findMany({
        select: { id: true, name: true, email: true, role: true }
      });
      console.log('   Users:', users);
    }
    
    // Check Tasks
    const taskCount = await prisma.task.count();
    console.log(`📋 Tasks: ${taskCount}`);
    if (taskCount > 0) {
      const tasks = await prisma.task.findMany({
        select: { id: true, taskType: true, status: true, brand: true }
      });
      console.log('   Tasks:', tasks.slice(0, 5)); // Show first 5
    }
    
    // Check Import Sessions
    const importCount = await prisma.importSession.count();
    console.log(`📥 Import Sessions: ${importCount}`);
    
    // Check Raw Messages
    const rawMessageCount = await prisma.rawMessage.count();
    console.log(`📨 Raw Messages: ${rawMessageCount}`);
    
    // Check Spam Rules
    const spamRuleCount = await prisma.spamRule.count();
    console.log(`🚫 Spam Rules: ${spamRuleCount}`);
    
    console.log('\n📊 Summary:');
    console.log(`   - Users: ${userCount}`);
    console.log(`   - Tasks: ${taskCount}`);
    console.log(`   - Import Sessions: ${importCount}`);
    console.log(`   - Raw Messages: ${rawMessageCount}`);
    console.log(`   - Spam Rules: ${spamRuleCount}`);
    
    if (userCount > 0 || taskCount > 0) {
      console.log('\n⚠️  WARNING: Database still contains data! Wipe may have failed.');
    } else {
      console.log('\n✅ Database appears to be empty.');
    }
    
  } catch (error) {
    console.error('❌ Check failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

checkData();
