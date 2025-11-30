#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function verifyIndex() {
  try {
    console.log('🔍 Checking if Task performance index exists in production...\n');
    
    // Query PostgreSQL system tables to check for the index
    const indexCheck = await prisma.$queryRaw`
      SELECT 
        i.relname AS index_name,
        a.attname AS column_name,
        am.amname AS index_type
      FROM pg_class t
      JOIN pg_index ix ON t.oid = ix.indrelid
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_am am ON i.relam = am.oid
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
      WHERE t.relname = 'Task'
        AND i.relname LIKE '%status%endTime%'
      ORDER BY i.relname, a.attnum;
    `;
    
    if (indexCheck.length === 0) {
      console.log('❌ Index NOT FOUND!');
      console.log('   The composite index on (status, endTime, assignedToId, completedBy) does not exist.');
      console.log('   This explains why the query is slow.');
      console.log('\n💡 Solution: Run the migration on Railway:');
      console.log('   npx prisma migrate deploy');
      return false;
    }
    
    console.log('✅ Index found:');
    indexCheck.forEach(idx => {
      console.log(`   - ${idx.index_name} on column ${idx.column_name} (${idx.index_type})`);
    });
    
    // Check if it's the composite index we need
    const compositeIndex = indexCheck.find(idx => 
      idx.index_name.includes('status') && 
      idx.index_name.includes('endTime')
    );
    
    if (compositeIndex) {
      console.log('\n✅ Composite index exists!');
      console.log('   However, the query might still be slow if:');
      console.log('   1. The index is not being used by the query planner');
      console.log('   2. The dataset is too large (fetching ALL tasks ever)');
      console.log('   3. Statistics are outdated (PostgreSQL needs ANALYZE)');
    }
    
    // Check table statistics
    const stats = await prisma.$queryRaw`
      SELECT 
        n_live_tup AS row_count,
        last_vacuum,
        last_autovacuum,
        last_analyze,
        last_autoanalyze
      FROM pg_stat_user_tables
      WHERE relname = 'Task';
    `;
    
    if (stats.length > 0) {
      console.log('\n📊 Task table statistics:');
      console.log(`   - Row count: ${parseInt(stats[0].row_count).toLocaleString()}`);
      console.log(`   - Last analyzed: ${stats[0].last_autoanalyze || stats[0].last_analyze || 'Never'}`);
      
      if (!stats[0].last_autoanalyze && !stats[0].last_analyze) {
        console.log('   ⚠️  Table has never been analyzed - PostgreSQL may not use the index optimally');
      }
    }
    
    return true;
    
  } catch (error) {
    console.error('❌ Error checking index:', error.message);
    return false;
  } finally {
    await prisma.$disconnect();
  }
}

verifyIndex();

