const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

async function restorePassword() {
  const prisma = new PrismaClient();
  
  try {
    // Restore password for Daniel Murcia
    const email = 'daniel.murcia@goldenboltllc.com';
    const tempPassword = 'TempPassword123!'; // Temporary password for you to change
    
    const hashedPassword = await bcrypt.hash(tempPassword, 10);
    
    const updatedUser = await prisma.user.update({
      where: { email: email },
      data: { 
        password: hashedPassword,
        mustChangePassword: true // Force password change on next login
      }
    });
    
    console.log('✅ Password restored!');
    console.log(`Email: ${email}`);
    console.log(`Temporary Password: ${tempPassword}`);
    console.log('⚠️  You MUST change this password immediately after logging in!');
    
  } catch (error) {
    console.error('Error restoring password:', error);
  } finally {
    await prisma.$disconnect();
  }
}

restorePassword();
