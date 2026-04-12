#!/usr/bin/env node

const { requireEnv } = require('./lib/require-env');
requireEnv('DATABASE_URL');

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function wipeDatabase() {
  try {
    console.log('🗑️  Wiping the database that Netlify is actually using...');
    
    // Check current data
    const userCount = await prisma.user.count();
    const taskCount = await prisma.task.count();
    const importCount = await prisma.importSession.count();
    
    console.log(`📊 Current data: ${userCount} users, ${taskCount} tasks, ${importCount} import sessions`);
    
    if (userCount === 0 && taskCount === 0) {
      console.log('✅ Database is already empty');
      return;
    }
    
    // Wipe all data
    console.log('🗑️  Deleting all data...');
    
    await prisma.task.deleteMany();
    await prisma.rawMessage.deleteMany();
    await prisma.importBatch.deleteMany();
    await prisma.importSession.deleteMany();
    await prisma.spamLabel.deleteMany();
    await prisma.spamRule.deleteMany();
    await prisma.user.deleteMany();
    
    console.log('✅ Database wiped successfully!');
    
    // Verify
    const finalUserCount = await prisma.user.count();
    const finalTaskCount = await prisma.task.count();
    
    console.log(`📊 Final data: ${finalUserCount} users, ${finalTaskCount} tasks`);
    
  } catch (error) {
    console.error('❌ Wipe failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

wipeDatabase();
