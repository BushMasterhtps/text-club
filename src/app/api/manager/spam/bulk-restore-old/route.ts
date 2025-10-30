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

    // Preview mode - just return what would be restored
    if (dryRun) {
      return NextResponse.json({
        success: true,
        message: `DRY RUN: Found ${oldSpamMessages.length} messages that would be restored`,
        count: oldSpamMessages.length,
        dryRun: true,
        preview: oldSpamMessages.slice(0, 10).map(m => ({
          id: m.id,
          createdAt: m.createdAt,
          text: m.text?.substring(0, 100),
          brand: m.brand,
          matchedPatterns: m.previewMatches
        })),
        instruction: `To actually restore these messages, add ?dryRun=false to the URL`
      });
    }

    // Actually restore the messages
    const messageIds = oldSpamMessages.map(m => m.id);
    
    const updateResult = await prisma.rawMessage.updateMany({
      where: {
        id: { in: messageIds }
      },
      data: {
        status: RawStatus.READY, // Restore to READY status
        previewMatches: null // Clear the matched patterns
      }
    });

    return NextResponse.json({
      success: true,
      message: `Successfully restored ${updateResult.count} messages from spam review`,
      count: updateResult.count,
      dryRun: false,
      beforeDate: beforeDateStr,
      oldestRestored: oldSpamMessages[0]?.createdAt,
      newestRestored: oldSpamMessages[oldSpamMessages.length - 1]?.createdAt
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

