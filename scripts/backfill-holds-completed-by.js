#!/usr/bin/env node

/**
 * Backfill script for Holds "Unable to Resolve" tasks
 * Sets completedBy for historical tasks that were completed but are now unassigned
 * 
 * This script identifies tasks completed since 11/17/2025 with "Unable to Resolve" 
 * disposition that are unassigned, and attempts to identify who completed them.
 * 
 * Usage: node scripts/backfill-holds-completed-by.js [--dry-run] [--auto-assign]
 * 
 * Options:
 *   --dry-run: Show what would be updated without making changes
 *   --auto-assign: Automatically assign based on heuristics (use with caution)
 */

const { PrismaClient } = require('@prisma/client');

// Use Railway's DATABASE_URL (production)
const RAILWAY_DB_URL = 'postgresql://postgres:OUYdvdsKqOUGwpTWTUUniqINJdjqIBdy@interchange.proxy.rlwy.net:43835/railway';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: RAILWAY_DB_URL
    }
  }
});

// Holds started on 11/17/2025
const HOLDS_START_DATE = new Date('2025-11-17T00:00:00.000Z');

// Unassigning dispositions that should have completedBy set
const UNASSIGNING_DISPOSITIONS = [
  'Unable to Resolve',
  'In Communication',
  'International Order - Unable to Call/ Sent Email',
  'International Order - Unable to Call / Sent Email',
  'Duplicate'
];

async function backfillCompletedBy() {
  try {
    const args = process.argv.slice(2);
    const isDryRun = args.includes('--dry-run');
    const autoAssign = args.includes('--auto-assign');

    console.log('🔄 Starting Holds completedBy backfill...\n');
    console.log(`Mode: ${isDryRun ? 'DRY RUN (no changes will be made)' : autoAssign ? 'AUTO-ASSIGN (will make changes)' : 'REVIEW MODE (shows tasks for review)'}\n`);

    // Find all Holds tasks that:
    // 1. Are COMPLETED
    // 2. Have unassigning disposition
    // 3. Are unassigned (assignedToId = null)
    // 4. Don't have completedBy set yet
    // 5. Were completed since 11/17/2025
    const tasksToBackfill = await prisma.task.findMany({
      where: {
        taskType: 'HOLDS',
        status: 'COMPLETED',
        assignedToId: null,
        completedBy: null,
        disposition: { in: UNASSIGNING_DISPOSITIONS },
        endTime: { gte: HOLDS_START_DATE }
      },
      select: {
        id: true,
        disposition: true,
        endTime: true,
        holdsStatus: true,
        holdsQueueHistory: true,
        createdAt: true
      },
      orderBy: {
        endTime: 'asc'
      }
    });

    console.log(`📊 Found ${tasksToBackfill.length} tasks that need completedBy backfill\n`);

    if (tasksToBackfill.length === 0) {
      console.log('✅ No tasks need backfilling!\n');
      return;
    }

    // Get all agents for reference
    const agents = await prisma.user.findMany({
      where: {
        role: { in: ['AGENT', 'MANAGER_AGENT'] }
      },
      select: {
        id: true,
        email: true,
        name: true
      }
    });

    console.log(`👥 Found ${agents.length} agents for reference\n`);

    // Process each task
    const results = {
      updated: 0,
      skipped: 0,
      errors: 0,
      details: [] as any[]
    };

    for (const task of tasksToBackfill) {
      let suggestedAgentId = null;
      let confidence = 'low';
      let reason = '';

      // Try to identify agent using heuristics
      // 1. Check queue history for agent mentions
      if (task.holdsQueueHistory && Array.isArray(task.holdsQueueHistory)) {
        const history = task.holdsQueueHistory;
        const lastEntry = history[history.length - 1];
        
        if (lastEntry && typeof lastEntry === 'object' && lastEntry.movedBy) {
          const movedBy = lastEntry.movedBy;
          
          // Try to find agent by email in movedBy
          for (const agent of agents) {
            if (movedBy.toLowerCase().includes(agent.email.toLowerCase()) ||
                movedBy.toLowerCase().includes(agent.name?.toLowerCase() || '')) {
              suggestedAgentId = agent.id;
              confidence = 'medium';
              reason = `Found in queue history: ${movedBy}`;
              break;
            }
          }
        }
      }

      // 2. If no match, try time-based heuristics (who was working around that time)
      // This is less reliable, so we'll mark it as low confidence
      if (!suggestedAgentId && task.endTime) {
        // For now, we'll leave this as null and require manual review
        reason = 'Could not identify agent - needs manual review';
      }

      const result = {
        taskId: task.id,
        disposition: task.disposition,
        completedAt: task.endTime?.toISOString() || 'N/A',
        currentQueue: task.holdsStatus || 'N/A',
        suggestedAgentId,
        suggestedAgentName: suggestedAgentId 
          ? agents.find(a => a.id === suggestedAgentId)?.name || 'Unknown'
          : null,
        confidence,
        reason
      };

      results.details.push(result);

      // If auto-assign and we have a suggestion, update it
      if (autoAssign && suggestedAgentId && confidence !== 'low') {
        if (!isDryRun) {
          try {
            await prisma.task.update({
              where: { id: task.id },
              data: {
                completedBy: suggestedAgentId,
                completedAt: task.endTime || new Date()
              }
            });
            results.updated++;
            console.log(`✅ Updated task ${task.id} - assigned to ${result.suggestedAgentName} (${confidence} confidence)`);
          } catch (error) {
            console.error(`❌ Error updating task ${task.id}:`, error);
            results.errors++;
          }
        } else {
          console.log(`[DRY RUN] Would update task ${task.id} - assign to ${result.suggestedAgentName} (${confidence} confidence)`);
          results.updated++;
        }
      } else {
        results.skipped++;
      }
    }

    // Display summary
    console.log('\n📊 Backfill Summary:\n');
    console.log(`Total tasks found: ${tasksToBackfill.length}`);
    console.log(`Updated: ${results.updated}`);
    console.log(`Skipped (needs review): ${results.skipped}`);
    console.log(`Errors: ${results.errors}\n`);

    // Show tasks that need manual review
    const needsReview = results.details.filter(r => !r.suggestedAgentId || r.confidence === 'low');
    if (needsReview.length > 0) {
      console.log(`⚠️  ${needsReview.length} tasks need manual review:\n`);
      needsReview.forEach((task, idx) => {
        console.log(`${idx + 1}. Task ID: ${task.taskId}`);
        console.log(`   Disposition: ${task.disposition}`);
        console.log(`   Completed: ${task.completedAt}`);
        console.log(`   Queue: ${task.currentQueue}`);
        console.log(`   Reason: ${task.reason}`);
        console.log('');
      });
    }

    // Show tasks that were auto-assigned
    const autoAssigned = results.details.filter(r => r.suggestedAgentId && r.confidence !== 'low');
    if (autoAssigned.length > 0 && (autoAssign || isDryRun)) {
      console.log(`✅ ${autoAssigned.length} tasks can be auto-assigned:\n`);
      autoAssigned.forEach((task, idx) => {
        console.log(`${idx + 1}. Task ID: ${task.taskId}`);
        console.log(`   Suggested Agent: ${task.suggestedAgentName} (${task.confidence} confidence)`);
        console.log(`   Reason: ${task.reason}`);
        console.log('');
      });
    }

    // Create a review file for manual assignment
    if (!autoAssign && !isDryRun) {
      const fs = require('fs');
      const path = require('path');
      const reviewFile = path.join(__dirname, '..', 'backups', `holds-backfill-review-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
      const reviewDir = path.dirname(reviewFile);
      if (!fs.existsSync(reviewDir)) {
        fs.mkdirSync(reviewDir, { recursive: true });
      }
      fs.writeFileSync(reviewFile, JSON.stringify({
        timestamp: new Date().toISOString(),
        tasks: results.details,
        agents: agents.map(a => ({ id: a.id, name: a.name, email: a.email }))
      }, null, 2));
      console.log(`\n📝 Review file created: ${path.basename(reviewFile)}`);
      console.log(`   You can manually assign completedBy by updating the tasks in the database.\n`);
    }

    console.log('\n🎯 Next Steps:');
    if (isDryRun) {
      console.log('   1. Review the output above');
      console.log('   2. Run without --dry-run to make changes');
    } else if (autoAssign) {
      console.log('   1. Verify the auto-assigned tasks are correct');
      console.log('   2. Manually review and fix any incorrect assignments');
    } else {
      console.log('   1. Review the tasks that need manual assignment');
      console.log('   2. Use the review file to manually assign completedBy');
      console.log('   3. Or run with --auto-assign to auto-assign high-confidence matches');
    }

  } catch (error) {
    console.error('❌ Backfill failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

backfillCompletedBy();

