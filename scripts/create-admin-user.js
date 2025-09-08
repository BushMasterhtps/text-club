#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

// Connect to the database that Netlify is using
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://postgres:OUYdvdsKqOUGwpTWTUUniqINJdjqIBdy@interchange.proxy.rlwy.net:43835/railway'
    }
  }
});

async function createAdminUser() {
  try {
    console.log('👤 Creating admin user account...');
    
    // Hash the password
    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    // Create the user
    const user = await prisma.user.create({
      data: {
        name: 'Daniel Murcia',
        email: 'daniel.murcia@goldenboltllc.com',
        password: hashedPassword,
        role: 'MANAGER'
      }
    });
    
    console.log('✅ Admin user created successfully!');
    console.log('📧 Email: daniel.murcia@goldenboltllc.com');
    console.log('🔑 Password: admin123');
    console.log('👑 Role: MANAGER');
    console.log('🆔 User ID:', user.id);
    
  } catch (error) {
    console.error('❌ User creation failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createAdminUser();
