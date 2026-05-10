import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { learnFromSpamDecision } from "@/lib/spam-detection";
import { withSelfHealing } from "@/lib/self-healing/wrapper";
import { cache } from "@/lib/cache";
import { authorizeAgentTaskMutationBody, verifyAuth } from "@/lib/auth";
import { logRouteTiming } from "@/lib/route-timing-log";
import {
  buildHoldsTaskWorkSessionIdempotencyKey,
  createHoldsTaskWorkSessionRecord,
  deriveHoldsOutcomeType,
} from "@/lib/task-work-session";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const route = 'POST /api/agent/tasks/[id]/complete';
  const startedAt = Date.now();
  let rowCount = 0;
  let userEmail: string | null = null;
  try {
    const { id } = await params;
    const body = await req.json();
    const disposition = body.disposition;
    const sfCaseNumber = body.sfCaseNumber;
    const orderAmount = body.orderAmount;
    const dispositionNote = body.dispositionNote;

    const session = await verifyAuth(req);
    const actor = authorizeAgentTaskMutationBody(session, body);
    if (!actor.ok) return actor.response;
    userEmail = actor.userEmail;

    if (!disposition) {
      return NextResponse.json({ success: false, error: "Disposition required" }, { status: 400 });
    }

    const user = await prisma.user.findFirst({
      where: {
        OR: [{ id: actor.userId }, { email: actor.userEmail }],
      },
      select: { id: true, isActive: true, email: true }
    });

    if (!user) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    if (!user.isActive) {
      return NextResponse.json({ success: false, error: "User account is paused" }, { status: 403 });
    }

    // Find the task and verify it's assigned to this user
    // Allow completing tasks that are IN_PROGRESS, ASSISTANCE_REQUIRED, or RESOLVED (after manager response).
    // For Holds only: also allow PENDING so agents can complete after reassign without having to click Start again.
    const task = await prisma.task.findFirst({
      where: {
        id,
        assignedToId: user.id,
        OR: [
          { status: { in: ["IN_PROGRESS", "ASSISTANCE_REQUIRED", "RESOLVED"] } },
          { status: "PENDING", taskType: "HOLDS" }
        ]
      },
      select: {
        id: true,
        status: true,
        startTime: true,
        assistancePausedDurationSec: true,
        text: true,
        brand: true,
        taskType: true,
        holdsStatus: true,
        holdsQueueHistory: true,
        assignedToId: true,
        rawMessage: {
          select: {
            text: true,
            brand: true
          }
        }
      }
    });

    if (!task) {
      return NextResponse.json({ success: false, error: "Task not found or not available" }, { status: 404 });
    }

    const completionEndTime = new Date();

    // Calculate duration - use stored paused duration if assistance was requested
    // This excludes assistance time from the total duration
    let durationSec: number | null = null;
    if (task.assistancePausedDurationSec !== null && task.assistancePausedDurationSec !== undefined) {
      durationSec = task.assistancePausedDurationSec;
    } else if (task.startTime) {
      const start = new Date(task.startTime);
      const seconds = Math.round((completionEndTime.getTime() - start.getTime()) / 1000);
      durationSec = seconds;
    }

    // Check if this is a "send back" disposition for WOD/IVCS
    const isSendBack = disposition.includes("Not Completed - No edit button");
    
    // Handle Holds-specific queue movements and status changes
    let newStatus = "COMPLETED";
    let newHoldsQueue = task.holdsStatus;
    let newQueueHistory = task.holdsQueueHistory || [];
    let shouldUnassign = false;
    
    if (task.taskType === "HOLDS") {
      // Completion dispositions (task goes to COMPLETED status)
      const completionDispositions = [
        "Refunded & Closed",
        "Refunded & Closed - Customer Requested Cancelation",
        "Refunded & Closed - No Contact",
        "Refunded & Closed - Comma Issue",
        "Refunded & Closed - Out of Stock",
        "Resolved - fixed format / fixed address",
        "Resolved - Customer Clarified",
        "Resolved - FRT Released",
        "Resolved - other",
        "Resolved - Other"
      ];
      
      if (disposition === "Duplicate") {
        // Move to Duplicates queue for manager review
        newStatus = "COMPLETED"; // Count towards agent's completion stats
        newHoldsQueue = "Duplicates";
        shouldUnassign = true; // Unassign for manager review
      } else if (disposition === "Unable to Resolve") {
        // Handle "Unable to Resolve" based on current queue
        if (task.holdsStatus === "Escalated Call 4+ Day") {
          // From Escalation: Send back to Escalated Call 4+ Day queue (requires note)
          newStatus = "COMPLETED"; // Task is complete for THIS agent (counts towards their stats)
          newHoldsQueue = "Escalated Call 4+ Day";
          shouldUnassign = true; // Remove from agent's queue so it can be reassigned
        } else {
          // From other queues: Move to Customer Contact queue
          newStatus = "COMPLETED"; // Task is complete for THIS agent (counts towards their stats)
          newHoldsQueue = "Customer Contact";
          shouldUnassign = true; // Remove from agent's queue so it can be reassigned
        }
      } else if (disposition === "In Communication") {
        // From Customer Contact: Send back to Customer Contact queue (optional note)
        newStatus = "COMPLETED"; // Task is complete for THIS agent (counts towards their stats)
        newHoldsQueue = "Customer Contact";
        shouldUnassign = true; // Remove from agent's queue so it can be reassigned
      } else if (disposition === "Closed & Refunded - Fraud/Reseller") {
        // From any queue: Move to Completed queue (optional note)
        newStatus = "COMPLETED";
        newHoldsQueue = "Completed"; // Move to Completed queue
      } else if (disposition === "International Order - Unable to Call/ Sent Email" || disposition === "International Order - Unable to Call / Sent Email") {
        // Move to Customer Contact queue - Complete for agent, PENDING for reassignment
        newStatus = "COMPLETED"; // Task is complete for THIS agent (counts towards their stats)
        newHoldsQueue = "Customer Contact";
        shouldUnassign = true; // Remove from agent's queue so it can be reassigned
      } else if (completionDispositions.includes(disposition)) {
        // Move to Completed queue - Task is fully resolved
        newStatus = "COMPLETED";
        newHoldsQueue = "Completed"; // Move to Completed queue
      }
      
      // Update queue history timeline
      if (newHoldsQueue !== task.holdsStatus) {
        const history = Array.isArray(newQueueHistory) ? [...newQueueHistory] : [];
        const endedIso = completionEndTime.toISOString();
        // Close out current queue entry
        if (history.length > 0) {
          history[history.length - 1].exitedAt = endedIso;
        }
        // Add new queue entry with disposition note if provided
        history.push({
          queue: newHoldsQueue,
          enteredAt: endedIso,
          exitedAt: null,
          movedBy: `Agent (${disposition})`,
          disposition: disposition,
          note: dispositionNote || undefined, // Add the disposition note here
          source: disposition === 'Duplicate' ? 'Agent-Disposition' : undefined // Mark agent-moved duplicates
        });
        newQueueHistory = history;
      }
    }

    const holdsSessionDurationSec =
      task.taskType === "HOLDS" ? durationSec : null;

    const taskUpdateSelect = {
      id: true,
      status: true,
      endTime: true,
      durationSec: true,
      disposition: true,
      sentBackBy: true,
      sentBackAt: true,
      sentBackDisposition: true
    } as const;

    const updatedTask = await withSelfHealing(
      () => {
        const updatePayload = {
          status: isSendBack ? "PENDING" : (task.taskType === "HOLDS" ? newStatus : "COMPLETED"),
          endTime: completionEndTime,
          durationSec,
          disposition,
          sfCaseNumber: sfCaseNumber || null,
          assignedToId: isSendBack ? null : (task.taskType === "HOLDS" && shouldUnassign ? null : task.assignedToId),
          updatedAt: completionEndTime,
          ...(task.taskType === "HOLDS" && {
            holdsStatus: newHoldsQueue,
            holdsQueueHistory: newQueueHistory,
            holdsOrderAmount: orderAmount ? parseFloat(orderAmount) : null,
            holdsNotes: dispositionNote || null, // Store disposition note in holdsNotes for agent visibility
            completedBy: user.id,
            completedAt: completionEndTime,
            ...(shouldUnassign && {
              durationSec: null,
              startTime: null // Also reset start time
            })
          }),
          ...(isSendBack && {
            sentBackBy: user.id,
            sentBackAt: completionEndTime,
            sentBackDisposition: disposition
          })
        };

        if (task.taskType === "HOLDS" && !isSendBack) {
          const holdsStatusBefore = task.holdsStatus ?? null;
          const outcomeType = deriveHoldsOutcomeType({
            disposition,
            holdsStatusBefore,
            newHoldsQueue: newHoldsQueue ?? null,
            shouldUnassign,
          });
          const isFinalResolution = newHoldsQueue === "Completed";
          const idempotencyKey = buildHoldsTaskWorkSessionIdempotencyKey(
            id,
            user.id,
            completionEndTime,
            disposition
          );

          return prisma.$transaction(async (tx) => {
            const updated = await tx.task.update({
              where: { id },
              data: updatePayload,
              select: taskUpdateSelect,
            });

            await createHoldsTaskWorkSessionRecord(tx, {
              taskId: id,
              agentId: user.id,
              startedAt: task.startTime,
              endedAt: completionEndTime,
              durationSec: holdsSessionDurationSec,
              fromQueue: holdsStatusBefore,
              toQueue: newHoldsQueue ?? null,
              disposition,
              outcomeType,
              countsTowardProductivity: true,
              isFinalResolution,
              idempotencyKey,
              metadata: {
                previousStatus: task.status,
                newStatus: isSendBack ? "PENDING" : newStatus,
                shouldUnassign,
                holdsStatusBefore,
                holdsStatusAfter: newHoldsQueue ?? null,
                assistancePausedDurationSec: task.assistancePausedDurationSec ?? null,
              },
            });

            return updated;
          });
        }

        return prisma.task.update({
          where: { id },
          data: updatePayload,
          select: taskUpdateSelect,
        });
      },
      { service: 'database', useRetry: true, useCircuitBreaker: true }
    );
    rowCount = 1;

    // Learn from agent's decision (legitimate vs spam)
    try {
      const taskText = task.text || task.rawMessage?.text;
      const taskBrand = task.brand || task.rawMessage?.brand;
      
      if (taskText) {
        // If disposition is SPAM, learn as spam; otherwise learn as legitimate
        const isSpam = disposition === 'SPAM';
        await learnFromSpamDecision(taskText, isSpam, taskBrand, 'agent');
      }
    } catch (error) {
      console.error('Failed to learn from spam decision:', error);
      // Don't fail the task completion if learning fails
    }

    // Clear scorecard cache for this user to ensure fresh data on next fetch
    // This ensures the performance scorecard updates immediately after task completion
    try {
      const cacheEmail = (user.email || actor.userEmail).toLowerCase().trim();
      const cacheKey = `personal-scorecard:${cacheEmail}`;
      cache.delete(cacheKey);
      console.log(`✅ Cleared scorecard cache for ${cacheEmail}`);
    } catch (error) {
      console.error('Failed to clear scorecard cache:', error);
      // Don't fail the task completion if cache clearing fails
    }

    return NextResponse.json({ 
      success: true, 
      task: updatedTask 
    });
  } catch (err: unknown) {
    console.error("Error completing task:", err);
    return NextResponse.json({ 
      success: false, 
      error: err instanceof Error ? err.message : "Failed to complete task" 
    }, { status: 500 });
  } finally {
    logRouteTiming({
      route,
      durationMs: Date.now() - startedAt,
      rowCount,
      email: userEmail,
    });
  }
}
