#!/usr/bin/env node

/**
 * Script to check Railway PostgreSQL database storage usage and statistics
 * 
 * Usage:
 *   node scripts/check-railway-database-storage.js
 * 
 * Or with custom DATABASE_URL:
 *   DATABASE_URL="your-connection-string" node scripts/check-railway-database-storage.js
 */

const { PrismaClient } = require('@prisma/client');

// Use Railway DATABASE_URL from environment or fallback to hardcoded (for reference)
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:OUYdvdsKqOUGwpTWTUUniqINJdjqIBdy@interchange.proxy.rlwy.net:43835/railway';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: DATABASE_URL
    }
  }
});

async function checkDatabaseStorage() {
  try {
    console.log('\n📊 Railway Database Storage & Statistics\n');
    console.log('🔗 Connecting to Railway database...\n');

    // Test connection
    await prisma.$connect();
    console.log('✅ Connected successfully!\n');

    // 1. Database Size
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💾 DATABASE STORAGE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const dbSize = await prisma.$queryRaw`
      SELECT 
        pg_size_pretty(pg_database_size(current_database())) as database_size,
        pg_database_size(current_database()) as database_size_bytes
    `;
    
    // Convert BigInt to Number for calculations
    const dbSizeBytes = Number(dbSize[0].database_size_bytes);
    
    console.log(`📦 Total Database Size: ${dbSize[0].database_size}`);
    console.log(`   (${(dbSizeBytes / 1024 / 1024).toFixed(2)} MB)\n`);

    // 2. Table Sizes (sorted by size)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 TABLE SIZES (sorted by size)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const tableSizes = await prisma.$queryRaw`
      SELECT 
        n.nspname AS schemaname,
        c.relname AS tablename,
        pg_size_pretty(pg_total_relation_size(c.oid)) AS size,
        pg_total_relation_size(c.oid) AS size_bytes,
        pg_size_pretty(pg_relation_size(c.oid)) AS table_size,
        pg_size_pretty(pg_total_relation_size(c.oid) - pg_relation_size(c.oid)) AS indexes_size
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
      ORDER BY pg_total_relation_size(c.oid) DESC
    `;

    let totalTablesSize = 0;
    tableSizes.forEach((table, index) => {
      // Convert BigInt to Number
      const tableSizeBytes = Number(table.size_bytes);
      totalTablesSize += tableSizeBytes;
      console.log(`${(index + 1).toString().padStart(2)}. ${table.tablename.padEnd(30)} ${table.size.padStart(12)} (table: ${table.table_size}, indexes: ${table.indexes_size})`);
    });

    console.log(`\n   Total Tables Size: ${(totalTablesSize / 1024 / 1024).toFixed(2)} MB\n`);

    // 3. Row Counts per Table
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 ROW COUNTS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const rowCounts = await prisma.$queryRaw`
      SELECT 
        c.relname AS tablename,
        (xpath('/row/cnt/text()', xml_count))[1]::text::bigint AS row_count
      FROM (
        SELECT 
          c.oid,
          c.relname,
          n.nspname,
          query_to_xml(format('select count(*) as cnt from %I.%I', n.nspname, c.relname), false, true, '') AS xml_count
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind = 'r'
      ) t
      JOIN pg_class c ON c.oid = t.oid
      ORDER BY (xpath('/row/cnt/text()', xml_count))[1]::text::bigint DESC
    `;

    let totalRows = 0;
    rowCounts.forEach((table, index) => {
      const count = Number(table.row_count);
      totalRows += count;
      const formattedCount = count.toLocaleString();
      console.log(`${(index + 1).toString().padStart(2)}. ${table.tablename.padEnd(30)} ${formattedCount.padStart(15)} rows`);
    });

    console.log(`\n   Total Rows: ${totalRows.toLocaleString()}\n`);

    // 4. Index Sizes
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 INDEX SIZES');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const indexSizes = await prisma.$queryRaw`
      SELECT 
        n.nspname AS schemaname,
        i.relname AS indexname,
        t.relname AS tablename,
        pg_size_pretty(pg_relation_size(i.oid)) AS index_size,
        pg_relation_size(i.oid) AS index_size_bytes
      FROM pg_class i
      JOIN pg_index idx ON idx.indexrelid = i.oid
      JOIN pg_class t ON idx.indrelid = t.oid
      JOIN pg_namespace n ON i.relnamespace = n.oid
      WHERE n.nspname = 'public'
        AND i.relkind = 'i'
      ORDER BY pg_relation_size(i.oid) DESC
      LIMIT 20
    `;

    let totalIndexSize = 0;
    indexSizes.forEach((idxInfo, idx) => {
      // Convert BigInt to Number
      const indexSizeBytes = Number(idxInfo.index_size_bytes);
      totalIndexSize += indexSizeBytes;
      console.log(`${(idx + 1).toString().padStart(2)}. ${idxInfo.indexname.padEnd(50)} ${idxInfo.index_size.padStart(12)} (on ${idxInfo.tablename})`);
    });

    console.log(`\n   Top 20 Indexes Total: ${(totalIndexSize / 1024 / 1024).toFixed(2)} MB\n`);

    // 5. Connection Info
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔌 CONNECTION INFO');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const dbInfo = await prisma.$queryRaw`
      SELECT 
        current_database() as database_name,
        current_user as user_name,
        version() as postgres_version,
        inet_server_addr() as server_address,
        inet_server_port() as server_port
    `;

    console.log(`Database: ${dbInfo[0].database_name}`);
    console.log(`User: ${dbInfo[0].user_name}`);
    console.log(`PostgreSQL Version: ${dbInfo[0].postgres_version.split(' ')[0]} ${dbInfo[0].postgres_version.split(' ')[1]}`);
    console.log(`Server: ${dbInfo[0].server_address || 'N/A'}:${dbInfo[0].server_port || 'N/A'}\n`);

    // 6. Active Connections
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔗 ACTIVE CONNECTIONS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const connections = await prisma.$queryRaw`
      SELECT 
        count(*) as total_connections,
        count(*) FILTER (WHERE state = 'active') as active_connections,
        count(*) FILTER (WHERE state = 'idle') as idle_connections,
        count(*) FILTER (WHERE state = 'idle in transaction') as idle_in_transaction
      FROM pg_stat_activity
      WHERE datname = current_database()
    `;

    const conn = connections[0];
    console.log(`Total Connections: ${conn.total_connections}`);
    console.log(`  Active: ${conn.active_connections}`);
    console.log(`  Idle: ${conn.idle_connections}`);
    console.log(`  Idle in Transaction: ${conn.idle_in_transaction}\n`);

    // 7. Storage Summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📈 STORAGE SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Use already converted values
    const dbSizeMB = dbSizeBytes / 1024 / 1024;
    const tablesSizeMB = totalTablesSize / 1024 / 1024;
    const indexesSizeMB = totalIndexSize / 1024 / 1024;

    console.log(`Total Database Size:     ${dbSizeMB.toFixed(2).padStart(10)} MB`);
    console.log(`Tables Size:            ${tablesSizeMB.toFixed(2).padStart(10)} MB`);
    console.log(`Indexes Size (top 20):  ${indexesSizeMB.toFixed(2).padStart(10)} MB`);
    console.log(`Total Rows:             ${totalRows.toLocaleString().padStart(10)} rows\n`);

    // Railway typically provides 1GB free tier, show percentage if applicable
    const railwayFreeTierGB = 1;
    const usagePercent = (dbSizeMB / 1024 / railwayFreeTierGB) * 100;
    console.log(`💡 Railway Free Tier: ${railwayFreeTierGB}GB`);
    console.log(`   Current Usage: ${usagePercent.toFixed(2)}% of free tier\n`);

    console.log('✅ Storage check complete!\n');

  } catch (error) {
    console.error('❌ Error checking database storage:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the check
checkDatabaseStorage();

