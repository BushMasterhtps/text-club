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
  console.log('9. WOD/IVCS order prefixes (first 2 letters of order #) — for GM=GundryMD index');
  console.log('10. Exit');
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

    case '9': {
      const prefixCounts = {};
      const tasks = await prisma.task.findMany({
        where: { taskType: 'WOD_IVCS' },
        select: { documentNumber: true, webOrder: true }
      });
      for (const t of tasks) {
        const raw = (t.documentNumber || t.webOrder || '').trim().toUpperCase();
        const prefix = raw.length >= 2 ? raw.slice(0, 2) : (raw || '??');
        prefixCounts[prefix] = (prefixCounts[prefix] || 0) + 1;
      }
      const sorted = Object.entries(prefixCounts).sort((a, b) => b[1] - a[1]);
      console.log('\n📦 WOD/IVCS ORDER PREFIXES (first 2 letters of documentNumber/webOrder)');
      console.log('Send these initials back in format: GM = GundryMD, CB = City Beauty, etc.\n');
      sorted.forEach(([prefix, count]) => console.log(`  ${prefix}  →  ${count} orders`));
      if (sorted.length === 0) console.log('  (none)');
      break;
    }

    case '10':
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
    rl.question('Choose an option (1-10): ', handleChoice);
  });
}

async function runWodPrefixesOnly() {
  await prisma.$connect();
  const prefixCounts = {};
  const tasks = await prisma.task.findMany({
    where: { taskType: 'WOD_IVCS' },
    select: { documentNumber: true, webOrder: true }
  });
  for (const t of tasks) {
    const raw = (t.documentNumber || t.webOrder || '').trim().toUpperCase();
    const prefix = raw.length >= 2 ? raw.slice(0, 2) : (raw || '??');
    prefixCounts[prefix] = (prefixCounts[prefix] || 0) + 1;
  }
  const sorted = Object.entries(prefixCounts).sort((a, b) => b[1] - a[1]);
  console.log('WOD/IVCS ORDER PREFIXES (first 2 letters of order number)');
  console.log('Reply with: GM = GundryMD, CB = City Beauty, etc.\n');
  sorted.forEach(([prefix, count]) => console.log(`${prefix}\t${count}`));
  await prisma.$disconnect();
}

/** List sample order numbers (documentNumber/webOrder) that start with a given prefix, e.g. --wod-sample-prefix=OR */
async function runWodSamplePrefix(prefix) {
  const p = (prefix || '').trim().toUpperCase().slice(0, 2);
  if (!p) {
    console.error('Usage: node query-production-data.js --wod-sample-prefix=OR');
    process.exit(1);
  }
  await prisma.$connect();
  const tasks = await prisma.task.findMany({
    where: {
      taskType: 'WOD_IVCS',
      OR: [
        { documentNumber: { startsWith: p, mode: 'insensitive' } },
        { webOrder: { startsWith: p, mode: 'insensitive' } }
      ]
    },
    select: { documentNumber: true, webOrder: true, brand: true },
    take: 100
  });
  const seen = new Set();
  console.log(`\nSample order numbers starting with "${p}" (up to 100 unique, with brand when set):\n`);
  for (const t of tasks) {
    const doc = (t.documentNumber || '').trim();
    const web = (t.webOrder || '').trim();
    const key = doc || web || '';
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const brand = (t.brand || '').trim() || '—';
    console.log(`${key}\tBrand: ${brand}`);
  }
  const total = await prisma.task.count({
    where: {
      taskType: 'WOD_IVCS',
      OR: [
        { documentNumber: { startsWith: p, mode: 'insensitive' } },
        { webOrder: { startsWith: p, mode: 'insensitive' } }
      ]
    }
  });
  console.log(`\n(Total tasks with prefix "${p}": ${total})`);
  await prisma.$disconnect();
}

async function main() {
  try {
    if (process.argv[2] === '--wod-prefixes') {
      await runWodPrefixesOnly();
      process.exit(0);
    }
    const samplePrefix = process.argv[2] && process.argv[2].startsWith('--wod-sample-prefix=');
    if (samplePrefix) {
      const prefix = process.argv[2].split('=')[1] || '';
      await runWodSamplePrefix(prefix);
      process.exit(0);
    }
    await prisma.$connect();
    console.log('✅ Connected to production database!');
    showMenu();
    rl.question('Choose an option (1-10): ', handleChoice);
  } catch (error) {
    console.error('❌ Connection error:', error.message);
    process.exit(1);
  }
}

main();

