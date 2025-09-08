#!/usr/bin/env node

// Force Prisma client generation
const { execSync } = require('child_process');

console.log('🔄 Forcing Prisma client generation...');

try {
  // Remove old Prisma client
  execSync('rm -rf node_modules/.prisma', { stdio: 'inherit' });
  console.log('✅ Removed old Prisma client');
  
  // Generate new Prisma client
  execSync('npx prisma generate', { stdio: 'inherit' });
  console.log('✅ Generated new Prisma client');
  
  console.log('🎉 Prisma client generation completed successfully!');
} catch (error) {
  console.error('❌ Failed to generate Prisma client:', error.message);
  process.exit(1);
}
