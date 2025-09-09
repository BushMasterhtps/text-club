#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkUsers() {
  try {
    console.log('🔍 Checking All Users...\n');
    
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        isLive: true
      },
      orderBy: {
        name: 'asc'
      }
    });
    
    console.log(`📊 Total Users: ${users.length}\n`);
    
    users.forEach((user, index) => {
      console.log(`${index + 1}. ${user.name || 'No name'} (${user.email})`);
      console.log(`   Role: ${user.role}, Active: ${user.isActive}, Live: ${user.isLive}`);
    });
    
    // Check for users with "Danielle" in name or email
    const danielleUsers = users.filter(user => 
      (user.name && user.name.toLowerCase().includes('danielle')) ||
      user.email.toLowerCase().includes('danielle')
    );
    
    if (danielleUsers.length > 0) {
      console.log('\n🎯 Users matching "Danielle":');
      danielleUsers.forEach(user => {
        console.log(`  - ${user.name} (${user.email})`);
      });
    } else {
      console.log('\n❌ No users found matching "Danielle"');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkUsers();
