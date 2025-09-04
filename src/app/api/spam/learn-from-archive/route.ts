// Learn from archived spam data
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { analyzeSpamPatterns, learnFromSpamDecision } from "@/lib/spam-detection";

export async function POST(req: Request) {
  try {
    const { brand } = await req.json();
    
    // Get all archived spam data
    const archivedSpam = await prisma.spamArchive.findMany({
      where: brand ? { brand } : {},
      select: {
        text: true,
        brand: true,
        firstSeen: true,
        hitCount: true
      },
      orderBy: { hitCount: 'desc' },
      take: 5000 // Increased limit to process more archive data
    });

    console.log(`📊 Found ${archivedSpam.length} archived spam entries to learn from`);

    let learnedCount = 0;
    let errorCount = 0;

    // Learn from each archived spam entry
    for (const spam of archivedSpam) {
      try {
        if (spam.text && spam.text.length > 0) {
          // Analyze the spam text
          const analysis = analyzeSpamPatterns(spam.text);
          
          // Learn that this is spam (isSpam = true)
          await learnFromSpamDecision(spam.text, true, spam.brand || undefined);
          learnedCount++;
        }
      } catch (error) {
        console.error('Error learning from spam entry:', error);
        errorCount++;
      }
    }

    // Also learn from legitimate messages (non-spam tasks)
    const legitimateTasks = await prisma.task.findMany({
      where: {
        status: 'COMPLETED',
        disposition: { not: 'SPAM' },
        text: { not: null }
      },
      select: {
        text: true,
        brand: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' },
      take: 2000 // Increased limit to process more legitimate tasks
    });

    console.log(`📊 Found ${legitimateTasks.length} legitimate tasks to learn from`);

    let legitimateLearnedCount = 0;

    for (const task of legitimateTasks) {
      try {
        if (task.text && task.text.length > 0) {
          // Learn that this is legitimate (isSpam = false)
          await learnFromSpamDecision(task.text, false, task.brand || undefined);
          legitimateLearnedCount++;
        }
      } catch (error) {
        console.error('Error learning from legitimate task:', error);
        errorCount++;
      }
    }

    return NextResponse.json({
      success: true,
      results: {
        spamLearned: learnedCount,
        legitimateLearned: legitimateLearnedCount,
        totalLearned: learnedCount + legitimateLearnedCount,
        errors: errorCount,
        message: `Successfully learned from ${learnedCount + legitimateLearnedCount} messages (${learnedCount} spam, ${legitimateLearnedCount} legitimate)`
      }
    });
  } catch (error) {
    console.error('Learn from archive error:', error);
    return NextResponse.json({ 
      success: false, 
      error: "Failed to learn from archive" 
    }, { status: 500 });
  }
}
