/**
 * Script to test if the database index is working correctly
 * Run with: node scripts/test-index-performance.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testIndexPerformance() {
  console.log('🔍 Testing Database Index Performance...\n');

  try {
    // 1. Check if index exists
    console.log('1. Checking if index exists...');
    const indexCheck = await prisma.$queryRaw`
      SELECT indexname, indexdef 
      FROM pg_indexes 
      WHERE tablename = 'Task' 
      AND indexname LIKE '%status_endTime%'
    `;
    
    if (indexCheck.length === 0) {
      console.log('❌ Index not found! Migration may not have run.');
      return;
    }
    
    console.log('✅ Index found:');
    console.log(`   ${indexCheck[0].indexname}`);
    console.log('');

    // 2. Get table statistics
    console.log('2. Getting table statistics...');
    const stats = await prisma.$queryRaw`
      SELECT 
        COUNT(*) as total_tasks,
        COUNT(*) FILTER (WHERE status = 'COMPLETED' AND "endTime" IS NOT NULL) as completed_tasks
      FROM "Task"
    `;
    
    console.log(`   Total tasks: ${stats[0].total_tasks}`);
    console.log(`   Completed tasks (with endTime): ${stats[0].completed_tasks}`);
    console.log('');

    // 3. Test query performance
    console.log('3. Testing query performance...');
    console.log('   Running query (this may take a moment)...');
    
    const startTime = Date.now();
    
    const result = await prisma.$queryRaw`
      SELECT "Task"."id", "Task"."assignedToId", "Task"."completedBy", 
             "Task"."endTime", "Task"."startTime", "Task"."taskType", 
             "Task"."disposition"
      FROM "Task"
      WHERE (
        "Task"."status" = 'COMPLETED' 
        AND "Task"."endTime" IS NOT NULL 
        AND ("Task"."assignedToId" IS NOT NULL OR "Task"."completedBy" IS NOT NULL)
      )
      LIMIT 1000
    `;
    
    const queryTime = Date.now() - startTime;
    console.log(`   Query returned ${result.length} rows`);
    console.log(`   Query time: ${queryTime}ms`);
    
    if (queryTime < 500) {
      console.log('   ✅ Excellent! Query is fast (< 500ms)');
    } else if (queryTime < 2000) {
      console.log('   ⚠️  Query is acceptable but could be faster');
    } else {
      console.log('   ❌ Query is slow (> 2000ms) - index may not be working');
    }
    console.log('');

    // 4. Check query execution plan
    console.log('4. Checking query execution plan...');
    const explainResult = await prisma.$queryRaw`
      EXPLAIN ANALYZE
      SELECT "Task"."id", "Task"."assignedToId", "Task"."completedBy", 
             "Task"."endTime", "Task"."startTime", "Task"."taskType", 
             "Task"."disposition"
      FROM "Task"
      WHERE (
        "Task"."status" = 'COMPLETED' 
        AND "Task"."endTime" IS NOT NULL 
        AND ("Task"."assignedToId" IS NOT NULL OR "Task"."completedBy" IS NOT NULL)
      )
      LIMIT 1000
    `;
    
    const planText = explainResult.map(r => r['QUERY PLAN']).join('\n');
    
    if (planText.includes('Index Scan')) {
      console.log('   ✅ Index is being used! (Index Scan detected)');
      if (planText.includes('Task_status_endTime_assignedToId_completedBy_idx')) {
        console.log('   ✅ Correct index is being used!');
      }
    } else if (planText.includes('Seq Scan')) {
      console.log('   ❌ Sequential scan detected - index may not be working');
      console.log('   This could mean:');
      console.log('     - Index not created');
      console.log('     - Query planner chose seq scan (rare with proper index)');
      console.log('     - Dataset is too small for index to be beneficial');
    }
    
    // Extract execution time from plan
    const executionTimeMatch = planText.match(/Execution Time: ([\d.]+) ms/);
    if (executionTimeMatch) {
      const execTime = parseFloat(executionTimeMatch[1]);
      console.log(`   Execution time from plan: ${execTime.toFixed(2)}ms`);
      
      if (execTime < 200) {
        console.log('   ✅ Excellent performance!');
      } else if (execTime < 1000) {
        console.log('   ⚠️  Good performance, but could be better');
      } else {
        console.log('   ❌ Performance is poor - investigate further');
      }
    }
    
    console.log('\n📊 Summary:');
    console.log('   - Index exists: ✅');
    console.log(`   - Query time: ${queryTime}ms`);
    console.log(`   - Rows returned: ${result.length}`);
    console.log(`   - Index usage: ${planText.includes('Index Scan') ? '✅ Yes' : '❌ No'}`);
    
    if (queryTime < 500 && planText.includes('Index Scan')) {
      console.log('\n🎉 SUCCESS! Index is working correctly!');
    } else {
      console.log('\n⚠️  Index may not be working optimally. Check the details above.');
    }

  } catch (error) {
    console.error('❌ Error testing index:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testIndexPerformance();

