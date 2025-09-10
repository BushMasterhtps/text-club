const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function debugAllUsers() {
  try {
    console.log('🔍 Debugging all users in database...\n');

    // Get all users
    const users = await prisma.user.findMany({
      select: { 
        id: true, 
        name: true, 
        email: true, 
        role: true,
        createdAt: true
      },
      orderBy: { createdAt: 'asc' }
    });

    console.log(`📊 Total users in database: ${users.length}\n`);

    if (users.length > 0) {
      console.log('👥 All users:');
      users.forEach((user, index) => {
        console.log(`${index + 1}. Name: ${user.name || 'N/A'}`);
        console.log(`   Email: ${user.email}`);
        console.log(`   Role: ${user.role}`);
        console.log(`   ID: ${user.id}`);
        console.log(`   Created: ${user.createdAt.toISOString()}`);
        console.log('');
      });
    }

    // Check for any users with "Lupe" or "Alvarenga" in their name
    const lupeUsers = await prisma.user.findMany({
      where: {
        OR: [
          { name: { contains: 'Lupe' } },
          { name: { contains: 'Alvarenga' } },
          { email: { contains: 'lupe' } },
          { email: { contains: 'alvarenga' } }
        ]
      },
      select: { id: true, name: true, email: true, role: true }
    });

    console.log(`🔍 Users matching "Lupe" or "Alvarenga": ${lupeUsers.length}`);
    if (lupeUsers.length > 0) {
      lupeUsers.forEach((user, index) => {
        console.log(`${index + 1}. Name: ${user.name || 'N/A'}`);
        console.log(`   Email: ${user.email}`);
        console.log(`   Role: ${user.role}`);
        console.log(`   ID: ${user.id}`);
        console.log('');
      });
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

debugAllUsers();
