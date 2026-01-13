#!/usr/bin/env node

/**
 * Script to estimate when Railway database will reach 90% capacity
 * 
 * Usage:
 *   node scripts/estimate-storage-growth.js
 */

const { PrismaClient } = require('@prisma/client');

// Use Railway DATABASE_URL from environment or fallback
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:OUYdvdsKqOUGwpTWTUUniqINJdjqIBdy@interchange.proxy.rlwy.net:43835/railway';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: DATABASE_URL
    }
  }
});

async function estimateStorageGrowth() {
  try {
    console.log('\n📈 Railway Database Storage Growth Analysis\n');
    console.log('🔗 Connecting to Railway database...\n');

    await prisma.$connect();
    console.log('✅ Connected successfully!\n');

    // 1. Get current database size
    const dbSize = await prisma.$queryRaw`
      SELECT 
        pg_database_size(current_database()) as database_size_bytes
    `;
    const currentSizeBytes = Number(dbSize[0].database_size_bytes);
    const currentSizeMB = currentSizeBytes / 1024 / 1024;
    const currentSizeGB = currentSizeMB / 1024;

    // 2. Get total row counts
    const totalRows = await prisma.$queryRaw`
      SELECT 
        SUM((xpath('/row/cnt/text()', xml_count))[1]::text::bigint)::bigint AS total_rows
      FROM (
        SELECT 
          query_to_xml(format('select count(*) as cnt from %I.%I', schemaname, tablename), false, true, '') AS xml_count
        FROM pg_tables
        WHERE schemaname = 'public'
      ) t
    `;
    const totalRowCount = Number(totalRows[0].total_rows);

    // 3. Get oldest and newest records to calculate age
    const oldestRecord = await prisma.$queryRaw`
      SELECT MIN(created_at) as oldest_date
      FROM (
        SELECT "createdAt" as created_at FROM "Task"
        UNION ALL
        SELECT "createdAt" as created_at FROM "RawMessage"
        UNION ALL
        SELECT "createdAt" as created_at FROM "User"
        UNION ALL
        SELECT "createdAt" as created_at FROM "ImportSession"
        UNION ALL
        SELECT "createdAt" as created_at FROM "SpamLearning"
        UNION ALL
        SELECT "createdAt" as created_at FROM "ProductInquiryQA"
        UNION ALL
        SELECT "createdAt" as created_at FROM "EmailMacro"
        UNION ALL
        SELECT "createdAt" as created_at FROM "TextClubMacro"
      ) all_dates
      WHERE created_at IS NOT NULL
    `;

    const newestRecord = await prisma.$queryRaw`
      SELECT MAX(created_at) as newest_date
      FROM (
        SELECT "createdAt" as created_at FROM "Task"
        UNION ALL
        SELECT "createdAt" as created_at FROM "RawMessage"
        UNION ALL
        SELECT "createdAt" as created_at FROM "User"
        UNION ALL
        SELECT "createdAt" as created_at FROM "ImportSession"
        UNION ALL
        SELECT "createdAt" as created_at FROM "SpamLearning"
        UNION ALL
        SELECT "createdAt" as created_at FROM "ProductInquiryQA"
        UNION ALL
        SELECT "createdAt" as created_at FROM "EmailMacro"
        UNION ALL
        SELECT "createdAt" as created_at FROM "TextClubMacro"
      ) all_dates
      WHERE created_at IS NOT NULL
    `;

    const oldestDate = oldestRecord[0].oldest_date ? new Date(oldestRecord[0].oldest_date) : new Date();
    const newestDate = newestRecord[0].newest_date ? new Date(newestRecord[0].newest_date) : new Date();
    const daysActive = Math.max(1, Math.ceil((newestDate - oldestDate) / (1000 * 60 * 60 * 24)));

    // 4. Calculate growth metrics
    const avgSizePerRow = currentSizeBytes / totalRowCount; // bytes per row
    const dailyGrowthMB = currentSizeMB / daysActive; // MB per day
    const dailyRowGrowth = totalRowCount / daysActive; // rows per day

    // 5. Railway limits
    const railwayFreeTierGB = 1;
    const railwayFreeTierMB = railwayFreeTierGB * 1024;
    const targetUsagePercent = 90;
    const targetSizeMB = railwayFreeTierMB * (targetUsagePercent / 100);
    const remainingMB = targetSizeMB - currentSizeMB;

    // 6. Projections
    const daysTo90Percent = remainingMB / dailyGrowthMB;
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + daysTo90Percent);

    // 7. Alternative projections based on row growth
    const rowsTo90Percent = (remainingMB * 1024 * 1024) / avgSizePerRow;
    const daysTo90PercentByRows = rowsTo90Percent / dailyRowGrowth;
    const targetDateByRows = new Date();
    targetDateByRows.setDate(targetDateByRows.getDate() + daysTo90PercentByRows);

    // 8. Display results
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 CURRENT STATUS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log(`Current Database Size:     ${currentSizeMB.toFixed(2)} MB (${currentSizeGB.toFixed(4)} GB)`);
    console.log(`Total Rows:                ${totalRowCount.toLocaleString()}`);
    console.log(`Average Size per Row:      ${(avgSizePerRow / 1024).toFixed(2)} KB`);
    console.log(`Days Active:               ${daysActive} days`);
    console.log(`Current Usage:             ${((currentSizeMB / railwayFreeTierMB) * 100).toFixed(2)}% of ${railwayFreeTierGB}GB free tier\n`);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📈 GROWTH RATES');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log(`Daily Growth (Size):       ${dailyGrowthMB.toFixed(4)} MB/day`);
    console.log(`Daily Growth (Rows):       ${dailyRowGrowth.toFixed(2)} rows/day`);
    console.log(`Monthly Growth (Size):     ${(dailyGrowthMB * 30).toFixed(2)} MB/month`);
    console.log(`Monthly Growth (Rows):     ${(dailyRowGrowth * 30).toFixed(0)} rows/month`);
    console.log(`Yearly Growth (Size):      ${(dailyGrowthMB * 365).toFixed(2)} MB/year`);
    console.log(`Yearly Growth (Rows):      ${(dailyRowGrowth * 365).toFixed(0)} rows/year\n`);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎯 PROJECTION: 90% CAPACITY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log(`Target Size (90%):         ${targetSizeMB.toFixed(2)} MB (${(targetSizeMB / 1024).toFixed(4)} GB)`);
    console.log(`Remaining Capacity:        ${remainingMB.toFixed(2)} MB\n`);

    console.log(`📅 Estimated Date (Size-based):`);
    console.log(`   ${targetDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`);
    console.log(`   (${Math.ceil(daysTo90Percent)} days from now)\n`);

    console.log(`📅 Estimated Date (Row-based):`);
    console.log(`   ${targetDateByRows.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`);
    console.log(`   (${Math.ceil(daysTo90PercentByRows)} days from now)\n`);

    // 9. Milestone projections
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📅 MILESTONE PROJECTIONS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const milestones = [25, 50, 75, 90];
    milestones.forEach(percent => {
      const milestoneMB = railwayFreeTierMB * (percent / 100);
      const remainingToMilestone = milestoneMB - currentSizeMB;
      if (remainingToMilestone > 0) {
        const daysToMilestone = remainingToMilestone / dailyGrowthMB;
        const milestoneDate = new Date();
        milestoneDate.setDate(milestoneDate.getDate() + daysToMilestone);
        console.log(`${percent}% (${milestoneMB.toFixed(0)} MB): ${milestoneDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} (${Math.ceil(daysToMilestone)} days)`);
      }
    });

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('⚠️  IMPORTANT NOTES');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('• These estimates assume constant growth rate');
    console.log('• Actual growth may vary based on:');
    console.log('  - Business activity changes');
    console.log('  - Data retention policies');
    console.log('  - Index growth (indexes grow faster than data)');
    console.log('  - Data cleanup/archiving');
    console.log('• Indexes typically account for 20-30% of database size');
    console.log('• Consider archiving old data before reaching 80%\n');

    // 10. Recommendations
    if (daysTo90Percent < 365) {
      console.log('⚠️  RECOMMENDATION: You\'ll reach 90% within a year!');
      console.log('   Consider implementing data archiving or upgrading your plan.\n');
    } else if (daysTo90Percent < 730) {
      console.log('💡 RECOMMENDATION: You have about 1-2 years before 90% capacity.');
      console.log('   Plan for data archiving or plan upgrade in the next year.\n');
    } else {
      console.log('✅ RECOMMENDATION: You have plenty of time (>2 years) before 90% capacity.');
      console.log('   Monitor growth quarterly and adjust as needed.\n');
    }

    console.log('✅ Analysis complete!\n');

  } catch (error) {
    console.error('❌ Error analyzing storage growth:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the analysis
estimateStorageGrowth();






