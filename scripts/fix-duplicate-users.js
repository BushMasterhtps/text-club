const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function fixDuplicateUsers() {
  try {
    console.log('🔍 Checking for duplicate users...');

    // Get all users
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        isLive: true,
        lastSeen: true,
        createdAt: true,
        updatedAt: true
      }
    });

    console.log(`Found ${users.length} total users`);

    // Group users by normalized email
    const emailGroups = {};
    users.forEach(user => {
      const normalizedEmail = user.email.toLowerCase();
      if (!emailGroups[normalizedEmail]) {
        emailGroups[normalizedEmail] = [];
      }
      emailGroups[normalizedEmail].push(user);
    });

    // Find duplicates
    const duplicates = Object.entries(emailGroups).filter(([email, users]) => users.length > 1);
    
    if (duplicates.length === 0) {
      console.log('✅ No duplicate users found');
      return;
    }

    console.log(`🔍 Found ${duplicates.length} duplicate email groups:`);
    duplicates.forEach(([email, users]) => {
      console.log(`  ${email}: ${users.length} accounts`);
      users.forEach(user => {
        console.log(`    - ${user.id}: ${user.email} (${user.isLive ? 'Live' : 'Inactive'}) - Created: ${user.createdAt}`);
      });
    });

    // Fix each duplicate group
    for (const [normalizedEmail, userGroup] of duplicates) {
      console.log(`\n🔧 Fixing duplicates for ${normalizedEmail}...`);
      
      // Sort by creation date (keep the oldest) and live status (prefer live)
      const sortedUsers = userGroup.sort((a, b) => {
        // First, prefer live users
        if (a.isLive && !b.isLive) return -1;
        if (!a.isLive && b.isLive) return 1;
        
        // Then, prefer older accounts
        return new Date(a.createdAt) - new Date(b.createdAt);
      });

      const keepUser = sortedUsers[0];
      const deleteUsers = sortedUsers.slice(1);

      console.log(`  ✅ Keeping: ${keepUser.email} (${keepUser.id})`);
      console.log(`  🗑️  Deleting: ${deleteUsers.map(u => u.email).join(', ')}`);

      // Update tasks assigned to deleted users to point to the kept user
      for (const deleteUser of deleteUsers) {
        console.log(`  🔄 Reassigning tasks from ${deleteUser.email} to ${keepUser.email}...`);
        
        const taskUpdateResult = await prisma.task.updateMany({
          where: { assignedToId: deleteUser.id },
          data: { assignedToId: keepUser.id }
        });
        
        console.log(`    - Updated ${taskUpdateResult.count} tasks`);

        // Delete the duplicate user
        await prisma.user.delete({
          where: { id: deleteUser.id }
        });
        
        console.log(`    - Deleted user ${deleteUser.email}`);
      }

      // Normalize the kept user's email to lowercase
      await prisma.user.update({
        where: { id: keepUser.id },
        data: { email: normalizedEmail }
      });
      
      console.log(`  ✅ Normalized email to: ${normalizedEmail}`);
    }

    console.log('\n✅ Duplicate user cleanup completed!');
    
    // Verify the fix
    const finalUsers = await prisma.user.findMany({
      select: { id: true, email: true, name: true, isLive: true }
    });
    
    console.log('\n📊 Final user count:', finalUsers.length);
    console.log('Users:');
    finalUsers.forEach(user => {
      console.log(`  - ${user.email} (${user.isLive ? 'Live' : 'Inactive'})`);
    });

  } catch (error) {
    console.error('❌ Error fixing duplicate users:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixDuplicateUsers();
