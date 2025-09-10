// Background processing for spam learning from archive
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { learnFromSpamDecision } from "@/lib/spam-detection";

/**
 * Background processing for spam learning
 * Processes items in very small batches to avoid timeouts
 * 
 * POST body:
 * {
 *   brand?: string;        // Optional brand filter
 *   batchSize?: number;    // items per batch (default: 10)
 *   maxBatches?: number;   // max batches per request (default: 5)
 *   type?: 'spam' | 'legitimate' | 'both'; // what to process (default: 'both')
 * }
 */
export async function POST(req: Request) {
  const startTime = Date.now();
  
  try {
    const { 
      brand, 
      batchSize = 10, 
      maxBatches = 5,
      type = 'both' 
    } = await req.json();
    
    console.log(`🧠 Background spam learning: batchSize=${batchSize}, maxBatches=${maxBatches}, type=${type}`);
    
    let totalLearned = 0;
    let totalErrors = 0;
    let processedBatches = 0;

    // Process spam data if requested
    if (type === 'spam' || type === 'both') {
      console.log('📊 Processing archived spam data...');
      
      // First check if we have any spam archive data
      const spamArchiveCount = await prisma.spamArchive.count({
        where: brand ? { brand } : {}
      });
      
      if (spamArchiveCount === 0) {
        console.log('⚠️ No spam archive data found. Spam learning requires archived spam messages to learn from.');
        return NextResponse.json({
          success: false,
          error: "No spam archive data found. Spam learning requires archived spam messages to learn from.",
          suggestion: "Use the 'Apply Reviewer Decisions' button to archive some spam messages first, then try learning again."
        });
      }
      
      let spamOffset = 0;
      
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
          take: batchSize,
          skip: spamOffset
        });

        if (archivedSpam.length === 0) break;

        console.log(`📊 Processing spam batch ${batch + 1}: ${archivedSpam.length} entries`);

        let batchLearned = 0;
        let batchErrors = 0;

        for (const spam of archivedSpam) {
          try {
            if (spam.text && spam.text.length > 0) {
              await learnFromSpamDecision(spam.text, true, spam.brand || undefined);
              batchLearned++;
            }
          } catch (error) {
            console.error('Error learning from spam entry:', error);
            batchErrors++;
          }
        }

        totalLearned += batchLearned;
        totalErrors += batchErrors;
        processedBatches++;
        spamOffset += batchSize;

        // Delay between batches
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    // Process legitimate data if requested
    if (type === 'legitimate' || type === 'both') {
      console.log('📊 Processing legitimate task data...');
      
      // First check if we have any TEXT_CLUB tasks
      const textClubCount = await prisma.task.count({
        where: {
          taskType: 'TEXT_CLUB'
        }
      });
      
      if (textClubCount === 0) {
        console.log('⚠️ No TEXT_CLUB tasks found in database. Spam learning requires TEXT_CLUB tasks to learn from.');
        return NextResponse.json({
          success: false,
          error: "No TEXT_CLUB tasks found. Spam learning requires TEXT_CLUB tasks to learn from legitimate messages.",
          suggestion: "Import some TEXT_CLUB tasks first, then try learning again."
        });
      }
      
      let legitimateOffset = 0;
      
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
            createdAt: true,
            taskType: true // Add taskType to verify we're not learning from wrong tasks
          },
          orderBy: { createdAt: 'desc' },
          take: batchSize,
          skip: legitimateOffset
        });

        if (legitimateTasks.length === 0) break;

        console.log(`📊 Processing legitimate batch ${batch + 1}: ${legitimateTasks.length} entries`);

        let batchLearned = 0;
        let batchErrors = 0;

        for (const task of legitimateTasks) {
          try {
            if (task.text && task.text.length > 0) {
              await learnFromSpamDecision(task.text, false, task.brand || undefined);
              batchLearned++;
            }
          } catch (error) {
            console.error('Error learning from legitimate task:', error);
            batchErrors++;
          }
        }

        totalLearned += batchLearned;
        totalErrors += batchErrors;
        processedBatches++;
        legitimateOffset += batchSize;

        // Delay between batches
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    const processingTime = Date.now() - startTime;
    console.log(`🧠 Background spam learning completed in ${processingTime}ms`);

    return NextResponse.json({
      success: true,
      version: "2.0",
      results: {
        totalLearned,
        errors: totalErrors,
        batchesProcessed: processedBatches,
        processingTimeMs: processingTime,
        message: `Successfully learned from ${totalLearned} messages in ${processedBatches} batches`
      }
    });
  } catch (error) {
    console.error('Background learn from archive error:', error);
    return NextResponse.json({ 
      success: false, 
      error: "Failed to learn from archive in background" 
    }, { status: 500 });
  }
}
