/**
 * Recalculate All Sprint Rankings with New Yotpo Disposition-Based Points
 * 
 * This script:
 * 1. Recalculates all Yotpo task weights based on dispositions
 * 2. Recalculates all sprint rankings with new weighted points
 * 3. Updates SprintRanking table with corrected data
 * 4. Ensures hybrid 30/70 calculations are correct
 */

const { PrismaClient } = require('@prisma/client');

// Connect to Railway PostgreSQL database directly
const RAILWAY_DB_URL = 'postgresql://postgres:OUYdvdsKqOUGwpTWTUUniqINJdjqIBdy@interchange.proxy.rlwy.net:43835/railway';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: RAILWAY_DB_URL
    }
  }
});

// Import task weights (we'll replicate the logic here)
const YOTPO_WEIGHTS = {
  "Information – Unfeasible request or information not available": 23.20,
  "Information – Tracking or delivery status provided": 12.39,
  "Return Authorization – Created and sent to customer": 8.45,
  "Refund – Return to sender (RTS)": 8.53,
  "Refund – Partial refund issued": 8.21,
  "Reship – Damaged or quality issue": 8.20,
  "AER – None Serious AER - RA Issued": 7.78,
  "Refund – Full refund issued": 7.62,
  "Unsubscribed – Customer removed from communications": 7.42,
  "Subscription – Cancelled": 7.37,
  "Information – Product usage or transition tips sent": 7.31,
  "Subscription – Updated (next charge date, frequency, etc.)": 7.29,
  "Information – Product Information sent": 7.13,
  "Reship – Item or order not received": 6.77,
  "Information – Billing Inquiry": 6.67,
  "Subscription – Cancelled due to PayPal limitations": 6.68,
  "Escalation – Sent Negative Feedback Macro": 5.46,
  "Duplicate Request – No new action required": 5.24,
  "Information – Medical or veterinary guidance provided": 4.84,
  "Refund – Refund issued with condolences (pet passing or sensitive case)": 4.72,
  "Passed MBG": 3.85,
  "Delivered – Order delivered after review, no further action required": 3.14,
  "Previously Assisted – Issue already resolved or refund previously issued": 2.18,
  "No Match – No valid account or order located": 0.68,
  "AER – Serious AER - Refund Issued": 0.23,
};

const TASK_TYPE_DEFAULTS = {
  TEXT_CLUB: 2.60,
  WOD_IVCS: 2.14,
  EMAIL_REQUESTS: 5.27,
  YOTPO: 6.22, // New weighted average
  TRELLO: 3.0,
  HOLDS: 4.0,
  STANDALONE_REFUNDS: 3.0,
};

// Task weights for other types (simplified - using defaults for now)
const TEXT_CLUB_WEIGHTS = {
  "Answered in SF": 6.95,
  "Answered in Attentive": 4.01,
  "Spam - Negative Feedback": 1.34,
  "Previously Assisted": 1.31,
  "Spam - Positive Feedback": 1.21,
  "Spam - Reaction Message": 1.06,
  "No Response Required (leadership advised)": 1.03,
  "Spam - Off topic": 0.78,
  "Spam - Gibberish": 0.76,
  "Spam - One word statement": 0.57,
};

const WOD_IVCS_WEIGHTS = {
  "Completed - Added PayPal Payment info": 4.47,
  "Completed - Fixed Amounts - Unable to fix amounts (everything is matching)": 4.36,
  "Completed - Fixed Amounts - Completed SO only - CS line location error": 2.80,
  "Completed - Completed SO only - CS line location error": 2.68,
  "Reviewed / Unable to Complete - Unable to Edit Cash Sale": 2.49,
  "Unable to Complete - Not Completed - Locked (CS was able to be edited)": 2.36,
  "Reviewed / Unable to Complete - Invalid Cash Sale / Not Able to Fix": 2.35,
  "Completed - Fixed Amounts": 2.26,
  "Unable to Complete - Not Completed - Meta": 1.53,
  "Completed - Unable to fix amounts (everything is matching)": 1.52,
  "Unable to Complete - Not Completed - Canada Lock": 1.46,
  "Completed - Cannot edit CS": 1.13,
  "Reviewed / Unable to Complete - Canadian Order / Unable to Edit Sales Order": 1.08,
  "Reviewed / Unable to Complete - Unable to Edit Sales Order": 0.71,
};

const EMAIL_REQUESTS_WEIGHTS = {
  "Unable to Complete - Link/Sale Unavailable": 7.17,
  "Completed": 6.31,
  "Unable to Complete - No Specification on Requests": 5.53,
  "Unable to Complete - Unfeasable request / Information not available": 2.45,
  "Unable to Complete - Incomplete or Missing Info": 2.29,
  "Unable to Complete - Duplicate Request": 2.08,
  "Unable to Complete - Requesting info on ALL Products": 1.81,
};

function getTaskWeight(taskType, disposition) {
  if (!disposition) {
    return TASK_TYPE_DEFAULTS[taskType] || 1.0;
  }

  let weight;
  switch (taskType) {
    case "TEXT_CLUB":
      weight = TEXT_CLUB_WEIGHTS[disposition];
      break;
    case "WOD_IVCS":
      weight = WOD_IVCS_WEIGHTS[disposition];
      break;
    case "EMAIL_REQUESTS":
      weight = EMAIL_REQUESTS_WEIGHTS[disposition];
      break;
    case "YOTPO":
      weight = YOTPO_WEIGHTS[disposition];
      break;
    case "TRELLO":
      return TASK_TYPE_DEFAULTS.TRELLO;
    default:
      weight = undefined;
  }

  return weight !== undefined ? weight : (TASK_TYPE_DEFAULTS[taskType] || 1.0);
}

// Sprint utilities (replicated from sprint-utils.ts)
const SPRINT_START_DATE = new Date(Date.UTC(2025, 10, 1, 8, 0, 0, 0)); // Nov 1, 2025 8 AM UTC
const SPRINT_DURATION_DAYS = 14;
const SPRINT_DURATION_MS = SPRINT_DURATION_DAYS * 24 * 60 * 60 * 1000;

function getSprintNumber(date) {
  const timeSinceStart = date.getTime() - SPRINT_START_DATE.getTime();
  if (timeSinceStart < 0) return 0;
  return Math.floor(timeSinceStart / SPRINT_DURATION_MS) + 1;
}

function getSprintDates(sprintNumber) {
  if (sprintNumber < 1) throw new Error('Sprint number must be >= 1');
  
  const startMs = SPRINT_START_DATE.getTime() + (sprintNumber - 1) * SPRINT_DURATION_MS;
  const endMs = startMs + 
    (13 * 24 * 60 * 60 * 1000) +  // 13 full days
    (23 * 60 * 60 * 1000) +        // 23 hours
    (59 * 60 * 1000) +             // 59 minutes
    (59 * 1000) +                  // 59 seconds
    999;                           // 999 milliseconds
  
  return {
    start: new Date(startMs),
    end: new Date(endMs)
  };
}

const SENIOR_AGENTS = [
  'daniel.murcia@goldenboltllc.com',
  'genesis.hernandez@goldencustomercare.com', 
  'carson.lund@goldencustomercare.com',
  'lisa.marin@goldencustomercare.com'
];

function isSeniorAgent(email) {
  return SENIOR_AGENTS.includes(email.toLowerCase());
}

async function recalculateAllSprints() {
  try {
    console.log('\n🔄 Starting Sprint Rankings Recalculation...\n');
    
    // Get all agents
    const agents = await prisma.user.findMany({
      where: {
        role: { in: ['AGENT', 'MANAGER_AGENT'] },
        isActive: true
      },
      select: {
        id: true,
        name: true,
        email: true
      }
    });
    
    console.log(`Found ${agents.length} active agents\n`);
    
    // Get all completed tasks
    const allTasks = await prisma.task.findMany({
      where: {
        status: 'COMPLETED',
        endTime: { not: null }
      },
      select: {
        id: true,
        taskType: true,
        disposition: true,
        assignedToId: true,
        sentBackBy: true,
        endTime: true,
        durationSec: true
      }
    });
    
    console.log(`Found ${allTasks.length} completed tasks\n`);
    
    // Get all Trello completions
    const trelloCompletions = await prisma.trelloCompletion.findMany({
      select: {
        agentId: true,
        date: true,
        cardsCount: true
      }
    });
    
    console.log(`Found ${trelloCompletions.length} Trello completion records\n`);
    
    // Group tasks by sprint
    const tasksBySprint = new Map();
    const trelloBySprint = new Map();
    
    for (const task of allTasks) {
      if (!task.endTime) continue;
      
      const sprintNum = getSprintNumber(new Date(task.endTime));
      if (sprintNum < 1) continue; // Before sprint system started
      
      if (!tasksBySprint.has(sprintNum)) {
        tasksBySprint.set(sprintNum, []);
      }
      tasksBySprint.get(sprintNum).push(task);
    }
    
    for (const trello of trelloCompletions) {
      const sprintNum = getSprintNumber(new Date(trello.date));
      if (sprintNum < 1) continue;
      
      if (!trelloBySprint.has(sprintNum)) {
        trelloBySprint.set(sprintNum, []);
      }
      trelloBySprint.get(sprintNum).push(trello);
    }
    
    const sprintNumbers = Array.from(new Set([
      ...Array.from(tasksBySprint.keys()),
      ...Array.from(trelloBySprint.keys())
    ])).sort((a, b) => a - b);
    
    console.log(`Found ${sprintNumbers.length} sprints with data: ${sprintNumbers.join(', ')}\n`);
    
    // Process each sprint
    for (const sprintNum of sprintNumbers) {
      console.log(`\n📊 Processing Sprint #${sprintNum}...`);
      
      const { start, end } = getSprintDates(sprintNum);
      const sprintTasks = tasksBySprint.get(sprintNum) || [];
      const sprintTrello = trelloBySprint.get(sprintNum) || [];
      
      console.log(`  Tasks: ${sprintTasks.length}, Trello: ${sprintTrello.length}`);
      
      // Calculate stats for each agent
      const agentStats = new Map();
      
      for (const agent of agents) {
        // Portal tasks
        const agentTasks = sprintTasks.filter(t => 
          (t.assignedToId === agent.id && t.status === 'COMPLETED') ||
          (t.sentBackBy === agent.id && t.status === 'PENDING')
        );
        
        // Calculate weighted points
        let weightedPoints = 0;
        let totalDurationSec = 0;
        let tasksCompleted = agentTasks.length;
        
        for (const task of agentTasks) {
          const weight = getTaskWeight(task.taskType, task.disposition);
          weightedPoints += weight;
          if (task.durationSec) {
            totalDurationSec += task.durationSec;
          }
        }
        
        // Trello completions
        const agentTrello = sprintTrello.filter(t => t.agentId === agent.id);
        const trelloCompleted = agentTrello.reduce((sum, t) => sum + t.cardsCount, 0);
        const trelloPoints = trelloCompleted * TASK_TYPE_DEFAULTS.TRELLO;
        
        // Combine portal + trello
        const totalCompleted = tasksCompleted + trelloCompleted;
        const totalWeightedPoints = weightedPoints + trelloPoints;
        
        // Calculate days worked
        const portalWorkDates = new Set(
          agentTasks.map(t => new Date(t.endTime).toISOString().split('T')[0])
        );
        const trelloWorkDates = new Set(
          agentTrello.map(t => new Date(t.date).toISOString().split('T')[0])
        );
        const allWorkDates = new Set([...portalWorkDates, ...trelloWorkDates]);
        const daysWorked = allWorkDates.size;
        
        if (totalCompleted > 0 && daysWorked > 0) {
          agentStats.set(agent.id, {
            agentId: agent.id,
            agentName: agent.name || 'Unknown',
            agentEmail: agent.email,
            tasksCompleted,
            trelloCompleted,
            totalCompleted,
            daysWorked,
            weightedPoints: totalWeightedPoints,
            ptsPerDay: totalWeightedPoints / daysWorked,
            tasksPerDay: totalCompleted / daysWorked,
            avgHandleTimeSec: tasksCompleted > 0 ? Math.round(totalDurationSec / tasksCompleted) : 0,
            totalTimeSec: totalDurationSec,
            isSenior: isSeniorAgent(agent.email)
          });
        }
      }
      
      // Separate competitive and senior agents
      const competitiveAgents = Array.from(agentStats.values())
        .filter(a => !a.isSenior && a.daysWorked >= 3);
      const seniorAgents = Array.from(agentStats.values())
        .filter(a => a.isSenior);
      const unqualified = Array.from(agentStats.values())
        .filter(a => !a.isSenior && a.daysWorked < 3);
      
      // Calculate rankings
      competitiveAgents.sort((a, b) => b.ptsPerDay - a.ptsPerDay);
      competitiveAgents.forEach((agent, idx) => {
        agent.rankByPtsPerDay = idx + 1;
      });
      
      competitiveAgents.sort((a, b) => b.tasksPerDay - a.tasksPerDay);
      competitiveAgents.forEach((agent, idx) => {
        agent.rankByTasksPerDay = idx + 1;
      });
      
      // Calculate hybrid scores (30% tasks/day, 70% pts/day)
      if (competitiveAgents.length > 0) {
        const maxTasksPerDay = Math.max(...competitiveAgents.map(a => a.tasksPerDay));
        const maxPtsPerDay = Math.max(...competitiveAgents.map(a => a.ptsPerDay));
        
        competitiveAgents.forEach(agent => {
          const normalizedTasks = maxTasksPerDay > 0 ? (agent.tasksPerDay / maxTasksPerDay) * 100 : 0;
          const normalizedPts = maxPtsPerDay > 0 ? (agent.ptsPerDay / maxPtsPerDay) * 100 : 0;
          agent.hybridScore = (normalizedTasks * 0.30) + (normalizedPts * 0.70);
        });
        
        competitiveAgents.sort((a, b) => b.hybridScore - a.hybridScore);
        competitiveAgents.forEach((agent, idx) => {
          agent.rankByHybrid = idx + 1;
        });
      }
      
      // Calculate tiers and percentiles
      competitiveAgents.forEach(agent => {
        const total = competitiveAgents.length;
        const percentile = Math.round(((total - agent.rankByPtsPerDay + 1) / total) * 100);
        
        let tier = 'Standard';
        if (agent.rankByPtsPerDay === 1) tier = 'Elite';
        else if (agent.rankByPtsPerDay <= 3) tier = 'High Performer';
        else if (percentile >= 75) tier = 'Above Average';
        else if (percentile >= 50) tier = 'Average';
        else tier = 'Developing';
        
        agent.tier = tier;
        agent.percentile = percentile;
        agent.isChampion = agent.rankByPtsPerDay === 1;
        agent.isTopThree = agent.rankByPtsPerDay <= 3;
      });
      
      // Save to database
      console.log(`  Saving ${competitiveAgents.length} competitive, ${seniorAgents.length} senior, ${unqualified.length} unqualified agents...`);
      
      for (const agent of [...competitiveAgents, ...seniorAgents, ...unqualified]) {
        await prisma.sprintRanking.upsert({
          where: {
            sprintNumber_agentId: {
              sprintNumber: sprintNum,
              agentId: agent.agentId
            }
          },
          update: {
            tasksCompleted: agent.tasksCompleted,
            trelloCompleted: agent.trelloCompleted,
            totalCompleted: agent.totalCompleted,
            daysWorked: agent.daysWorked,
            weightedPoints: agent.weightedPoints,
            ptsPerDay: agent.ptsPerDay,
            tasksPerDay: agent.tasksPerDay,
            hybridScore: agent.hybridScore || 0,
            rankByPtsPerDay: agent.rankByPtsPerDay || 999,
            rankByTasksPerDay: agent.rankByTasksPerDay || 999,
            rankByHybrid: agent.rankByHybrid || 999,
            tier: agent.tier || 'Standard',
            percentile: agent.percentile || 0,
            isChampion: agent.isChampion || false,
            isTopThree: agent.isTopThree || false,
            isSenior: agent.isSenior || false,
            avgHandleTimeSec: agent.avgHandleTimeSec,
            totalTimeSec: agent.totalTimeSec,
            updatedAt: new Date()
          },
          create: {
            id: `sprint-${sprintNum}-${agent.agentId}`,
            sprintNumber: sprintNum,
            sprintStart: start,
            sprintEnd: end,
            agentId: agent.agentId,
            agentName: agent.agentName,
            agentEmail: agent.agentEmail,
            tasksCompleted: agent.tasksCompleted,
            trelloCompleted: agent.trelloCompleted,
            totalCompleted: agent.totalCompleted,
            daysWorked: agent.daysWorked,
            weightedPoints: agent.weightedPoints,
            ptsPerDay: agent.ptsPerDay,
            tasksPerDay: agent.tasksPerDay,
            hybridScore: agent.hybridScore || 0,
            rankByPtsPerDay: agent.rankByPtsPerDay || 999,
            rankByTasksPerDay: agent.rankByTasksPerDay || 999,
            rankByHybrid: agent.rankByHybrid || 999,
            tier: agent.tier || 'Standard',
            percentile: agent.percentile || 0,
            isChampion: agent.isChampion || false,
            isTopThree: agent.isTopThree || false,
            isSenior: agent.isSenior || false,
            avgHandleTimeSec: agent.avgHandleTimeSec,
            totalTimeSec: agent.totalTimeSec
          }
        });
      }
      
      console.log(`  ✅ Sprint #${sprintNum} completed`);
    }
    
    console.log('\n✅ All sprints recalculated successfully!\n');
    
    // Summary
    const totalSprints = sprintNumbers.length;
    const totalRankings = await prisma.sprintRanking.count();
    console.log(`Summary:`);
    console.log(`  • ${totalSprints} sprints processed`);
    console.log(`  • ${totalRankings} agent sprint records updated`);
    console.log(`  • Yotpo tasks now use disposition-based weights`);
    console.log(`  • Hybrid 30/70 scores recalculated\n`);
    
  } catch (error) {
    console.error('\n❌ Error during recalculation:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the recalculation
recalculateAllSprints()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

