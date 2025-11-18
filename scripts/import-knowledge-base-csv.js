#!/usr/bin/env node

/**
 * Direct CSV import script for Knowledge Base resources
 * Bypasses API timeouts by importing directly into the database
 * 
 * Usage:
 *   node scripts/import-knowledge-base-csv.js email-macros path/to/file.csv
 *   node scripts/import-knowledge-base-csv.js text-club-macros path/to/file.csv
 *   node scripts/import-knowledge-base-csv.js product-inquiry-qa path/to/file.csv
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

// Use Railway's DATABASE_URL (production)
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'postgresql://postgres:OUYdvdsKqOUGwpTWTUUniqINJdjqIBdy@interchange.proxy.rlwy.net:43835/railway'
    }
  }
});

const RESOURCE_TYPES = {
  'email-macros': {
    model: 'emailMacro',
    requiredFields: ['Macro Name', 'Macro'],
    optionalFields: ['Case Type/Subcategory', 'Brand', 'What the macro is for']
  },
  'text-club-macros': {
    model: 'textClubMacro',
    requiredFields: ['Macro Name', 'Macro Details'],
    optionalFields: []
  },
  'product-inquiry-qa': {
    model: 'productInquiryQA',
    requiredFields: ['Brand', 'Product', 'Question', 'Answer'],
    optionalFields: []
  }
};

function parseCSV(filePath) {
  try {
    const csvText = fs.readFileSync(filePath, 'utf8');
    const records = parse(csvText, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });
    return records;
  } catch (error) {
    console.error(`❌ Error reading CSV file: ${error.message}`);
    process.exit(1);
  }
}

function normalizeColumnName(name) {
  // Try various column name formats
  const variations = [
    name,
    name.trim(),
    name.replace(/\s+/g, ' '),
    name.replace(/\s*\/\s*/g, '/'),
    name.replace(/\s*\/\s*/g, ' / ')
  ];
  return variations;
}

function getColumnValue(record, possibleNames) {
  for (const name of possibleNames) {
    // Try exact match
    if (record[name] !== undefined) return record[name];
    
    // Try case-insensitive match
    const lowerName = name.toLowerCase();
    for (const key in record) {
      if (key.toLowerCase() === lowerName) {
        return record[key];
      }
    }
  }
  return null;
}

async function importEmailMacros(records) {
  console.log(`\n📧 Importing ${records.length} Email Macros...\n`);
  
  const dataToInsert = [];
  let errors = 0;
  const errorDetails = [];
  
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    try {
      const macroName = getColumnValue(record, [
        'Macro Name', 'macroName', 'macro_name', 'MacroName', 'Macro name'
      ]);
      const macro = getColumnValue(record, ['Macro', 'macro']);
      const caseType = getColumnValue(record, [
        'Case Type/Subcategory', 'Case Type/ Subcategory', 'Case Type', 
        'caseType', 'case_type', 'CaseType'
      ]);
      const brand = getColumnValue(record, ['Brand', 'brand']);
      const description = getColumnValue(record, [
        'What the macro is for', 'Description', 'description', 'What the macro is for '
      ]);
      
      if (!macroName || !macro) {
        errors++;
        errorDetails.push(`Row ${i + 2}: Missing required fields (Macro Name or Macro)`);
        continue;
      }
      
      dataToInsert.push({
        macroName: macroName.trim(),
        macro: macro.trim(),
        caseType: caseType ? caseType.trim() : null,
        brand: brand ? brand.trim() : null,
        description: description ? description.trim() : null
      });
    } catch (error) {
      errors++;
      errorDetails.push(`Row ${i + 2}: ${error.message}`);
    }
  }
  
  if (dataToInsert.length === 0) {
    console.log('❌ No valid records to import');
    return;
  }
  
  // Batch insert
  const BATCH_SIZE = 100;
  let imported = 0;
  
  for (let i = 0; i < dataToInsert.length; i += BATCH_SIZE) {
    const batch = dataToInsert.slice(i, i + BATCH_SIZE);
    try {
      const result = await prisma.emailMacro.createMany({
        data: batch,
        skipDuplicates: true
      });
      imported += result.count;
      console.log(`  ✓ Imported batch ${Math.floor(i / BATCH_SIZE) + 1}: ${result.count} items`);
    } catch (error) {
      console.error(`  ✗ Error importing batch ${Math.floor(i / BATCH_SIZE) + 1}:`, error.message);
      // Try individual inserts
      for (const item of batch) {
        try {
          await prisma.emailMacro.create({ data: item });
          imported++;
        } catch (individualError) {
          errors++;
          errorDetails.push(`Row ${i + 2}: ${individualError.message}`);
        }
      }
    }
  }
  
  console.log(`\n✅ Imported: ${imported}`);
  console.log(`❌ Errors: ${errors}`);
  if (errorDetails.length > 0) {
    console.log(`\nError details (first 10):`);
    errorDetails.slice(0, 10).forEach(detail => console.log(`  - ${detail}`));
  }
}

async function importTextClubMacros(records) {
  console.log(`\n💬 Importing ${records.length} Text Club Macros...\n`);
  
  const dataToInsert = [];
  let errors = 0;
  const errorDetails = [];
  
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    try {
      const macroName = getColumnValue(record, [
        'Macro Name', 'macroName', 'macro_name', 'MacroName'
      ]);
      const macroDetails = getColumnValue(record, [
        'Macro Details', 'macroDetails', 'macro_details', 'MacroDetails', 
        'Macro', 'macro'
      ]);
      
      if (!macroName || !macroDetails) {
        errors++;
        errorDetails.push(`Row ${i + 2}: Missing required fields (Macro Name or Macro Details)`);
        continue;
      }
      
      dataToInsert.push({
        macroName: macroName.trim(),
        macroDetails: macroDetails.trim()
      });
    } catch (error) {
      errors++;
      errorDetails.push(`Row ${i + 2}: ${error.message}`);
    }
  }
  
  if (dataToInsert.length === 0) {
    console.log('❌ No valid records to import');
    return;
  }
  
  // Batch insert
  const BATCH_SIZE = 100;
  let imported = 0;
  
  for (let i = 0; i < dataToInsert.length; i += BATCH_SIZE) {
    const batch = dataToInsert.slice(i, i + BATCH_SIZE);
    try {
      const result = await prisma.textClubMacro.createMany({
        data: batch,
        skipDuplicates: true
      });
      imported += result.count;
      console.log(`  ✓ Imported batch ${Math.floor(i / BATCH_SIZE) + 1}: ${result.count} items`);
    } catch (error) {
      console.error(`  ✗ Error importing batch ${Math.floor(i / BATCH_SIZE) + 1}:`, error.message);
      // Try individual inserts
      for (const item of batch) {
        try {
          await prisma.textClubMacro.create({ data: item });
          imported++;
        } catch (individualError) {
          errors++;
          errorDetails.push(`Row ${i + 2}: ${individualError.message}`);
        }
      }
    }
  }
  
  console.log(`\n✅ Imported: ${imported}`);
  console.log(`❌ Errors: ${errors}`);
  if (errorDetails.length > 0) {
    console.log(`\nError details (first 10):`);
    errorDetails.slice(0, 10).forEach(detail => console.log(`  - ${detail}`));
  }
}

async function importProductInquiryQA(records) {
  console.log(`\n❓ Importing ${records.length} Product Inquiry QAs...\n`);
  
  const dataToInsert = [];
  let errors = 0;
  const errorDetails = [];
  
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    try {
      const brand = getColumnValue(record, ['Brand', 'brand']);
      const product = getColumnValue(record, ['Product', 'product']);
      const question = getColumnValue(record, ['Question', 'question']);
      const answer = getColumnValue(record, ['Answer', 'answer']);
      
      if (!brand || !product || !question || !answer) {
        errors++;
        errorDetails.push(`Row ${i + 2}: Missing required fields (Brand, Product, Question, or Answer)`);
        continue;
      }
      
      dataToInsert.push({
        brand: brand.trim(),
        product: product.trim(),
        question: question.trim(),
        answer: answer.trim()
      });
    } catch (error) {
      errors++;
      errorDetails.push(`Row ${i + 2}: ${error.message}`);
    }
  }
  
  if (dataToInsert.length === 0) {
    console.log('❌ No valid records to import');
    return;
  }
  
  // Batch insert
  const BATCH_SIZE = 100;
  let imported = 0;
  
  for (let i = 0; i < dataToInsert.length; i += BATCH_SIZE) {
    const batch = dataToInsert.slice(i, i + BATCH_SIZE);
    try {
      const result = await prisma.productInquiryQA.createMany({
        data: batch,
        skipDuplicates: true
      });
      imported += result.count;
      console.log(`  ✓ Imported batch ${Math.floor(i / BATCH_SIZE) + 1}: ${result.count} items`);
    } catch (error) {
      console.error(`  ✗ Error importing batch ${Math.floor(i / BATCH_SIZE) + 1}:`, error.message);
      // Try individual inserts
      for (const item of batch) {
        try {
          await prisma.productInquiryQA.create({ data: item });
          imported++;
        } catch (individualError) {
          errors++;
          errorDetails.push(`Row ${i + 2}: ${individualError.message}`);
        }
      }
    }
  }
  
  console.log(`\n✅ Imported: ${imported}`);
  console.log(`❌ Errors: ${errors}`);
  if (errorDetails.length > 0) {
    console.log(`\nError details (first 10):`);
    errorDetails.slice(0, 10).forEach(detail => console.log(`  - ${detail}`));
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('Usage: node scripts/import-knowledge-base-csv.js <resource-type> <csv-file-path>');
    console.log('\nResource types:');
    console.log('  - email-macros');
    console.log('  - text-club-macros');
    console.log('  - product-inquiry-qa');
    console.log('\nExample:');
    console.log('  node scripts/import-knowledge-base-csv.js email-macros ./data/email-macros.csv');
    process.exit(1);
  }
  
  const [resourceType, filePath] = args;
  
  if (!RESOURCE_TYPES[resourceType]) {
    console.error(`❌ Invalid resource type: ${resourceType}`);
    console.log('Valid types: email-macros, text-club-macros, product-inquiry-qa');
    process.exit(1);
  }
  
  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    process.exit(1);
  }
  
  try {
    console.log(`📂 Reading CSV file: ${filePath}`);
    const records = parseCSV(filePath);
    console.log(`📊 Found ${records.length} records`);
    
    // Show first record as sample
    if (records.length > 0) {
      console.log('\n📋 Sample record (first row):');
      console.log(JSON.stringify(records[0], null, 2));
    }
    
    // Import based on resource type
    if (resourceType === 'email-macros') {
      await importEmailMacros(records);
    } else if (resourceType === 'text-club-macros') {
      await importTextClubMacros(records);
    } else if (resourceType === 'product-inquiry-qa') {
      await importProductInquiryQA(records);
    }
    
    console.log('\n✅ Import completed!');
    
  } catch (error) {
    console.error('❌ Import failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

