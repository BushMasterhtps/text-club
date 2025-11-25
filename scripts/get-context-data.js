// Script to gather data for presentation CONTEXT slide
// Connect to Railway PostgreSQL database directly

const { PrismaClient } = require('@prisma/client');

// Use Railway DATABASE_URL directly from codebase
const RAILWAY_DB_URL = 'postgresql://postgres:OUYdvdsKqOUGwpTWTUUniqINJdjqIBdy@interchange.proxy.rlwy.net:43835/railway';

console.log('\n📡 Connecting to Railway Database...');
console.log('   Host: interchange.proxy.rlwy.net');
console.log('   Port: 43835');
console.log('   Database: railway');
console.log('   ✓ Using Railway production database\n');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: RAILWAY_DB_URL
    }
  }
});

async function getContextData() {
  try {
    // Test connection first
    await prisma.$connect();
    console.log('✓ Successfully connected to Railway database\n');
    
    // 1. Get total number of agents/managers
    const totalUsers = await prisma.user.count({
      where: {
        role: { in: ['AGENT', 'MANAGER', 'MANAGER_AGENT'] }
      }
    });
    
    const agents = await prisma.user.count({
      where: {
        role: { in: ['AGENT', 'MANAGER_AGENT'] }
      }
    });
    
    const managers = await prisma.user.count({
      where: {
        role: { in: ['MANAGER', 'MANAGER_AGENT'] }
      }
    });
    
    // 2. Get first task/completed work date (when system went live)
    const firstTask = await prisma.task.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true }
    });
    
    const firstCompleted = await prisma.task.findFirst({
      where: { status: 'COMPLETED' },
      orderBy: { endTime: 'asc' },
      select: { endTime: true }
    });
    
    // 3. Get total tasks processed (shows scale)
    const totalTasks = await prisma.task.count();
    const completedTasks = await prisma.task.count({
      where: { status: 'COMPLETED' }
    });
    
    // 4. Calculate system age
    const now = new Date();
    const systemStartDate = firstTask?.createdAt || firstCompleted?.endTime || now;
    const daysSinceLaunch = Math.floor((now - new Date(systemStartDate)) / (1000 * 60 * 60 * 24));
    const weeksSinceLaunch = Math.floor(daysSinceLaunch / 7);
    
    console.log('\n=== CONTEXT DATA FOR PRESENTATION ===\n');
    console.log('PEOPLE AFFECTED:');
    console.log(`  • Total Users: ${totalUsers}`);
    console.log(`  • Agents: ${agents}`);
    console.log(`  • Managers: ${managers}`);
    console.log('\nSYSTEM SCALE:');
    console.log(`  • Total Tasks Processed: ${totalTasks.toLocaleString()}`);
    console.log(`  • Completed Tasks: ${completedTasks.toLocaleString()}`);
    console.log(`  • System Launch: ${systemStartDate ? systemStartDate.toLocaleDateString() : 'Unknown'}`);
    console.log(`  • Days Since Launch: ${daysSinceLaunch}`);
    console.log(`  • Weeks Since Launch: ${weeksSinceLaunch}`);
    console.log('\nESTIMATED IMPACT (based on system data):');
    console.log(`  • ${agents} agents now have unified dashboard`);
    console.log(`  • ${managers} managers can track performance in real-time`);
    console.log(`  • ${totalTasks.toLocaleString()} tasks processed through unified system`);
    
    console.log('\n=== ESTIMATION GUIDE ===');
    console.log('\nTo estimate "hours/week on manual analytics":');
    console.log('  • Interview 1-2 managers: "Before this system, how many hours');
    console.log('    per week did you spend creating reports or analyzing data?"');
    console.log('  • Example estimate: 5-10 hours/week × number of managers');
    console.log('\nTo estimate "cost of data fragmentation":');
    console.log('  • Time switching between systems: ~30 min/day × agents');
    console.log('  • Duplicate data entry: ~15 min/day × agents');
    console.log('  • Errors from manual transfer: ~1 hour/week fixing issues');
    console.log('\nYou already have:');
    console.log(`  ✅ ${agents} agents affected`);
    console.log(`  ✅ ${managers} managers affected`);
    console.log(`  ✅ ${totalTasks.toLocaleString()} tasks showing system adoption`);
    
  } catch (error) {
    console.error('\n❌ Error gathering context data:', error.message);
    if (error.code === 'P1001') {
      console.error('   Database connection failed. Check Railway DATABASE_URL.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

getContextData();
