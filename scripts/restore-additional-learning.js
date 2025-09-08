#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Additional learning data for better spam detection
const additionalLearningData = [
  // More unsubscribe patterns
  {
    text: "STOP",
    brand: null,
    isSpam: true,
    score: 95,
    reasons: ["Unsubscribe command", "Single word stop"],
    patterns: "LONE:stop",
    source: "learning"
  },
  {
    text: "QUIT",
    brand: null,
    isSpam: true,
    score: 95,
    reasons: ["Unsubscribe command", "Single word quit"],
    patterns: "LONE:quit",
    source: "learning"
  },
  {
    text: "END",
    brand: null,
    isSpam: true,
    score: 95,
    reasons: ["Unsubscribe command", "Single word end"],
    patterns: "LONE:end",
    source: "learning"
  },
  {
    text: "CANCEL",
    brand: null,
    isSpam: true,
    score: 95,
    reasons: ["Unsubscribe command", "Single word cancel"],
    patterns: "LONE:cancel",
    source: "learning"
  },
  
  // Marketing spam examples
  {
    text: "🔥 HOT DEAL! 70% OFF EVERYTHING! LIMITED TIME! 🔥",
    brand: null,
    isSpam: true,
    score: 92,
    reasons: ["Fire emoji spam", "Percentage discount", "Limited time pressure", "All caps"],
    patterns: "CONTAINS:🔥,CONTAINS:off,CONTAINS:limited time",
    source: "learning"
  },
  {
    text: "💰 Make $5000/week from home! No experience needed!",
    brand: null,
    isSpam: true,
    score: 96,
    reasons: ["Money emoji", "Unrealistic income", "Work from home scam", "No experience needed"],
    patterns: "CONTAINS:💰,CONTAINS:make money,CONTAINS:work from home",
    source: "learning"
  },
  {
    text: "🎉 CONGRATULATIONS! You've won $10,000! Click here to claim!",
    brand: null,
    isSpam: true,
    score: 98,
    reasons: ["Celebration emoji", "Congratulations spam", "Prize winner scam", "Click here language"],
    patterns: "CONTAINS:🎉,CONTAINS:congratulations,CONTAINS:won,CONTAINS:click here",
    source: "learning"
  },
  
  // Short responses that are likely spam
  {
    text: "OK",
    brand: null,
    isSpam: true,
    score: 75,
    reasons: ["Single word response", "No context"],
    patterns: "LONE:ok",
    source: "learning"
  },
  {
    text: "YES",
    brand: null,
    isSpam: true,
    score: 75,
    reasons: ["Single word response", "No context"],
    patterns: "LONE:yes",
    source: "learning"
  },
  {
    text: "NO",
    brand: null,
    isSpam: true,
    score: 75,
    reasons: ["Single word response", "No context"],
    patterns: "LONE:no",
    source: "learning"
  },
  {
    text: "THANKS",
    brand: null,
    isSpam: true,
    score: 70,
    reasons: ["Single word response", "No context"],
    patterns: "LONE:thanks",
    source: "learning"
  },
  
  // Test messages
  {
    text: "TEST",
    brand: null,
    isSpam: true,
    score: 80,
    reasons: ["Test message", "No real content"],
    patterns: "LONE:test",
    source: "learning"
  },
  {
    text: "TESTING",
    brand: null,
    isSpam: true,
    score: 80,
    reasons: ["Test message", "No real content"],
    patterns: "LONE:testing",
    source: "learning"
  },
  
  // Common spam phrases
  {
    text: "URGENT: Your account will be suspended in 24 hours!",
    brand: null,
    isSpam: true,
    score: 94,
    reasons: ["Urgent action required", "Account suspension scam", "Time pressure"],
    patterns: "CONTAINS:urgent,CONTAINS:suspended",
    source: "learning"
  },
  {
    text: "Verify your account now or lose access forever!",
    brand: null,
    isSpam: true,
    score: 93,
    reasons: ["Account verification scam", "Threat of losing access"],
    patterns: "CONTAINS:verify,CONTAINS:account",
    source: "learning"
  },
  {
    text: "You have been selected for a special offer!",
    brand: null,
    isSpam: true,
    score: 88,
    reasons: ["Selected for offer", "Special offer language"],
    patterns: "CONTAINS:selected,CONTAINS:special offer",
    source: "learning"
  },
  
  // Social media spam
  {
    text: "Follow me for daily inspiration! 💫",
    brand: null,
    isSpam: true,
    score: 82,
    reasons: ["Social media spam", "Follow request", "Star emoji"],
    patterns: "CONTAINS:follow me,CONTAINS:💫",
    source: "learning"
  },
  {
    text: "Like my page and win prizes! 🏆",
    brand: null,
    isSpam: true,
    score: 85,
    reasons: ["Social media spam", "Like request", "Prize promise", "Trophy emoji"],
    patterns: "CONTAINS:like my page,CONTAINS:win,CONTAINS:🏆",
    source: "learning"
  },
  
  // URL spam
  {
    text: "Check this out: bit.ly/amazing-deal",
    brand: null,
    isSpam: true,
    score: 90,
    reasons: ["Shortened URL", "Suspicious link"],
    patterns: "CONTAINS:bit.ly",
    source: "learning"
  },
  {
    text: "Click here for free money: tinyurl.com/free-cash",
    brand: null,
    isSpam: true,
    score: 96,
    reasons: ["Click here language", "Free money promise", "Shortened URL"],
    patterns: "CONTAINS:click here,CONTAINS:free money,CONTAINS:tinyurl",
    source: "learning"
  },
  
  // Legitimate messages (not spam) - for contrast
  {
    text: "Hi, I'm interested in your product. Can you tell me more about pricing?",
    brand: null,
    isSpam: false,
    score: 10,
    reasons: ["Legitimate inquiry", "Product question", "Pricing request"],
    patterns: "LEGITIMATE:product inquiry",
    source: "learning"
  },
  {
    text: "Thank you for your help with my order. Everything arrived perfectly!",
    brand: null,
    isSpam: false,
    score: 5,
    reasons: ["Customer feedback", "Order confirmation", "Positive response"],
    patterns: "LEGITIMATE:customer feedback",
    source: "learning"
  },
  {
    text: "I have a question about my recent purchase. Order #12345",
    brand: null,
    isSpam: false,
    score: 8,
    reasons: ["Customer service inquiry", "Order reference", "Legitimate question"],
    patterns: "LEGITIMATE:customer service",
    source: "learning"
  },
  {
    text: "Can you help me track my shipment?",
    brand: null,
    isSpam: false,
    score: 12,
    reasons: ["Shipping inquiry", "Customer service request"],
    patterns: "LEGITIMATE:shipping inquiry",
    source: "learning"
  },
  {
    text: "I'd like to return this item. What's the process?",
    brand: null,
    isSpam: false,
    score: 10,
    reasons: ["Return request", "Customer service inquiry"],
    patterns: "LEGITIMATE:return request",
    source: "learning"
  }
];

async function restoreAdditionalLearning() {
  try {
    console.log('🔄 Starting additional learning data restoration...');
    
    // Insert additional learning data
    console.log('🧠 Inserting additional learning data...');
    let learningCount = 0;
    
    for (const learning of additionalLearningData) {
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
        if (error.code === 'P2002') {
          console.log(`⚠️ Skipped duplicate learning example: ${learning.text.substring(0, 50)}...`);
        } else {
          console.error(`❌ Error inserting learning data:`, error.message);
        }
      }
    }
    
    console.log(`✅ Inserted ${learningCount} additional learning examples`);
    
    // Show summary
    const totalRules = await prisma.spamRule.count();
    const totalLearning = await prisma.spamLearning.count();
    
    console.log('🎉 Additional learning data restoration completed!');
    console.log(`📊 Current totals:`);
    console.log(`   - Spam Rules: ${totalRules}`);
    console.log(`   - Learning Examples: ${totalLearning}`);
    
  } catch (error) {
    console.error('❌ Restoration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

restoreAdditionalLearning();
