#!/usr/bin/env node

const { requireEnv } = require('./lib/require-env');
requireEnv('DATABASE_URL');

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function backupData() {
  try {
    console.log('🔄 Starting Railway data backup...');
    
    const backup = {
      timestamp: new Date().toISOString(),
      users: [],
      tasks: [],
      importSessions: [],
      rawMessages: [],
      spamRules: [],
      blockedNumbers: []
    };

    // Backup Users
    console.log('📋 Backing up users...');
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true
      }
    });
    backup.users = users;
    console.log(`✅ Backed up ${users.length} users`);

    // Backup Tasks (Text Club only - completed work)
    console.log('📋 Backing up Text Club tasks...');
    const tasks = await prisma.task.findMany({
      where: {
        taskType: 'TEXT_CLUB',
        status: 'COMPLETED'
      },
      select: {
        id: true,
        brand: true,
        phone: true,
        text: true,
        taskType: true,
        status: true,
        assignedToId: true,
        startTime: true,
        endTime: true,
        completionTime: true,
        salesforceCaseNumber: true,
        createdAt: true,
        updatedAt: true
      }
    });
    backup.tasks = tasks;
    console.log(`✅ Backed up ${tasks.length} completed Text Club tasks`);

    // Backup Import Sessions
    console.log('📋 Backing up import sessions...');
    const importSessions = await prisma.importSession.findMany({
      select: {
        id: true,
        source: true,
        fileName: true,
        importedAt: true,
        importedBy: true,
        totalRows: true,
        imported: true,
        duplicates: true,
        filtered: true,
        errors: true,
        createdAt: true,
        updatedAt: true
      }
    });
    backup.importSessions = importSessions;
    console.log(`✅ Backed up ${importSessions.length} import sessions`);

    // Backup Raw Messages
    console.log('📋 Backing up raw messages...');
    const rawMessages = await prisma.rawMessage.findMany({
      select: {
        id: true,
        brand: true,
        phone: true,
        text: true,
        receivedAt: true,
        createdAt: true
      }
    });
    backup.rawMessages = rawMessages;
    console.log(`✅ Backed up ${rawMessages.length} raw messages`);

    // Backup Spam Rules
    console.log('📋 Backing up spam rules...');
    const spamRules = await prisma.spamRule.findMany({
      select: {
        id: true,
        pattern: true,
        patternNorm: true,
        mode: true,
        brand: true,
        enabled: true,
        note: true,
        createdAt: true,
        updatedAt: true
      }
    });
    backup.spamRules = spamRules;
    console.log(`✅ Backed up ${spamRules.length} spam rules`);

    // Note: No blocked numbers model exists
    backup.blockedNumbers = [];
    console.log('✅ No blocked numbers to backup (model does not exist)');

    // Save backup to file
    const backupDir = path.join(__dirname, '..', 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(backupDir, `railway-backup-${timestamp}.json`);
    
    fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2));
    
    console.log(`🎉 Backup completed successfully!`);
    console.log(`📁 Backup saved to: ${backupFile}`);
    console.log(`📊 Summary:`);
    console.log(`   - Users: ${backup.users.length}`);
    console.log(`   - Completed Text Club Tasks: ${backup.tasks.length}`);
    console.log(`   - Import Sessions: ${backup.importSessions.length}`);
    console.log(`   - Raw Messages: ${backup.rawMessages.length}`);
    console.log(`   - Spam Rules: ${backup.spamRules.length}`);
    console.log(`   - Blocked Numbers: ${backup.blockedNumbers.length}`);

  } catch (error) {
    console.error('❌ Backup failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

backupData();
