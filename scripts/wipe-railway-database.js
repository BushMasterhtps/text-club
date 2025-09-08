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

async function wipeDatabase() {
  try {
    console.log('🗑️  Starting Railway database wipe...');
    console.log('⚠️  WARNING: This will delete ALL data in the Railway database!');
    
    // Delete all data in reverse dependency order
    console.log('🗑️  Deleting all tasks...');
    await prisma.task.deleteMany();
    
    console.log('🗑️  Deleting all raw messages...');
    await prisma.rawMessage.deleteMany();
    
    console.log('🗑️  Deleting all import batches...');
    await prisma.importBatch.deleteMany();
    
    console.log('🗑️  Deleting all import sessions...');
    await prisma.importSession.deleteMany();
    
    console.log('🗑️  Deleting all spam labels...');
    await prisma.spamLabel.deleteMany();
    
    console.log('🗑️  Deleting all spam rules...');
    await prisma.spamRule.deleteMany();
    
    console.log('🗑️  Deleting all users...');
    await prisma.user.deleteMany();
    
    // Note: taskLog model doesn't exist
    
    console.log('🎉 Railway database wiped successfully!');
    console.log('✅ All tables are now empty and ready for fresh deployment');
    
  } catch (error) {
    console.error('❌ Database wipe failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

wipeDatabase();
