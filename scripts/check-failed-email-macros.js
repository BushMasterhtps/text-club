#!/usr/bin/env node

/**
 * Check which Email Macro rows failed during import
 * Identifies rows missing required fields (Macro Name or Macro)
 */

const fs = require('fs');
const { parse } = require('csv-parse/sync');

function getColumnValue(record, possibleNames) {
  for (const name of possibleNames) {
    // Try exact match
    if (record[name] !== undefined && record[name] !== null && record[name].trim() !== '') {
      return record[name];
    }
    
    // Try case-insensitive match
    const lowerName = name.toLowerCase();
    for (const key in record) {
      if (key.toLowerCase() === lowerName && record[key] !== null && record[key].trim() !== '') {
        return record[key];
      }
    }
  }
  return null;
}

function checkEmailMacros(filePath) {
  try {
    console.log(`📂 Reading CSV file: ${filePath}\n`);
    const csvText = fs.readFileSync(filePath, 'utf8');
    const records = parse(csvText, {
      columns: true,
      skip_empty_lines: false,
      trim: true
    });
    
    console.log(`📊 Total records: ${records.length}\n`);
    
    const failedRows = [];
    
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const rowNumber = i + 2; // +2 because row 1 is header, and arrays are 0-indexed
      
      const macroName = getColumnValue(record, [
        'Macro Name', 'macroName', 'macro_name', 'MacroName', 'Macro name'
      ]);
      const macro = getColumnValue(record, ['Macro', 'macro']);
      
      if (!macroName || !macro) {
        failedRows.push({
          row: rowNumber,
          macroName: macroName || '(empty)',
          macro: macro ? macro.substring(0, 100) + '...' : '(empty)',
          record: record
        });
      }
    }
    
    if (failedRows.length === 0) {
      console.log('✅ All rows have required fields!');
      return;
    }
    
    console.log(`❌ Found ${failedRows.length} rows with missing required fields:\n`);
    console.log('='.repeat(80));
    
    failedRows.forEach((failed, index) => {
      console.log(`\n${index + 1}. Row ${failed.row}:`);
      console.log(`   Macro Name: ${failed.macroName}`);
      console.log(`   Macro: ${failed.macro}`);
      console.log(`   Full record:`, JSON.stringify(failed.record, null, 2));
      console.log('-'.repeat(80));
    });
    
    console.log(`\n\n📋 Summary:`);
    console.log(`   Total rows checked: ${records.length}`);
    console.log(`   Failed rows: ${failedRows.length}`);
    console.log(`   Row numbers: ${failedRows.map(f => f.row).join(', ')}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

const filePath = process.argv[2] || '/Users/Bushmaster JSON/Downloads/Email Macros.csv';

if (!fs.existsSync(filePath)) {
  console.error(`❌ File not found: ${filePath}`);
  console.log('\nUsage: node scripts/check-failed-email-macros.js [path-to-csv]');
  process.exit(1);
}

checkEmailMacros(filePath);

