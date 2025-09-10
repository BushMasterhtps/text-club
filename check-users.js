const { PrismaClient } = require('@prisma/client');

async function checkUsers() {
  const prisma = new PrismaClient();
  
  try {
    const users = await prisma.user.findMany({
      select: {
        email: true,
        name: true,
        role: true,
        isActive: true
      }
    });
    
    console.log('Users in local database:');
    console.log('=======================');
    
    if (users.length === 0) {
      console.log('❌ No users found in local database');
      console.log('This explains why your login credentials are not working.');
    } else {
      users.forEach((user, index) => {
        console.log(`${index + 1}. Email: ${user.email}`);
        console.log(`   Name: ${user.name || 'N/A'}`);
        console.log(`   Role: ${user.role}`);
        console.log(`   Active: ${user.isActive}`);
        console.log('---');
      });
    }
  } catch (error) {
    console.error('Error checking users:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkUsers();
