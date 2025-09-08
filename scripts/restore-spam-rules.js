#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Common spam patterns and rules
const commonSpamRules = [
  // Unsubscribe patterns
  { pattern: "unsubscribe", mode: "CONTAINS", note: "Common unsubscribe text" },
  { pattern: "opt out", mode: "CONTAINS", note: "Opt out requests" },
  { pattern: "stop", mode: "LONE", note: "Single word 'stop' command" },
  { pattern: "quit", mode: "LONE", note: "Single word 'quit' command" },
  { pattern: "end", mode: "LONE", note: "Single word 'end' command" },
  { pattern: "cancel", mode: "LONE", note: "Single word 'cancel' command" },
  
  // Marketing/Promotional
  { pattern: "promo", mode: "CONTAINS", note: "Promotional content" },
  { pattern: "discount", mode: "CONTAINS", note: "Discount offers" },
  { pattern: "sale", mode: "CONTAINS", note: "Sale announcements" },
  { pattern: "offer", mode: "CONTAINS", note: "Special offers" },
  { pattern: "deal", mode: "CONTAINS", note: "Deal announcements" },
  { pattern: "limited time", mode: "CONTAINS", note: "Limited time offers" },
  { pattern: "act now", mode: "CONTAINS", note: "Urgent marketing language" },
  { pattern: "don't miss", mode: "CONTAINS", note: "Marketing urgency" },
  
  // Spam indicators
  { pattern: "click here", mode: "CONTAINS", note: "Spam link language" },
  { pattern: "free money", mode: "CONTAINS", note: "Financial spam" },
  { pattern: "make money", mode: "CONTAINS", note: "Money-making schemes" },
  { pattern: "work from home", mode: "CONTAINS", note: "Work from home scams" },
  { pattern: "get rich", mode: "CONTAINS", note: "Get rich quick schemes" },
  { pattern: "no obligation", mode: "CONTAINS", note: "Sales pressure language" },
  
  // Common spam words
  { pattern: "viagra", mode: "CONTAINS", note: "Pharmaceutical spam" },
  { pattern: "casino", mode: "CONTAINS", note: "Gambling spam" },
  { pattern: "lottery", mode: "CONTAINS", note: "Lottery scams" },
  { pattern: "winner", mode: "CONTAINS", note: "Prize winner scams" },
  { pattern: "congratulations", mode: "CONTAINS", note: "Prize notification spam" },
  
  // Short responses (likely spam)
  { pattern: "ok", mode: "LONE", note: "Single word 'ok'" },
  { pattern: "yes", mode: "LONE", note: "Single word 'yes'" },
  { pattern: "no", mode: "LONE", note: "Single word 'no'" },
  { pattern: "thanks", mode: "LONE", note: "Single word 'thanks'" },
  { pattern: "thank you", mode: "LONE", note: "Single word 'thank you'" },
  
  // Test messages
  { pattern: "test", mode: "LONE", note: "Test messages" },
  { pattern: "testing", mode: "LONE", note: "Testing messages" },
  
  // Common spam phrases
  { pattern: "you have won", mode: "CONTAINS", note: "Prize winner notifications" },
  { pattern: "claim your prize", mode: "CONTAINS", note: "Prize claim scams" },
  { pattern: "urgent action required", mode: "CONTAINS", note: "Urgent action spam" },
  { pattern: "verify your account", mode: "CONTAINS", note: "Account verification scams" },
  { pattern: "suspended account", mode: "CONTAINS", note: "Account suspension scams" },
  
  // Phone number patterns (common in spam)
  { pattern: "call now", mode: "CONTAINS", note: "Call now spam" },
  { pattern: "text back", mode: "CONTAINS", note: "Text back spam" },
  { pattern: "reply stop", mode: "CONTAINS", note: "Reply stop instructions" },
  
  // Social media spam
  { pattern: "follow me", mode: "CONTAINS", note: "Social media spam" },
  { pattern: "like my page", mode: "CONTAINS", note: "Social media spam" },
  { pattern: "share this", mode: "CONTAINS", note: "Social media spam" },
  
  // Common spam emojis and symbols
  { pattern: "💰", mode: "CONTAINS", note: "Money emoji spam" },
  { pattern: "🎉", mode: "CONTAINS", note: "Celebration emoji spam" },
  { pattern: "🔥", mode: "CONTAINS", note: "Fire emoji spam" },
  { pattern: "⭐", mode: "CONTAINS", note: "Star emoji spam" },
  
  // URL patterns
  { pattern: "bit.ly", mode: "CONTAINS", note: "Shortened URL spam" },
  { pattern: "tinyurl", mode: "CONTAINS", note: "Shortened URL spam" },
  { pattern: "goo.gl", mode: "CONTAINS", note: "Shortened URL spam" },
];

// Sample learning data (based on common spam patterns)
const sampleLearningData = [
  {
    text: "STOP",
    brand: null,
    isSpam: true,
    score: 95,
    reasons: ["Single word command", "Common unsubscribe pattern"],
    patterns: "LONE:stop",
    source: "manual"
  },
  {
    text: "UNSUBSCRIBE",
    brand: null,
    isSpam: true,
    score: 90,
    reasons: ["Unsubscribe request", "Direct opt-out"],
    patterns: "CONTAINS:unsubscribe",
    source: "manual"
  },
  {
    text: "You have won $1000! Click here to claim your prize!",
    brand: null,
    isSpam: true,
    score: 98,
    reasons: ["Prize winner scam", "Click here language", "Financial promise"],
    patterns: "CONTAINS:you have won,CONTAINS:click here,CONTAINS:prize",
    source: "manual"
  },
  {
    text: "Get rich quick! Work from home and make $5000/week!",
    brand: null,
    isSpam: true,
    score: 97,
    reasons: ["Get rich quick scheme", "Work from home scam", "Unrealistic income promise"],
    patterns: "CONTAINS:get rich,CONTAINS:work from home,CONTAINS:make money",
    source: "manual"
  },
  {
    text: "Free Viagra! Order now and save 50%!",
    brand: null,
    isSpam: true,
    score: 96,
    reasons: ["Pharmaceutical spam", "Free offers", "Percentage discount"],
    patterns: "CONTAINS:viagra,CONTAINS:free,CONTAINS:order now",
    source: "manual"
  },
  {
    text: "Congratulations! You've won our lottery! Claim your prize now!",
    brand: null,
    isSpam: true,
    score: 94,
    reasons: ["Lottery scam", "Congratulations spam", "Prize claim"],
    patterns: "CONTAINS:congratulations,CONTAINS:lottery,CONTAINS:won,CONTAINS:prize",
    source: "manual"
  },
  {
    text: "Urgent: Your account will be suspended. Verify now!",
    brand: null,
    isSpam: true,
    score: 93,
    reasons: ["Account suspension scam", "Urgent action required", "Verification scam"],
    patterns: "CONTAINS:urgent,CONTAINS:suspended,CONTAINS:verify",
    source: "manual"
  },
  {
    text: "Limited time offer! 50% off everything! Act now!",
    brand: null,
    isSpam: true,
    score: 85,
    reasons: ["Limited time pressure", "Percentage discount", "Act now urgency"],
    patterns: "CONTAINS:limited time,CONTAINS:off,CONTAINS:act now",
    source: "manual"
  },
  {
    text: "Follow me on Instagram for daily deals! 💰",
    brand: null,
    isSpam: true,
    score: 80,
    reasons: ["Social media spam", "Money emoji", "Follow request"],
    patterns: "CONTAINS:follow me,CONTAINS:instagram,CONTAINS:💰",
    source: "manual"
  },
  {
    text: "Test message",
    brand: null,
    isSpam: true,
    score: 70,
    reasons: ["Test message", "No real content"],
    patterns: "CONTAINS:test",
    source: "manual"
  }
];

async function restoreSpamRules() {
  try {
    console.log('🔄 Starting spam rules restoration...');
    
    // Clear existing spam rules
    console.log('🗑️ Clearing existing spam rules...');
    await prisma.spamRule.deleteMany({});
    console.log('✅ Cleared existing spam rules');
    
    // Insert common spam rules
    console.log('📝 Inserting common spam rules...');
    let insertedCount = 0;
    
    for (const rule of commonSpamRules) {
      try {
        // Normalize the pattern for patternNorm
        const patternNorm = rule.pattern.toLowerCase().trim();
        
        await prisma.spamRule.create({
          data: {
            pattern: rule.pattern,
            patternNorm: patternNorm,
            mode: rule.mode,
            brand: null, // Global rules
            enabled: true,
            note: rule.note
          }
        });
        insertedCount++;
      } catch (error) {
        if (error.code === 'P2002') {
          console.log(`⚠️ Skipped duplicate rule: ${rule.pattern}`);
        } else {
          console.error(`❌ Error inserting rule "${rule.pattern}":`, error.message);
        }
      }
    }
    
    console.log(`✅ Inserted ${insertedCount} spam rules`);
    
    // Clear existing learning data
    console.log('🗑️ Clearing existing learning data...');
    await prisma.spamLearning.deleteMany({});
    console.log('✅ Cleared existing learning data');
    
    // Insert sample learning data
    console.log('🧠 Inserting sample learning data...');
    let learningCount = 0;
    
    for (const learning of sampleLearningData) {
      try {
        await prisma.spamLearning.create({
          data: {
            text: learning.text,
            brand: learning.brand,
            isSpam: learning.isSpam,
            score: learning.score,
            reasons: learning.reasons,
            patterns: learning.patterns,
            source: learning.source
          }
        });
        learningCount++;
      } catch (error) {
        console.error(`❌ Error inserting learning data:`, error.message);
      }
    }
    
    console.log(`✅ Inserted ${learningCount} learning examples`);
    
    console.log('🎉 Spam rules and learning data restoration completed!');
    console.log(`📊 Summary:`);
    console.log(`   - Spam Rules: ${insertedCount}`);
    console.log(`   - Learning Examples: ${learningCount}`);
    
  } catch (error) {
    console.error('❌ Restoration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

restoreSpamRules();
