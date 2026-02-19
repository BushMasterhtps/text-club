// Interactive query tool for your production database
const { PrismaClient } = require('@prisma/client');
const readline = require('readline');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://postgres:OUYdvdsKqOUGwpTWTUUniqINJdjqIBdy@interchange.proxy.rlwy.net:43835/railway'
    }
  }
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function showMenu() {
  console.log('\n🔍 PRODUCTION DATABASE QUERY TOOL');
  console.log('=====================================');
  console.log('1. View all users');
  console.log('2. View recent tasks (last 20)');
  console.log('3. Search tasks by text content');
  console.log('4. View tasks by status');
  console.log('5. View raw messages');
  console.log('6. View spam rules');
  console.log('7. Custom SQL query');
  console.log('8. Distinct brands (Text Club tasks) — exact spellings + counts');
  console.log('9. Exit');
  console.log('');
}

async function handleChoice(choice) {
  switch(choice.trim()) {
    case '1':
      const users = await prisma.user.findMany({
        select: { id: true, email: true, name: true, role: true, isLive: true, lastSeen: true }
      });
      console.log('\n👥 USERS:');
      users.forEach(user => {
        console.log(`  ${user.email} | ${user.name || 'No name'} | ${user.role} | ${user.isLive ? 'Live' : 'Inactive'}`);
      });
      break;
      
    case '2':
      const recentTasks = await prisma.task.findMany({
        take: 20,
        orderBy: { createdAt: 'desc' },
        select: { id: true, taskType: true, status: true, phone: true, email: true, text: true, createdAt: true }
      });
      console.log('\n📋 RECENT TASKS:');
      recentTasks.forEach(task => {
        const preview = task.text ? task.text.substring(0, 60) + '...' : 'No text';
        const date = new Date(task.createdAt).toLocaleString();
        console.log(`  ${task.id} | ${task.taskType} | ${task.status} | ${preview} | ${date}`);
      });
      break;
      
    case '3':
      rl.question('Enter search term: ', async (searchTerm) => {
        const tasks = await prisma.task.findMany({
          where: {
            text: { contains: searchTerm, mode: 'insensitive' }
          },
          take: 10,
          select: { id: true, taskType: true, status: true, text: true, createdAt: true }
        });
        console.log(`\n🔍 SEARCH RESULTS for "${searchTerm}":`);
        tasks.forEach(task => {
          const preview = task.text ? task.text.substring(0, 80) + '...' : 'No text';
          console.log(`  ${task.id} | ${task.taskType} | ${task.status} | ${preview}`);
        });
        askNext();
      });
      return;
      
    case '4':
      const statusCounts = await prisma.task.groupBy({
        by: ['status'],
        _count: { status: true }
      });
      console.log('\n📊 TASKS BY STATUS:');
      statusCounts.forEach(group => {
        console.log(`  ${group.status}: ${group._count.status}`);
      });
      break;
      
    case '5':
      const rawMessages = await prisma.rawMessage.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: { id: true, phone: true, email: true, text: true, status: true, createdAt: true }
      });
      console.log('\n📨 RAW MESSAGES (last 10):');
      rawMessages.forEach(msg => {
        const preview = msg.text ? msg.text.substring(0, 60) + '...' : 'No text';
        console.log(`  ${msg.id} | ${msg.status} | ${preview}`);
      });
      break;
      
    case '6':
      const spamRules = await prisma.spamRule.findMany({
        take: 10,
        select: { id: true, pattern: true, brand: true, enabled: true, createdAt: true }
      });
      console.log('\n🛡️ SPAM RULES (first 10):');
      spamRules.forEach(rule => {
        console.log(`  ${rule.id} | ${rule.pattern} | ${rule.brand || 'All brands'} | ${rule.enabled ? 'Enabled' : 'Disabled'}`);
      });
      break;
      
    case '7':
      rl.question('Enter SQL query: ', async (query) => {
        try {
          const result = await prisma.$queryRawUnsafe(query);
          console.log('\n📊 QUERY RESULT:');
          console.log(JSON.stringify(result, null, 2));
        } catch (error) {
          console.log('❌ Query error:', error.message);
        }
        askNext();
      });
      return;

    case '8':
      const brandGroups = await prisma.task.groupBy({
        by: ['brand'],
        where: { taskType: 'TEXT_CLUB', brand: { not: null } },
        _count: { id: true }
      });
      brandGroups.sort((a, b) => (b._count?.id ?? 0) - (a._count?.id ?? 0));
      console.log('\n🏷️ DISTINCT BRANDS (Text Club tasks) — use these spellings in src/lib/brand-normalize.ts');
      brandGroups.forEach((g) => {
        console.log(`  "${g.brand}"  →  ${g._count.id} tasks`);
      });
      if (brandGroups.length === 0) {
        console.log('  (none)');
      }
      break;

    case '9':
      console.log('👋 Goodbye!');
      await prisma.$disconnect();
      process.exit(0);
      break;

    default:
      console.log('❌ Invalid choice. Please try again.');
  }
  askNext();
}

function askNext() {
  rl.question('\nPress Enter to continue...', () => {
    showMenu();
    rl.question('Choose an option (1-9): ', handleChoice);
  });
}

async function main() {
  try {
    await prisma.$connect();
    console.log('✅ Connected to production database!');
    showMenu();
    rl.question('Choose an option (1-9): ', handleChoice);
  } catch (error) {
    console.error('❌ Connection error:', error.message);
    process.exit(1);
  }
}

main();

