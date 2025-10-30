import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { RawStatus } from "@prisma/client";

/**
 * Bulk restore old messages from spam review queue
 * Query params:
 * - beforeDate: ISO date string (e.g., "2025-10-29")
 * - dryRun: "true" to preview without making changes (default: true)
 */
export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const beforeDateStr = url.searchParams.get("beforeDate");
    const dryRun = url.searchParams.get("dryRun") !== "false"; // Default to true for safety

    if (!beforeDateStr) {
      return NextResponse.json(
        { success: false, error: "beforeDate query parameter required (e.g., ?beforeDate=2025-10-29)" },
        { status: 400 }
      );
    }

    // Parse the date
    const beforeDate = new Date(beforeDateStr);
    if (isNaN(beforeDate.getTime())) {
      return NextResponse.json(
        { success: false, error: "Invalid date format. Use YYYY-MM-DD (e.g., 2025-10-29)" },
        { status: 400 }
      );
    }

    // Find messages in SPAM_REVIEW that were created before the specified date
    const oldSpamMessages = await prisma.rawMessage.findMany({
      where: {
        status: RawStatus.SPAM_REVIEW,
        createdAt: { lt: beforeDate }
      },
      select: {
        id: true,
        createdAt: true,
        text: true,
        brand: true,
        previewMatches: true
      },
      orderBy: { createdAt: "asc" }
    });

    if (oldSpamMessages.length === 0) {
      return NextResponse.json({
        success: true,
        message: `No spam messages found before ${beforeDateStr}`,
        count: 0,
        dryRun
      });
    }

    // Preview mode - just return what would be archived
    if (dryRun) {
      // Check how many completed tasks exist for these messages
      const messageIds = oldSpamMessages.map(m => m.id);
      const completedTasksCount = await prisma.task.count({
        where: {
          rawMessageId: { in: messageIds },
          status: "COMPLETED"
        }
      });
      
      return NextResponse.json({
        success: true,
        message: `DRY RUN: Found ${oldSpamMessages.length} messages that would be archived`,
        count: oldSpamMessages.length,
        dryRun: true,
        preview: oldSpamMessages.slice(0, 10).map(m => ({
          id: m.id,
          createdAt: m.createdAt,
          text: m.text?.substring(0, 100),
          brand: m.brand,
          matchedPatterns: m.previewMatches
        })),
        agentMetricsInfo: {
          completedTasksFound: completedTasksCount,
          message: `✅ ${completedTasksCount} completed tasks will remain unchanged - agent metrics preserved`
        },
        instruction: `To actually archive these messages, add ?dryRun=false to the URL`
      });
    }

    // Actually archive the messages (they were already completed/actioned)
    const messageIds = oldSpamMessages.map(m => m.id);
    
    // IMPORTANT: Verify completed tasks exist and count them BEFORE archiving
    // This ensures agents' productivity metrics are preserved
    const completedTasksCount = await prisma.task.count({
      where: {
        rawMessageId: { in: messageIds },
        status: "COMPLETED"
      }
    });
    
    // Update ONLY the RawMessage status - does NOT touch Task records
    const updateResult = await prisma.rawMessage.updateMany({
      where: {
        id: { in: messageIds }
      },
      data: {
        status: RawStatus.SPAM_ARCHIVED, // Archive as confirmed spam
        previewMatches: null // Clear the matched patterns
      }
    });
    
    // Verify completed tasks still exist AFTER archiving (safety check)
    const completedTasksAfter = await prisma.task.count({
      where: {
        rawMessageId: { in: messageIds },
        status: "COMPLETED"
      }
    });

    return NextResponse.json({
      success: true,
      message: `Successfully archived ${updateResult.count} old messages (already completed/actioned)`,
      count: updateResult.count,
      dryRun: false,
      beforeDate: beforeDateStr,
      oldestArchived: oldSpamMessages[0]?.createdAt,
      newestArchived: oldSpamMessages[oldSpamMessages.length - 1]?.createdAt,
      agentMetricsPreserved: {
        completedTasksBefore: completedTasksCount,
        completedTasksAfter: completedTasksAfter,
        verified: completedTasksCount === completedTasksAfter,
        message: completedTasksCount === completedTasksAfter 
          ? `✅ All ${completedTasksCount} completed tasks preserved - agent metrics unaffected`
          : `⚠️ WARNING: Task count mismatch!`
      }
    });

  } catch (error) {
    console.error("Error in bulk restore old spam:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: "Failed to restore messages",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint to check how many old messages are in spam review
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const beforeDateStr = url.searchParams.get("beforeDate");

    if (!beforeDateStr) {
      return NextResponse.json(
        { success: false, error: "beforeDate query parameter required (e.g., ?beforeDate=2025-10-29)" },
        { status: 400 }
      );
    }

    const beforeDate = new Date(beforeDateStr);
    if (isNaN(beforeDate.getTime())) {
      return NextResponse.json(
        { success: false, error: "Invalid date format. Use YYYY-MM-DD" },
        { status: 400 }
      );
    }

    const count = await prisma.rawMessage.count({
      where: {
        status: RawStatus.SPAM_REVIEW,
        createdAt: { lt: beforeDate }
      }
    });

    const sample = await prisma.rawMessage.findMany({
      where: {
        status: RawStatus.SPAM_REVIEW,
        createdAt: { lt: beforeDate }
      },
      select: {
        id: true,
        createdAt: true,
        text: true,
        brand: true,
        previewMatches: true
      },
      orderBy: { createdAt: "asc" },
      take: 5
    });

    return NextResponse.json({
      success: true,
      count,
      beforeDate: beforeDateStr,
      message: count > 0 
        ? `Found ${count} old messages in spam review (before ${beforeDateStr})`
        : `No old messages found before ${beforeDateStr}`,
      sample: sample.map(m => ({
        createdAt: m.createdAt,
        text: m.text?.substring(0, 100),
        brand: m.brand,
        matchedPatterns: m.previewMatches
      }))
    });

  } catch (error) {
    console.error("Error checking old spam messages:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: "Failed to check messages",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}

