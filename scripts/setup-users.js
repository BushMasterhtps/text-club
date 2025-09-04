const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function setupUsers() {
  try {
    console.log('Setting up users...');

    // Create or update manager user
    const managerPassword = await bcrypt.hash('manager123', 10);
               const manager = await prisma.user.upsert({
             where: { email: 'manager@goldenboltllc.com' },
             update: {
               password: managerPassword,
               role: 'MANAGER',
               isActive: true,
               name: 'Manager',
               mustChangePassword: true
             },
             create: {
               email: 'manager@goldenboltllc.com',
               password: managerPassword,
               role: 'MANAGER',
               isActive: true,
               name: 'Manager',
               mustChangePassword: true
             }
           });

    // Create or update Daniel's user with Manager+Agent role
    const danielPassword = await bcrypt.hash('Simple123', 10);
               const daniel = await prisma.user.upsert({
             where: { email: 'daniel.murcia@goldenboltllc.com' },
             update: {
               password: danielPassword,
               role: 'MANAGER_AGENT',
               isActive: true,
               name: 'Daniel Murcia',
               mustChangePassword: true
             },
             create: {
               email: 'daniel.murcia@goldenboltllc.com',
               password: danielPassword,
               role: 'MANAGER_AGENT',
               isActive: true,
               name: 'Daniel Murcia',
               mustChangePassword: true
             }
           });

    // Create or update test agent
    const testAgentPassword = await bcrypt.hash('test123', 10);
               const testAgent = await prisma.user.upsert({
             where: { email: 'tester@goldenboltllc.com' },
             update: {
               password: testAgentPassword,
               role: 'AGENT',
               isActive: true,
               name: 'Test Agent',
               mustChangePassword: true
             },
             create: {
               email: 'tester@goldenboltllc.com',
               password: testAgentPassword,
               role: 'AGENT',
               isActive: true,
               name: 'Test Agent',
               mustChangePassword: true
             }
           });

           // Create a test user with both roles
           const dualRolePassword = await bcrypt.hash('dual123', 10);
           const dualRoleUser = await prisma.user.upsert({
             where: { email: 'dual@goldenboltllc.com' },
             update: {
               password: dualRolePassword,
               role: 'MANAGER_AGENT',
               isActive: true,
               name: 'Dual Role User',
               mustChangePassword: true
             },
             create: {
               email: 'dual@goldenboltllc.com',
               password: dualRolePassword,
               role: 'MANAGER_AGENT',
               isActive: true,
               name: 'Dual Role User',
               mustChangePassword: true
             }
           });

               console.log('Users created successfully!');
           console.log('Manager:', manager.email, '- Password: manager123');
           console.log('Daniel (Manager+Agent):', daniel.email, '- Password: Simple123');
           console.log('Test Agent:', testAgent.email, '- Password: test123');
           console.log('Dual Role User:', dualRoleUser.email, '- Password: dual123');
           console.log('\n⚠️  IMPORTANT: Change these passwords after first login!');

  } catch (error) {
    console.error('Error setting up users:', error);
  } finally {
    await prisma.$disconnect();
  }
}

setupUsers();
