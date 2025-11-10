// Script to update Railway database with new OneOnOneNote table
// Run this with: node update-railway-schema.js

const { execSync } = require('child_process');

console.log('🚀 Updating Railway database schema...');
console.log('📋 This will add the OneOnOneNote table to your production database');
console.log('');

try {
  // Push the Prisma schema to Railway database
  console.log('Pushing schema changes to Railway...');
  execSync('npx prisma db push', { 
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL }
  });
  
  console.log('');
  console.log('✅ Success! Railway database updated with OneOnOneNote table');
  console.log('✅ You can now redeploy on Netlify');
  
} catch (error) {
  console.error('❌ Error updating database:', error.message);
  console.error('');
  console.error('Make sure your DATABASE_URL environment variable is set to your Railway database');
  process.exit(1);
}

