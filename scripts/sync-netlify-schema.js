#!/usr/bin/env node

const { requireEnv } = require('./lib/require-env');
requireEnv('DATABASE_URL');

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function syncSchema() {
  try {
    console.log('🔄 Syncing schema to the database that Netlify is using...');
    
    // Check current data
    const userCount = await prisma.user.count();
    const taskCount = await prisma.task.count();
    
    console.log(`📊 Current data: ${userCount} users, ${taskCount} tasks`);
    
    // Sync the schema
    console.log('🔄 Syncing schema...');
    const { execSync } = require('child_process');
    execSync('npx prisma db push', { stdio: 'inherit', env: process.env });
    
    console.log('✅ Schema synced successfully!');
    
    // Now wipe the data
    console.log('🗑️  Wiping old data...');
    
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
    console.error('❌ Sync failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

syncSchema();
