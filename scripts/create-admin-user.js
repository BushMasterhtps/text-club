#!/usr/bin/env node

const { requireEnv } = require('./lib/require-env');
requireEnv('DATABASE_URL');

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function createAdminUser() {
  try {
    console.log('👤 Creating/updating emergency admin user account...');
    
    // Hash the password
    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    // Create or update the emergency admin user
    const user = await prisma.user.upsert({
      where: {
        email: 'daniel.murcia@goldenboltllc.com',
      },
      create: {
        name: 'Daniel Murcia',
        email: 'daniel.murcia@goldenboltllc.com',
        password: hashedPassword,
        role: 'MANAGER_AGENT',
        isActive: true,
        mustChangePassword: false,
      },
      update: {
        name: 'Daniel Murcia',
        password: hashedPassword,
        role: 'MANAGER_AGENT',
        isActive: true,
        mustChangePassword: false,
      },
    });
    
    console.log('✅ Emergency admin user ready.');
    console.log('📧 Email: daniel.murcia@goldenboltllc.com');
    console.log('🔑 Password: admin123');
    console.log('👑 Role: MANAGER_AGENT');
    console.log('🆔 User ID:', user.id);
    
  } catch (error) {
    console.error('❌ User creation failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createAdminUser();
