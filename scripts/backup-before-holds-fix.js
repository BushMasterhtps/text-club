#!/usr/bin/env node

/**
 * Backup script specifically for Holds fix deployment
 * Creates a backup of critical data before making changes
 * 
 * Usage: node scripts/backup-before-holds-fix.js
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

// Use Railway's DATABASE_URL (production)
const RAILWAY_DB_URL = 'postgresql://postgres:OUYdvdsKqOUGwpTWTUUniqINJdjqIBdy@interchange.proxy.rlwy.net:43835/railway';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: RAILWAY_DB_URL
    }
  }
});

async function createBackup() {
  try {
    console.log('🔄 Creating backup before Holds fix deployment...\n');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(__dirname, '..', 'backups');
    
    // Create backups directory if it doesn't exist
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const backupFile = path.join(backupDir, `holds-fix-backup-${timestamp}.json`);

    console.log('📊 Backing up critical data...\n');

    // Backup Holds tasks (especially those with "Unable to Resolve")
    const holdsTasks = await prisma.task.findMany({
      where: {
        taskType: 'HOLDS'
      },
      select: {
        id: true,
        status: true,
        disposition: true,
        assignedToId: true,
        endTime: true,
        holdsStatus: true,
        holdsQueueHistory: true,
        createdAt: true,
        updatedAt: true
      }
    });

    console.log(`   ✅ Backed up ${holdsTasks.length} Holds tasks`);

    // Backup users (for reference)
    const users = await prisma.user.findMany({
      where: {
        role: { in: ['AGENT', 'MANAGER_AGENT'] }
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true
      }
    });

    console.log(`   ✅ Backed up ${users.length} users`);

    // Backup tasks with "Unable to Resolve" specifically
    const unableToResolveTasks = holdsTasks.filter(t => 
      t.disposition === 'Unable to Resolve' && 
      t.status === 'COMPLETED' && 
      t.assignedToId === null
    );

    console.log(`   ✅ Found ${unableToResolveTasks.length} unassigned "Unable to Resolve" tasks\n`);

    // Create backup object
    const backup = {
      timestamp: new Date().toISOString(),
      description: 'Backup before Holds "Unable to Resolve" fix deployment',
      summary: {
        totalHoldsTasks: holdsTasks.length,
        unableToResolveUnassigned: unableToResolveTasks.length,
        totalUsers: users.length
      },
      data: {
        holdsTasks,
        users,
        unableToResolveTasks
      }
    };

    // Write backup file
    fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2));

    console.log(`✅ Backup created successfully!`);
    console.log(`   Location: ${backupFile}`);
    console.log(`   Size: ${(fs.statSync(backupFile).size / 1024).toFixed(2)} KB\n`);

    // Also create a quick reference file
    const quickRefFile = path.join(backupDir, `holds-fix-quick-ref-${timestamp}.txt`);
    const quickRef = `
Holds Fix Backup - Quick Reference
==================================
Timestamp: ${backup.timestamp}
Backup File: ${path.basename(backupFile)}

Summary:
- Total Holds Tasks: ${holdsTasks.length}
- Unassigned "Unable to Resolve": ${unableToResolveTasks.length}
- Total Users: ${users.length}

Unassigned "Unable to Resolve" Tasks (for backfill):
${unableToResolveTasks.map((t, idx) => 
  `${idx + 1}. Task ID: ${t.id}, Completed: ${t.endTime?.toISOString() || 'N/A'}, Queue: ${t.holdsStatus || 'N/A'}`
).join('\n')}

Rollback Instructions:
1. If needed, restore from: ${path.basename(backupFile)}
2. Revert Git commit: git revert HEAD
3. Remove migration fields if necessary
    `.trim();

    fs.writeFileSync(quickRefFile, quickRef);
    console.log(`📝 Quick reference created: ${path.basename(quickRefFile)}\n`);

    console.log('🎯 Backup complete! Ready for deployment.\n');

  } catch (error) {
    console.error('❌ Backup failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createBackup();

