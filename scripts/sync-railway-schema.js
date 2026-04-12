#!/usr/bin/env node

const { requireEnv } = require('./lib/require-env');
requireEnv('DATABASE_URL');

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function syncSchema() {
  try {
    console.log('🔄 Syncing Railway database schema...');
    
    // Test connection
    await prisma.$connect();
    console.log('✅ Connected to Railway database');
    
    // Check if ImportSession table exists
    const result = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'ImportSession'
      );
    `;
    
    console.log('📋 ImportSession table exists:', result[0].exists);
    
    if (!result[0].exists) {
      console.log('⚠️  ImportSession table missing - schema needs sync');
      console.log('💡 Run: npx prisma db push (locally with Railway DATABASE_URL)');
    } else {
      console.log('✅ Schema appears to be in sync');
    }
    
  } catch (error) {
    console.error('❌ Schema sync failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

syncSchema();
