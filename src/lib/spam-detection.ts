// Advanced spam detection using pattern analysis and learning
import { prisma } from './prisma';

export interface SpamPattern {
  type: 'word_frequency' | 'character_pattern' | 'length_pattern' | 'structure_pattern';
  pattern: string;
  confidence: number;
  examples: string[];
}

export interface SpamScore {
  score: number; // 0-100, higher = more likely spam
  reasons: string[];
  patterns: SpamPattern[];
}

/**
 * Analyze text for spam patterns without using external APIs
 */
export function analyzeSpamPatterns(text: string): SpamScore {
  const reasons: string[] = [];
  const patterns: SpamPattern[] = [];
  let score = 0;

  // 1. Character pattern analysis
  const charAnalysis = analyzeCharacterPatterns(text);
  if (charAnalysis.score > 0) {
    score += charAnalysis.score;
    reasons.push(...charAnalysis.reasons);
    patterns.push(...charAnalysis.patterns);
  }

  // 2. Length and structure analysis
  const structureAnalysis = analyzeStructurePatterns(text);
  if (structureAnalysis.score > 0) {
    score += structureAnalysis.score;
    reasons.push(...structureAnalysis.reasons);
    patterns.push(...structureAnalysis.patterns);
  }

  // 3. Word frequency analysis
  const wordAnalysis = analyzeWordPatterns(text);
  if (wordAnalysis.score > 0) {
    score += wordAnalysis.score;
    reasons.push(...wordAnalysis.reasons);
    patterns.push(...wordAnalysis.patterns);
  }

  // 4. Common spam indicators
  const spamIndicators = analyzeSpamIndicators(text);
  if (spamIndicators.score > 0) {
    score += spamIndicators.score;
    reasons.push(...spamIndicators.reasons);
    patterns.push(...spamIndicators.patterns);
  }

  return {
    score: Math.min(score, 100),
    reasons,
    patterns
  };
}

function analyzeCharacterPatterns(text: string): { score: number; reasons: string[]; patterns: SpamPattern[] } {
  const reasons: string[] = [];
  const patterns: SpamPattern[] = [];
  let score = 0;

  // Excessive special characters (more aggressive)
  const specialCharRatio = (text.match(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/g) || []).length / text.length;
  if (specialCharRatio > 0.2) { // Lowered from 0.3 to catch more
    score += 30; // Increased from 25
    reasons.push(`High special character ratio: ${(specialCharRatio * 100).toFixed(1)}%`);
    patterns.push({
      type: 'character_pattern',
      pattern: 'excessive_special_chars',
      confidence: specialCharRatio * 100,
      examples: [text.substring(0, 50) + '...']
    });
  }
  
  // Gibberish detection - random characters and symbols mixed together
  // Pattern: lots of special chars, numbers, and letters in random order
  const gibberishPattern = /[a-z]{1,2}[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?0-9]{2,}[a-z]{1,2}/i;
  const hasGibberishPattern = gibberishPattern.test(text) && specialCharRatio > 0.15;
  if (hasGibberishPattern) {
    score += 40; // High score for obvious gibberish
    reasons.push('Gibberish pattern detected (random chars/symbols)');
    patterns.push({
      type: 'character_pattern',
      pattern: 'gibberish',
      confidence: 95,
      examples: [text.substring(0, 50) + '...']
    });
  }

  // Excessive numbers
  const numberRatio = (text.match(/\d/g) || []).length / text.length;
  if (numberRatio > 0.4) {
    score += 20;
    reasons.push(`High number ratio: ${(numberRatio * 100).toFixed(1)}%`);
    patterns.push({
      type: 'character_pattern',
      pattern: 'excessive_numbers',
      confidence: numberRatio * 100,
      examples: [text.substring(0, 50) + '...']
    });
  }

  // Repeated characters
  const repeatedChars = text.match(/(.)\1{3,}/g);
  if (repeatedChars && repeatedChars.length > 0) {
    score += 15;
    reasons.push(`Repeated characters: ${repeatedChars.join(', ')}`);
    patterns.push({
      type: 'character_pattern',
      pattern: 'repeated_chars',
      confidence: 80,
      examples: repeatedChars
    });
  }

  // All caps
  if (text === text.toUpperCase() && text.length > 10) {
    score += 10;
    reasons.push('All caps text');
    patterns.push({
      type: 'character_pattern',
      pattern: 'all_caps',
      confidence: 70,
      examples: [text.substring(0, 50) + '...']
    });
  }

  return { score, reasons, patterns };
}

function analyzeStructurePatterns(text: string): { score: number; reasons: string[]; patterns: SpamPattern[] } {
  const reasons: string[] = [];
  const patterns: SpamPattern[] = [];
  let score = 0;

  // Very short messages (but don't double-count if it's already a random number)
  const isOnlyNumbers = /^\d+$/.test(text.trim());
  if (text.length < 5 && !isOnlyNumbers) {
    score += 20; // Increased from 15
    reasons.push('Very short message');
    patterns.push({
      type: 'length_pattern',
      pattern: 'very_short',
      confidence: 70, // Increased confidence
      examples: [text]
    });
  }
  
  // Very short messages that are ONLY numbers get extra boost
  if (text.length < 5 && isOnlyNumbers) {
    score += 25; // Extra boost for short number-only messages
    reasons.push('Very short number-only message');
    patterns.push({
      type: 'length_pattern',
      pattern: 'very_short_numbers',
      confidence: 95,
      examples: [text]
    });
  }

  // Very long messages
  if (text.length > 500) {
    score += 10;
    reasons.push('Very long message');
    patterns.push({
      type: 'length_pattern',
      pattern: 'very_long',
      confidence: 40,
      examples: [text.substring(0, 100) + '...']
    });
  }

  // No spaces (likely gibberish)
  if (!text.includes(' ') && text.length > 20) {
    score += 20;
    reasons.push('No spaces in long text');
    patterns.push({
      type: 'structure_pattern',
      pattern: 'no_spaces',
      confidence: 80,
      examples: [text.substring(0, 50) + '...']
    });
  }

  // Excessive punctuation
  const punctuationCount = (text.match(/[.!?]/g) || []).length;
  if (punctuationCount > 5) {
    score += 15;
    reasons.push(`Excessive punctuation: ${punctuationCount} sentences`);
    patterns.push({
      type: 'structure_pattern',
      pattern: 'excessive_punctuation',
      confidence: 70,
      examples: [text.substring(0, 100) + '...']
    });
  }

  // Random numbers/strings (e.g., "23345", "123456", "113", "4", "2", "1")
  const onlyNumbers = /^\d+$/.test(text.trim());
  if (onlyNumbers) {
    // Single digit numbers (1-9) are almost always spam
    if (text.trim().length === 1) {
      score += 100; // Maximum score for single digit numbers
      reasons.push('Single digit number (almost always spam)');
      patterns.push({
        type: 'structure_pattern',
        pattern: 'single_digit_number',
        confidence: 100,
        examples: [text]
      });
    } else if (text.length >= 2 && text.length <= 20) {
      score += 50; // Increased from 35 for multi-digit numbers
      reasons.push('Random number sequence');
      patterns.push({
        type: 'structure_pattern',
        pattern: 'random_numbers',
        confidence: 95, // Increased confidence
        examples: [text]
      });
    }
  }
  
  // Very short random strings (1-2 characters that aren't common words or numbers)
  const legitimateShortWords = ['ok', 'okay', 'yes', 'no', 'hi', 'yo', 'yu'];
  const isNumber = /^\d+$/.test(text.trim());
  if (text.trim().length <= 2 && !legitimateShortWords.includes(text.trim().toLowerCase()) && !isNumber) {
    score += 40; // Increased from 30 for very short random strings
    reasons.push('Very short random string');
    patterns.push({
      type: 'structure_pattern',
      pattern: 'very_short_random',
      confidence: 90, // Increased confidence
      examples: [text]
    });
  }

  // Single word with no context (e.g., "Purr", "Ok", "B h")
  // BUT exclude common legitimate single-word responses
  const words = text.trim().split(/\s+/);
  const legitimateSingleWords = ['ok', 'okay', 'yes', 'no', 'thanks', 'thank you', 'y', 'n', 'hi', 'hello'];
  const isLegitimateSingleWord = words.length === 1 && legitimateSingleWords.includes(words[0].toLowerCase());
  
  if (words.length <= 2 && text.length < 20 && !text.match(/[.!?]$/) && !isLegitimateSingleWord) {
    // Check if it looks like incomplete message or single word spam
    const hasMeaningfulContent = words.some(w => w.length > 3);
    // Don't flag common words like "DOG" if they're likely part of a product inquiry
    const isCommonProductWord = /dog|cat|food|treat|order|product/i.test(text);
    
    if (!hasMeaningfulContent || (words.length === 1 && !isCommonProductWord)) {
      score += 15; // Reduced from 20 to be less aggressive
      reasons.push('Single word or incomplete message');
      patterns.push({
        type: 'structure_pattern',
        pattern: 'single_word_no_context',
        confidence: 60, // Reduced confidence
        examples: [text]
      });
    }
  }

  // Personal conversation patterns (e.g., "Just got home", "Are u at", "Sweet dreams")
  // BUT exclude legitimate auto-replies that contain business context
  const personalPatterns = [
    /just got home/i,
    /are u at/i,
    /sweet dreams/i,
    /leaving now/i,
    /thinking about you/i,
    /made it home/i
  ];
  
  // More aggressive patterns that need business context check
  const aggressivePersonalPatterns = [
    /i'm driving/i,
    /sent from my/i
  ];
  
  // Check for business context (order, food, product, subscription, etc.)
  const hasBusinessContext = /order|food|product|subscription|delivery|ship|purchase|buy|payment|refund|customer|service/i.test(text);
  
  // Only flag as personal if it matches AND has no business context
  const hasPersonalPattern = personalPatterns.some(pattern => pattern.test(text));
  const hasAggressivePattern = aggressivePersonalPatterns.some(pattern => pattern.test(text));
  
  if (hasPersonalPattern && !hasBusinessContext) {
    score += 30;
    reasons.push('Personal conversation pattern detected');
    patterns.push({
      type: 'structure_pattern',
      pattern: 'personal_conversation',
      confidence: 80,
      examples: [text.substring(0, 50) + '...']
    });
  } else if (hasAggressivePattern && !hasBusinessContext) {
    // Auto-replies like "I'm driving" are less suspicious if they have business context
    score += 15; // Reduced score for auto-replies
    reasons.push('Auto-reply pattern detected (low confidence)');
    patterns.push({
      type: 'structure_pattern',
      pattern: 'auto_reply',
      confidence: 50,
      examples: [text.substring(0, 50) + '...']
    });
  }

  // Incomplete messages (ends abruptly, no punctuation, very short)
  if (text.length < 15 && !text.match(/[.!?]$/) && words.length <= 3) {
    score += 15;
    reasons.push('Incomplete message');
    patterns.push({
      type: 'structure_pattern',
      pattern: 'incomplete_message',
      confidence: 65,
      examples: [text]
    });
  }

  return { score, reasons, patterns };
}

function analyzeWordPatterns(text: string): { score: number; reasons: string[]; patterns: SpamPattern[] } {
  const reasons: string[] = [];
  const patterns: SpamPattern[] = [];
  let score = 0;

  const words = text.toLowerCase().split(/\s+/);
  const wordCount = words.length;

  // Common spam words (expanded list)
  const spamWords = [
    'free', 'win', 'congratulations', 'urgent', 'limited time', 'act now',
    'click here', 'unsubscribe', 'opt out', 'special offer', 'deal',
    'discount', 'save', 'money', 'cash', 'prize', 'winner', 'selected',
    'guaranteed', 'risk free', 'no obligation', 'call now', 'text stop',
    'unlock', 'unlock!', 'unlock now', 'claim', 'claim now', 'click',
    'limited', 'exclusive', 'offer expires', 'act fast', 'hurry'
  ];

  const foundSpamWords = words.filter(word => 
    spamWords.some(spamWord => word.includes(spamWord))
  );

  if (foundSpamWords.length > 0) {
    score += foundSpamWords.length * 8;
    reasons.push(`Spam words detected: ${foundSpamWords.join(', ')}`);
    patterns.push({
      type: 'word_frequency',
      pattern: 'spam_words',
      confidence: Math.min(foundSpamWords.length * 20, 90),
      examples: foundSpamWords
    });
  }

  // Repetitive words
  const wordFreq: Record<string, number> = {};
  words.forEach(word => {
    wordFreq[word] = (wordFreq[word] || 0) + 1;
  });

  const repetitiveWords = Object.entries(wordFreq)
    .filter(([_, count]) => count > 2)
    .map(([word, count]) => ({ word, count }));

  if (repetitiveWords.length > 0) {
    score += repetitiveWords.length * 5;
    reasons.push(`Repetitive words: ${repetitiveWords.map(r => `${r.word}(${r.count})`).join(', ')}`);
    patterns.push({
      type: 'word_frequency',
      pattern: 'repetitive_words',
      confidence: Math.min(repetitiveWords.length * 15, 80),
      examples: repetitiveWords.map(r => r.word)
    });
  }

  // Gibberish detection - words that don't look like real words
  const gibberishWords = words.filter(word => {
    // Words that are too short and have no vowels
    if (word.length <= 3 && !/[aeiou]/i.test(word)) return true;
    // Words with excessive consonants
    const consonantRatio = (word.match(/[bcdfghjklmnpqrstvwxyz]/gi) || []).length / word.length;
    if (consonantRatio > 0.8 && word.length > 4) return true;
    return false;
  });

  if (gibberishWords.length > 0 && gibberishWords.length / words.length > 0.3) {
    score += 20;
    reasons.push(`Gibberish words detected: ${gibberishWords.slice(0, 3).join(', ')}`);
    patterns.push({
      type: 'word_frequency',
      pattern: 'gibberish_words',
      confidence: 75,
      examples: gibberishWords.slice(0, 5)
    });
  }

  return { score, reasons, patterns };
}

function analyzeSpamIndicators(text: string): { score: number; reasons: string[]; patterns: SpamPattern[] } {
  const reasons: string[] = [];
  const patterns: SpamPattern[] = [];
  let score = 0;

  // URLs
  const urlCount = (text.match(/https?:\/\/[^\s]+/g) || []).length;
  if (urlCount > 0) {
    score += urlCount * 10;
    reasons.push(`Contains ${urlCount} URL(s)`);
    patterns.push({
      type: 'structure_pattern',
      pattern: 'contains_urls',
      confidence: 60,
      examples: text.match(/https?:\/\/[^\s]+/g) || []
    });
  }

  // Phone numbers
  const phoneCount = (text.match(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g) || []).length;
  if (phoneCount > 0) {
    score += phoneCount * 8;
    reasons.push(`Contains ${phoneCount} phone number(s)`);
    patterns.push({
      type: 'structure_pattern',
      pattern: 'contains_phones',
      confidence: 50,
      examples: text.match(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g) || []
    });
  }

  // Excessive exclamation marks
  const exclamationCount = (text.match(/!/g) || []).length;
  if (exclamationCount > 3) {
    score += exclamationCount * 3;
    reasons.push(`Excessive exclamation marks: ${exclamationCount}`);
    patterns.push({
      type: 'character_pattern',
      pattern: 'excessive_exclamations',
      confidence: Math.min(exclamationCount * 15, 80),
      examples: [text.substring(0, 50) + '...']
    });
  }

  return { score, reasons, patterns };
}

/**
 * Learn from manual spam decisions to improve detection
 */
export async function learnFromSpamDecision(
  text: string,
  isSpam: boolean,
  brand?: string,
  source?: string
): Promise<void> {
  try {
    // Check if we already have this exact text and decision within the last 24 hours
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    
    const existing = await prisma.spamLearning.findFirst({
      where: {
        text: text.substring(0, 1000),
        brand: brand || null,
        isSpam,
        createdAt: { gte: oneDayAgo }
      }
    });

    // Skip if we already learned from this exact text recently
    if (existing) {
      console.log(`Skipping recent duplicate learning entry for text: ${text.substring(0, 50)}...`);
      return;
    }

    const analysis = analyzeSpamPatterns(text);
    
    // Store the learning data
    await prisma.spamLearning.create({
      data: {
        text: text.substring(0, 1000), // Limit length
        brand: brand || null,
        isSpam,
        score: analysis.score,
        reasons: analysis.reasons,
        patterns: JSON.stringify(analysis.patterns),
        source: source || null,
        createdAt: new Date()
      }
    });
  } catch (error) {
    console.error('Failed to learn from spam decision:', error);
    // Don't throw - this is a learning feature, not critical
  }
}

/**
 * Get improved spam score based on historical decisions
 * (Single-item version - kept for backward compatibility with other APIs)
 */
export async function getImprovedSpamScore(
  text: string, 
  brand?: string
): Promise<SpamScore & { historicalConfidence: number }> {
  const baseAnalysis = analyzeSpamPatterns(text);
  
  try {
    // Look for similar texts in learning data
    const similarTexts = await prisma.spamLearning.findMany({
      where: {
        OR: [
          { text: { contains: text.substring(0, 50) } },
          { brand: brand || undefined }
        ]
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    if (similarTexts.length > 0) {
      const spamCount = similarTexts.filter(s => s.isSpam).length;
      const historicalConfidence = (spamCount / similarTexts.length) * 100;
      
      // Adjust score based on historical data
      const adjustedScore = baseAnalysis.score + (historicalConfidence - 50) * 0.3;
      
      return {
        ...baseAnalysis,
        score: Math.max(0, Math.min(100, adjustedScore)),
        historicalConfidence
      };
    }
  } catch (error) {
    console.error('Failed to get historical spam data:', error);
    // Return base analysis if database fails
  }

  return {
    ...baseAnalysis,
    historicalConfidence: 0
  };
}

/**
 * OPTIMIZED: Get improved spam scores for multiple texts in batch
 * This is much faster than calling getImprovedSpamScore individually
 * Used by spam capture for performance optimization
 */
export async function getBatchImprovedSpamScores(
  items: Array<{ text: string; brand?: string }>
): Promise<Map<string, SpamScore & { historicalConfidence: number }>> {
  const results = new Map<string, SpamScore & { historicalConfidence: number }>();
  
  if (items.length === 0) return results;
  
  try {
    // OPTIMIZATION: Batch fetch all learning data at once instead of per-item queries
    // Get all unique text prefixes and brands
    const textPrefixes = items.map(item => item.text.substring(0, 50));
    const brands = items.map(item => item.brand).filter(Boolean) as string[];
    const uniqueBrands = [...new Set(brands)];
    
    // Single batch query for all learning data
    const allLearningData = await prisma.spamLearning.findMany({
      where: {
        OR: [
          ...textPrefixes.map(prefix => ({ text: { contains: prefix } })),
          ...uniqueBrands.map(brand => ({ brand }))
        ]
      },
      orderBy: { createdAt: 'desc' },
      take: 1000 // Increased limit for batch processing
    });
    
    // OPTIMIZATION: Parallel pattern analysis (CPU-bound, can run in parallel)
    const patternAnalyses = await Promise.all(
      items.map(item => analyzeSpamPatterns(item.text))
    );
    
    // Match learning data to items
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const baseAnalysis = patternAnalyses[i];
      const itemKey = `${item.text.substring(0, 50)}|${item.brand || ''}`;
      
      // Find relevant learning data for this item
      const similarTexts = allLearningData.filter(learning => {
        const textMatch = learning.text?.includes(item.text.substring(0, 50));
        const brandMatch = item.brand ? learning.brand === item.brand : true;
        return textMatch || brandMatch;
      }).slice(0, 10); // Limit to top 10 matches per item
      
      if (similarTexts.length > 0) {
        const spamCount = similarTexts.filter(s => s.isSpam).length;
        const historicalConfidence = (spamCount / similarTexts.length) * 100;
        
        // Adjust score based on historical data
        const adjustedScore = baseAnalysis.score + (historicalConfidence - 50) * 0.3;
        
        results.set(itemKey, {
          ...baseAnalysis,
          score: Math.max(0, Math.min(100, adjustedScore)),
          historicalConfidence
        });
      } else {
        results.set(itemKey, {
          ...baseAnalysis,
          historicalConfidence: 0
        });
      }
    }
  } catch (error) {
    console.error('Failed to get batch historical spam data:', error);
    // Fallback: return pattern analysis only (no learning)
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const itemKey = `${item.text.substring(0, 50)}|${item.brand || ''}`;
      const baseAnalysis = analyzeSpamPatterns(item.text);
      results.set(itemKey, {
        ...baseAnalysis,
        historicalConfidence: 0
      });
    }
  }
  
  return results;
}
