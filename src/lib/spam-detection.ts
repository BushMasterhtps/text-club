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

  // Excessive special characters
  const specialCharRatio = (text.match(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/g) || []).length / text.length;
  if (specialCharRatio > 0.3) {
    score += 25;
    reasons.push(`High special character ratio: ${(specialCharRatio * 100).toFixed(1)}%`);
    patterns.push({
      type: 'character_pattern',
      pattern: 'excessive_special_chars',
      confidence: specialCharRatio * 100,
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

  // Very short messages
  if (text.length < 5) {
    score += 15;
    reasons.push('Very short message');
    patterns.push({
      type: 'length_pattern',
      pattern: 'very_short',
      confidence: 60,
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

  return { score, reasons, patterns };
}

function analyzeWordPatterns(text: string): { score: number; reasons: string[]; patterns: SpamPattern[] } {
  const reasons: string[] = [];
  const patterns: SpamPattern[] = [];
  let score = 0;

  const words = text.toLowerCase().split(/\s+/);
  const wordCount = words.length;

  // Common spam words
  const spamWords = [
    'free', 'win', 'congratulations', 'urgent', 'limited time', 'act now',
    'click here', 'unsubscribe', 'opt out', 'special offer', 'deal',
    'discount', 'save', 'money', 'cash', 'prize', 'winner', 'selected',
    'guaranteed', 'risk free', 'no obligation', 'call now', 'text stop'
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
    // Check if we already have this exact text and decision
    const existing = await prisma.spamLearning.findFirst({
      where: {
        text: text.substring(0, 1000),
        brand: brand || null,
        isSpam
      }
    });

    // Skip if we already learned from this exact text
    if (existing) {
      console.log(`Skipping duplicate learning entry for text: ${text.substring(0, 50)}...`);
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
