const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

async function setupLocalUser() {
  // SAFETY: Ensure we're using LOCAL database only
  // Check DATABASE_URL to make sure it's not production
  const dbUrl = process.env.DATABASE_URL || '';
  
  if (dbUrl.includes('railway') || dbUrl.includes('interchange.proxy.rlwy.net')) {
    console.error('❌ ERROR: Production database detected!');
    console.error('This script should only run with LOCAL database.');
    console.error('Please set DATABASE_URL to your local database in .env file');
    process.exit(1);
  }
  
  if (!dbUrl || dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1') || dbUrl.includes('postgresql://postgres')) {
    console.log('✅ Using local database (safe to proceed)');
  } else {
    console.warn('⚠️  WARNING: Unrecognized DATABASE_URL. Make sure this is your LOCAL database!');
    console.warn(`DATABASE_URL: ${dbUrl.substring(0, 30)}...`);
  }
  
  const prisma = new PrismaClient();
  
  try {
    // Create a test manager user for local development
    const hashedPassword = await bcrypt.hash('password123', 10);
    
    // Try to find existing user first
    let user = await prisma.user.findUnique({
      where: { email: 'test@local.com' }
    });
    
    if (user) {
      // Update existing user
      user = await prisma.user.update({
        where: { email: 'test@local.com' },
        data: {
          password: hashedPassword,
          role: 'MANAGER',
          isActive: true,
          mustChangePassword: false
        }
      });
      console.log('✅ Local test user updated!');
    } else {
      // Create new user
      user = await prisma.user.create({
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
    }
    
    console.log('\n📋 Login Credentials:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Email:    ${user.email}`);
    console.log(`Password: password123`);
    console.log(`Role:     ${user.role}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
  } catch (error) {
    if (error.code === 'P2002') {
      console.log('ℹ️  User already exists, updating...');
      // Try to update instead
      try {
        const updated = await prisma.user.update({
          where: { email: 'test@local.com' },
          data: {
            password: hashedPassword,
            role: 'MANAGER',
            isActive: true,
            mustChangePassword: false
          }
        });
        console.log('✅ User updated successfully!');
        console.log(`Email: ${updated.email}`);
        console.log(`Password: password123`);
      } catch (updateError) {
        console.error('Error updating user:', updateError);
      }
    } else {
      console.error('Error creating user:', error);
    }
  } finally {
    await prisma.$disconnect();
  }
}

setupLocalUser();
