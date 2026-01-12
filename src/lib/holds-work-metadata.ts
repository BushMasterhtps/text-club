/**
 * Holds Work Metadata Calculation
 * 
 * Calculates work status metadata for Holds tasks to help with assignment prioritization.
 * This includes detecting never-worked tasks, re-work tasks, and recently worked tasks.
 */

import { Prisma } from '@prisma/client';

interface QueueHistoryEntry {
  queue?: string;
  enteredAt?: string;
  exitedAt?: string | null;
  movedBy?: string;
  disposition?: string;
  note?: string;
}

interface WorkMetadataResult {
  hasBeenWorked: boolean;
  isRework: boolean;
  recentlyWorked: boolean;
  lastWorkedAt: Date | null;
  lastWorkedBy: string | null;
  lastWorkedByName: string | null;
  workAttempts: number;
  hoursSinceLastWork: number | null;
}

interface TaskData {
  completedBy?: string | null;
  completedAt?: Date | null;
  holdsStatus?: string | null;
  holdsQueueHistory?: Prisma.JsonValue | null;
  assignedTo?: {
    id: string;
    name: string;
    email: string;
  } | null;
  completedByUser?: {
    id: string;
    name: string;
    email: string;
  } | null;
}

/**
 * Extracts agent name from movedBy string in queue history
 * Examples: "Agent (Unable to Resolve)" -> "Agent", "Daniel Murcia" -> "Daniel Murcia"
 */
function extractAgentName(movedBy: string | undefined): string | null {
  if (!movedBy) return null;
  
  // If it contains "Agent (" it's in format "Agent (Disposition)"
  if (movedBy.includes('Agent (')) {
    return 'Agent'; // Generic agent
  }
  
  // Otherwise, treat the whole string as the agent name
  // But remove any trailing disposition info in parentheses if present
  const match = movedBy.match(/^([^(]+)/);
  return match ? match[1].trim() : movedBy.trim();
}

/**
 * Calculates work metadata for a Holds task
 */
export function calculateWorkMetadata(
  task: TaskData,
  allUsers?: Array<{ id: string; name: string; email: string }>
): WorkMetadataResult {
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  
  // Initialize result
  let hasBeenWorked = false;
  let isRework = false;
  let recentlyWorked = false;
  let lastWorkedAt: Date | null = null;
  let lastWorkedBy: string | null = null;
  let lastWorkedByName: string | null = null;
  let workAttempts = 0;
  let hoursSinceLastWork: number | null = null;
  
  // Primary source: completedBy and completedAt
  if (task.completedBy && task.completedAt) {
    hasBeenWorked = true;
    lastWorkedAt = new Date(task.completedAt);
    lastWorkedBy = task.completedBy;
    
    // Get agent name from completedByUser if available
    if (task.completedByUser) {
      lastWorkedByName = task.completedByUser.name;
    } else if (allUsers) {
      const user = allUsers.find(u => u.id === task.completedBy);
      lastWorkedByName = user?.name || null;
    }
    
    // Calculate hours since last work
    hoursSinceLastWork = Math.floor((now.getTime() - lastWorkedAt.getTime()) / (1000 * 60 * 60));
    
    // Check if recently worked (<24 hours)
    if (lastWorkedAt >= twentyFourHoursAgo) {
      recentlyWorked = true;
    }
    
    workAttempts = 1; // At least one attempt
  }
  
  // Secondary source: Infer from holdsQueueHistory if completedBy is missing
  const queueHistory = task.holdsQueueHistory;
  if (queueHistory && Array.isArray(queueHistory)) {
    const history = queueHistory as QueueHistoryEntry[];
    
    // Find all entries that indicate work was done (dispositions or agent movements)
    const workEntries = history.filter(entry => {
      // Entry has a disposition (means it was completed)
      if (entry.disposition) return true;
      
      // Entry was moved by an agent (not system/auto)
      if (entry.movedBy && 
          !entry.movedBy.includes('System') && 
          !entry.movedBy.includes('Auto-Import') &&
          !entry.movedBy.includes('Auto-escalation')) {
        return true;
      }
      
      return false;
    });
    
    // If we found work entries, update metadata
    if (workEntries.length > 0) {
      hasBeenWorked = true;
      workAttempts = Math.max(workAttempts, workEntries.length);
      
      // Get the most recent work entry
      const lastWorkEntry = workEntries[workEntries.length - 1];
      
      // If we don't have completedAt, try to use enteredAt from last work entry
      if (!lastWorkedAt && lastWorkEntry.enteredAt) {
        lastWorkedAt = new Date(lastWorkEntry.enteredAt);
        hoursSinceLastWork = Math.floor((now.getTime() - lastWorkedAt.getTime()) / (1000 * 60 * 60));
        
        if (lastWorkedAt >= twentyFourHoursAgo) {
          recentlyWorked = true;
        }
      }
      
      // If we don't have completedBy, try to extract from movedBy
      if (!lastWorkedBy && lastWorkEntry.movedBy) {
        const agentName = extractAgentName(lastWorkEntry.movedBy);
        if (agentName && agentName !== 'Agent') {
          // Try to find user by name
          if (allUsers) {
            const user = allUsers.find(u => 
              u.name.toLowerCase().includes(agentName.toLowerCase()) ||
              agentName.toLowerCase().includes(u.name.toLowerCase())
            );
            if (user) {
              lastWorkedBy = user.id;
              lastWorkedByName = user.name;
            } else {
              lastWorkedByName = agentName; // Use name from history even if not found in users
            }
          } else {
            lastWorkedByName = agentName;
          }
        }
      }
    }
    
    // Detect re-work: Check if current queue appears in history before the last entry
    if (task.holdsStatus && history.length > 1) {
      // Get all queue names from history (excluding the last one which is current)
      const previousQueues = history.slice(0, -1).map(entry => entry.queue).filter(Boolean);
      
      // Check if current queue is in previous queues (meaning it came back)
      if (previousQueues.includes(task.holdsStatus)) {
        isRework = true;
      }
      
      // Also check if the last entry shows the same queue as current (bounced back immediately)
      const lastEntry = history[history.length - 1];
      if (lastEntry.queue === task.holdsStatus && workEntries.length > 0) {
        // Task was worked on and returned to same queue
        isRework = true;
      }
    }
  }
  
  // If no completedBy and no history indicates work, it's never worked
  if (!hasBeenWorked) {
    lastWorkedByName = null;
  }
  
  return {
    hasBeenWorked,
    isRework,
    recentlyWorked,
    lastWorkedAt,
    lastWorkedBy,
    lastWorkedByName,
    workAttempts,
    hoursSinceLastWork,
  };
}

/**
 * Get color class for task card based on work status
 */
export function getTaskCardColorClass(metadata: WorkMetadataResult): string {
  if (!metadata.hasBeenWorked) {
    // Never worked - Green
    return 'bg-green-900/10 border-green-500/30';
  }
  
  if (metadata.recentlyWorked) {
    // Recently worked (<24h)
    const hours = metadata.hoursSinceLastWork || 0;
    if (hours < 2) {
      // Very recent (<2h) - Red
      return 'bg-red-900/10 border-red-500/30';
    } else {
      // Recent (2-24h) - Orange
      return 'bg-orange-900/10 border-orange-500/30';
    }
  }
  
  if (metadata.isRework) {
    // Re-work, >24h ago - Yellow
    return 'bg-yellow-900/10 border-yellow-500/30';
  }
  
  // Default
  return 'bg-white/5 border-white/10';
}
