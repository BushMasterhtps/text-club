/**
 * Script to fix Email Requests tasks that were imported with null values
 * This will re-parse the CSV and update existing tasks with the correct data
 */

const { PrismaClient } = require('@prisma/client');
const { parse } = require('csv-parse/sync');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function fixEmailRequests() {
  try {
    // Read the CSV file
    const csvPath = path.join(__dirname, '../CSV - Email Requests 1.csv');
    
    if (!fs.existsSync(csvPath)) {
      console.error('❌ CSV file not found at:', csvPath);
      console.log('Please place the CSV file in the project root as "CSV - Email Requests 1.csv"');
      return;
    }

    const csvText = fs.readFileSync(csvPath, 'utf-8');
    const records = parse(csvText, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    console.log(`📧 Found ${records.length} records in CSV`);
    
    // Log first record to see column names
    if (records.length > 0) {
      console.log('📋 Available columns:', Object.keys(records[0]));
      console.log('📋 First record sample:', records[0]);
    }

    let updated = 0;
    let notFound = 0;
    let errors = 0;

    for (const [index, record] of records.entries()) {
      try {
        // Find Salesforce Case Number - try multiple variations
        const sfCaseNum = record['SaleForce Case Num'] || 
                         record['SaleForce Case Number (please DO NOT include any other system number) I.E 1234567'] || 
                         record['SaleForce Case Number (please DO NOT include any other system number) I.E. 1234567'] ||
                         record['SaleForce Case Number'] ||
                         Object.keys(record).find(key => 
                           key.toLowerCase().includes('saleforce') && 
                           key.toLowerCase().includes('case')
                         ) ? record[Object.keys(record).find(key => 
                           key.toLowerCase().includes('saleforce') && 
                           key.toLowerCase().includes('case')
                         )] : null;
        
        // Find Email
        const email = record['Email'] || 
                     record['email'] ||
                     Object.keys(record).find(key => key.toLowerCase() === 'email') 
                       ? record[Object.keys(record).find(key => key.toLowerCase() === 'email')] 
                       : null;
        
        // Find Name
        const name = record['Name'] || 
                    record['name'] ||
                    Object.keys(record).find(key => key.toLowerCase() === 'name') 
                      ? record[Object.keys(record).find(key => key.toLowerCase() === 'name')] 
                      : null;
        
        // Find "What is the email request for?"
        const emailRequestFor = record['What is the email request for?'] ||
                               record['what is the email request for?'] ||
                               Object.keys(record).find(key => 
                                 key.toLowerCase().includes('email request for') ||
                                 key.toLowerCase().includes('request for')
                               ) ? record[Object.keys(record).find(key => 
                                 key.toLowerCase().includes('email request for') ||
                                 key.toLowerCase().includes('request for')
                               )] : null;
        
        // Find Details
        const details = record['Details'] ||
                       record['details'] ||
                       Object.keys(record).find(key => key.toLowerCase() === 'details') 
                         ? record[Object.keys(record).find(key => key.toLowerCase() === 'details')] 
                         : null;

        // Try to find the task by email and salesforce case number
        // Or by email and name if case number is not available
        let task = null;
        
        if (email && sfCaseNum && sfCaseNum !== 'N/A') {
          task = await prisma.task.findFirst({
            where: {
              taskType: 'EMAIL_REQUESTS',
              email: email,
              salesforceCaseNumber: sfCaseNum,
            },
          });
        }
        
        // If not found, try by email and name
        if (!task && email && name) {
          task = await prisma.task.findFirst({
            where: {
              taskType: 'EMAIL_REQUESTS',
              email: email,
              text: name,
            },
          });
        }
        
        // If still not found, try by email only (for tasks created around the same time)
        if (!task && email) {
          // Find tasks created on the same day with this email
          const taskDate = record['Start time'] ? new Date(record['Start time']) : null;
          if (taskDate) {
            const startOfDay = new Date(taskDate);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(taskDate);
            endOfDay.setHours(23, 59, 59, 999);
            
            task = await prisma.task.findFirst({
              where: {
                taskType: 'EMAIL_REQUESTS',
                email: email,
                createdAt: {
                  gte: startOfDay,
                  lte: endOfDay,
                },
              },
            });
          }
        }

        if (task) {
          // Update the task with the correct data
          await prisma.task.update({
            where: { id: task.id },
            data: {
              email: email || task.email,
              text: name || task.text,
              salesforceCaseNumber: (sfCaseNum && sfCaseNum !== 'N/A') ? sfCaseNum : task.salesforceCaseNumber,
              emailRequestFor: emailRequestFor || task.emailRequestFor,
              details: details || task.details,
            },
          });
          
          updated++;
          if (index < 5) {
            console.log(`✅ Updated task ${task.id}:`, {
              email: email || task.email,
              name: name || task.text,
              sfCase: (sfCaseNum && sfCaseNum !== 'N/A') ? sfCaseNum : task.salesforceCaseNumber,
            });
          }
        } else {
          notFound++;
          if (index < 5) {
            console.log(`⚠️  Could not find task for:`, {
              email,
              name,
              sfCase: sfCaseNum,
            });
          }
        }
      } catch (error) {
        errors++;
        console.error(`❌ Error processing row ${index + 1}:`, error.message);
      }
    }

    console.log('\n📊 Summary:');
    console.log(`✅ Updated: ${updated}`);
    console.log(`⚠️  Not found: ${notFound}`);
    console.log(`❌ Errors: ${errors}`);

  } catch (error) {
    console.error('❌ Fatal error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixEmailRequests();

