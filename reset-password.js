const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

async function resetPassword() {
  const prisma = new PrismaClient();
  
  try {
    // Reset password for Daniel Murcia (manager account)
    const email = 'daniel.murcia@goldenboltllc.com';
    const newPassword = 'password123'; // Simple password for testing
    
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    const updatedUser = await prisma.user.update({
      where: { email: email },
      data: { 
        password: hashedPassword,
        mustChangePassword: false // Allow login without forced password change
      }
    });
    
    console.log('✅ Password reset successfully!');
    console.log(`Email: ${email}`);
    console.log(`New Password: ${newPassword}`);
    console.log('You can now use these credentials to login locally.');
    
  } catch (error) {
    console.error('Error resetting password:', error);
  } finally {
    await prisma.$disconnect();
  }
}

resetPassword();
