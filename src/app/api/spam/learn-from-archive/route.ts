// Learn from archived spam data - Batch processing version
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { analyzeSpamPatterns, learnFromSpamDecision } from "@/lib/spam-detection";

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function POST(req: Request) {
  const startTime = Date.now();
  
  try {
    const { brand, batchSize = 50, maxBatches = 20 } = await req.json();
    
    console.log(`🧠 Starting spam learning with batch size: ${batchSize}, max batches: ${maxBatches}`);
    
    let totalSpamLearned = 0;
    let totalLegitimateLearned = 0;
    let totalErrors = 0;
    let processedBatches = 0;

    // Process archived spam in batches
    console.log('📊 Processing archived spam data...');
    let spamOffset = 0;
    const spamBatchSize = Math.min(batchSize, 25); // Smaller batches for spam processing
    
    for (let batch = 0; batch < maxBatches; batch++) {
      const archivedSpam = await prisma.spamArchive.findMany({
        where: brand ? { brand } : {},
        select: {
          text: true,
          brand: true,
          firstSeen: true,
          hitCount: true
        },
        orderBy: { hitCount: 'desc' },
        take: spamBatchSize,
        skip: spamOffset
      });

      if (archivedSpam.length === 0) break;

      console.log(`📊 Processing spam batch ${batch + 1}: ${archivedSpam.length} entries`);

      let batchLearned = 0;
      let batchErrors = 0;

      for (const spam of archivedSpam) {
        try {
          if (spam.text && spam.text.length > 0) {
            // Learn that this is spam (isSpam = true)
            await learnFromSpamDecision(spam.text, true, spam.brand || undefined);
            batchLearned++;
          }
        } catch (error) {
          console.error('Error learning from spam entry:', error);
          batchErrors++;
        }
      }

      totalSpamLearned += batchLearned;
      totalErrors += batchErrors;
      processedBatches++;
      spamOffset += spamBatchSize;

      // Small delay between batches to prevent overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Process legitimate tasks in batches
    console.log('📊 Processing legitimate task data...');
    let legitimateOffset = 0;
    const legitimateBatchSize = Math.min(batchSize, 25);
    
    for (let batch = 0; batch < maxBatches; batch++) {
      const legitimateTasks = await prisma.task.findMany({
        where: {
          status: 'COMPLETED',
          disposition: { not: 'SPAM' },
          text: { not: null },
          taskType: 'TEXT_CLUB' // Only use TEXT_CLUB tasks for spam learning
        },
        select: {
          text: true,
          brand: true,
          createdAt: true
        },
        orderBy: { createdAt: 'desc' },
        take: legitimateBatchSize,
        skip: legitimateOffset
      });

      if (legitimateTasks.length === 0) break;

      console.log(`📊 Processing legitimate batch ${batch + 1}: ${legitimateTasks.length} entries`);

      let batchLearned = 0;
      let batchErrors = 0;

      for (const task of legitimateTasks) {
        try {
          if (task.text && task.text.length > 0) {
            // Learn that this is legitimate (isSpam = false)
            await learnFromSpamDecision(task.text, false, task.brand || undefined);
            batchLearned++;
          }
        } catch (error) {
          console.error('Error learning from legitimate task:', error);
          batchErrors++;
        }
      }

      totalLegitimateLearned += batchLearned;
      totalErrors += batchErrors;
      processedBatches++;
      legitimateOffset += legitimateBatchSize;

      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const processingTime = Date.now() - startTime;
    console.log(`🧠 Spam learning completed in ${processingTime}ms`);

    return NextResponse.json({
      success: true,
      version: "2.0", // Force cache invalidation
      results: {
        spamLearned: totalSpamLearned,
        legitimateLearned: totalLegitimateLearned,
        totalLearned: totalSpamLearned + totalLegitimateLearned,
        errors: totalErrors,
        batchesProcessed: processedBatches,
        processingTimeMs: processingTime,
        message: `Successfully learned from ${totalSpamLearned + totalLegitimateLearned} messages (${totalSpamLearned} spam, ${totalLegitimateLearned} legitimate) in ${processedBatches} batches`
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
