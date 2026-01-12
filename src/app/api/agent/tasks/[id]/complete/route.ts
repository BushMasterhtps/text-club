import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { learnFromSpamDecision } from "@/lib/spam-detection";
import { withSelfHealing } from "@/lib/self-healing/wrapper";
import { cache } from "@/lib/cache";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const email = body.email;
    const disposition = body.disposition;
    const sfCaseNumber = body.sfCaseNumber;
    const orderAmount = body.orderAmount;
    const dispositionNote = body.dispositionNote;

    if (!email || !disposition) {
      return NextResponse.json({ success: false, error: "Email and disposition required" }, { status: 400 });
    }

    // Find the user by email
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: { id: true, isLive: true }
    });

    if (!user) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    if (!user.isLive) {
      return NextResponse.json({ success: false, error: "User account is paused" }, { status: 403 });
    }

    // Find the task and verify it's assigned to this user
    const task = await prisma.task.findFirst({
      where: {
        id,
        assignedToId: user.id,
        status: {
          in: ["IN_PROGRESS", "ASSISTANCE_REQUIRED"]
        }
      },
      select: {
        id: true,
        status: true,
        startTime: true,
        text: true,
        brand: true,
        taskType: true,
        holdsStatus: true,
        holdsQueueHistory: true,
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

    // Calculate duration - use stored paused duration if assistance was requested
    // This excludes assistance time from the total duration
    let durationSec = null;
    if (task.assistancePausedDurationSec !== null && task.assistancePausedDurationSec !== undefined) {
      // Use the stored duration from before assistance was requested
      durationSec = task.assistancePausedDurationSec;
    } else if (task.startTime) {
      // Normal calculation if no assistance was requested
      const start = new Date(task.startTime);
      const end = new Date();
      const seconds = Math.round((end.getTime() - start.getTime()) / 1000);
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
        // Close out current queue entry
        if (history.length > 0) {
          history[history.length - 1].exitedAt = new Date().toISOString();
        }
        // Add new queue entry with disposition note if provided
        history.push({
          queue: newHoldsQueue,
          enteredAt: new Date().toISOString(),
          exitedAt: null,
          movedBy: `Agent (${disposition})`,
          disposition: disposition,
          note: dispositionNote || undefined, // Add the disposition note here
          source: disposition === 'Duplicate' ? 'Agent-Disposition' : undefined // Mark agent-moved duplicates
        });
        newQueueHistory = history;
      }
    }
    
    // Update task status, end time, duration, and disposition
    // Wrap with self-healing for database write operations
    const updatedTask = await withSelfHealing(
      () => prisma.task.update({
      where: { id },
      data: {
        status: isSendBack ? "PENDING" : (task.taskType === "HOLDS" ? newStatus : "COMPLETED"),
        endTime: new Date(),
        durationSec,
        disposition,
        sfCaseNumber: sfCaseNumber || null,
        assignedToId: isSendBack ? null : (task.taskType === "HOLDS" && shouldUnassign ? null : task.assignedToId),
        updatedAt: new Date(),
        // Holds-specific updates
        ...(task.taskType === "HOLDS" && {
          holdsStatus: newHoldsQueue,
          holdsQueueHistory: newQueueHistory,
          holdsOrderAmount: orderAmount ? parseFloat(orderAmount) : null,
          holdsNotes: dispositionNote || null, // Store disposition note in holdsNotes for agent visibility
          // Track who completed the task (for all Holds completions, even if unassigned)
          completedBy: user.id,
          completedAt: new Date(),
          // Reset timer when unassigning (task goes back to queue)
          ...(shouldUnassign && {
            durationSec: null,
            startTime: null // Also reset start time
          })
        }),
        // Add send-back tracking fields for WOD/IVCS
        ...(isSendBack && {
          sentBackBy: user.id,
          sentBackAt: new Date(),
          sentBackDisposition: disposition
        })
      },
      select: {
        id: true,
        status: true,
        endTime: true,
        durationSec: true,
        disposition: true,
        sentBackBy: true,
        sentBackAt: true,
        sentBackDisposition: true
      }
    }),
      { service: 'database', useRetry: true, useCircuitBreaker: true }
    );

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
      console.error('Failed to learn from agent decision:', error);
      // Don't fail the task completion if learning fails
    }

    // Clear scorecard cache for this user to ensure fresh data on next fetch
    // This ensures the performance scorecard updates immediately after task completion
    try {
      const cacheKey = `personal-scorecard:${email.toLowerCase().trim()}`;
      cache.delete(cacheKey);
      console.log(`✅ Cleared scorecard cache for ${email}`);
    } catch (error) {
      console.error('Failed to clear scorecard cache:', error);
      // Don't fail the task completion if cache clearing fails
    }

    return NextResponse.json({ 
      success: true, 
      task: updatedTask 
    });
  } catch (err: any) {
    console.error("Error completing task:", err);
    return NextResponse.json({ 
      success: false, 
      error: err?.message || "Failed to complete task" 
    }, { status: 500 });
  }
}
