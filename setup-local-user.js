const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

async function setupLocalUser() {
  const prisma = new PrismaClient();
  
  try {
    // Create a test manager user for local development
    const hashedPassword = await bcrypt.hash('password123', 10);
    
    const user = await prisma.user.create({
      data: {
        email: 'test@local.com',
        name: 'Local Test User',
        password: hashedPassword,
        role: 'MANAGER',
        isActive: true,
        mustChangePassword: false
      }
    });
    
    console.log('✅ Local test user created!');
    console.log(`Email: ${user.email}`);
    console.log(`Password: password123`);
    console.log(`Role: ${user.role}`);
    
  } catch (error) {
    if (error.code === 'P2002') {
      console.log('ℹ️  User already exists, skipping creation');
    } else {
      console.error('Error creating user:', error);
    }
  } finally {
    await prisma.$disconnect();
  }
}

setupLocalUser();
