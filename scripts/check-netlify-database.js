#!/usr/bin/env node

const { requireEnv } = require('./lib/require-env');
requireEnv('DATABASE_URL');

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkDatabase() {
  try {
    console.log('🔍 Checking which database Netlify is connected to...');
    
    // Get database connection info
    const result = await prisma.$queryRaw`
      SELECT current_database(), current_user, inet_server_addr(), inet_server_port();
    `;
    
    console.log('📊 Database Info:');
    console.log('   Database:', result[0].current_database);
    console.log('   User:', result[0].current_user);
    console.log('   Host:', result[0].inet_server_addr);
    console.log('   Port:', result[0].inet_server_port);
    
    // Check data counts
    const userCount = await prisma.user.count();
    const taskCount = await prisma.task.count();
    
    console.log('📋 Data Counts:');
    console.log('   Users:', userCount);
    console.log('   Tasks:', taskCount);
    
    if (userCount > 0 || taskCount > 0) {
      console.log('⚠️  WARNING: Database contains data! Confirm this is the intended target.');
    } else {
      console.log('✅ Database is empty as expected');
    }
    
  } catch (error) {
    console.error('❌ Database check failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

checkDatabase();
