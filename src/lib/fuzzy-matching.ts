/**
 * Fuzzy string matching utilities for spam detection
 * Implements Levenshtein distance and similarity scoring
 */

/**
 * Calculate Levenshtein distance between two strings
 * Returns the minimum number of single-character edits needed to transform one string into another
 */
export function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  
  // Create a matrix to store distances
  const matrix: number[][] = Array(len1 + 1)
    .fill(null)
    .map(() => Array(len2 + 1).fill(0));
  
  // Initialize first row and column
  for (let i = 0; i <= len1; i++) matrix[i][0] = i;
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;
  
  // Fill the matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }
  
  return matrix[len1][len2];
}

/**
 * Calculate similarity score between two strings (0-1, where 1 is identical)
 * Uses Levenshtein distance normalized by the maximum length
 */
export function similarity(str1: string, str2: string): number {
  if (str1 === str2) return 1;
  if (str1.length === 0 || str2.length === 0) return 0;
  
  const maxLen = Math.max(str1.length, str2.length);
  const distance = levenshteinDistance(str1, str2);
  
  return 1 - (distance / maxLen);
}

/**
 * Check if a text contains a pattern with fuzzy matching
 * Returns true if similarity >= threshold (default 0.7 = 70%)
 */
export function fuzzyContains(
  text: string,
  pattern: string,
  threshold: number = 0.7
): boolean {
  // Normalize both strings
  const normalizedText = text.toLowerCase().trim();
  const normalizedPattern = pattern.toLowerCase().trim();
  
  // Exact match check first (fast path)
  if (normalizedText.includes(normalizedPattern)) return true;
  
  // For single-word patterns, check each word in text
  if (!normalizedPattern.includes(' ')) {
    const words = normalizedText.split(/\s+/);
    return words.some(word => similarity(word, normalizedPattern) >= threshold);
  }
  
  // For multi-word patterns, check if pattern exists with fuzzy matching
  // Split pattern into words and check if they appear in order
  const patternWords = normalizedPattern.split(/\s+/);
  const textWords = normalizedText.split(/\s+/);
  
  // Try to find pattern words in sequence in text
  let patternIndex = 0;
  for (let i = 0; i < textWords.length && patternIndex < patternWords.length; i++) {
    if (similarity(textWords[i], patternWords[patternIndex]) >= threshold) {
      patternIndex++;
    }
  }
  
  // If we matched all pattern words, it's a match
  return patternIndex === patternWords.length;
}

/**
 * Find the best fuzzy match for a pattern in text
 * Returns the similarity score (0-1) or null if no match above threshold
 */
export function findBestFuzzyMatch(
  text: string,
  pattern: string,
  threshold: number = 0.7
): number | null {
  const normalizedText = text.toLowerCase().trim();
  const normalizedPattern = pattern.toLowerCase().trim();
  
  // For single-word patterns, find best matching word
  if (!normalizedPattern.includes(' ')) {
    const words = normalizedText.split(/\s+/);
    let bestScore = 0;
    
    for (const word of words) {
      const score = similarity(word, normalizedPattern);
      if (score > bestScore) bestScore = score;
    }
    
    return bestScore >= threshold ? bestScore : null;
  }
  
  // For multi-word patterns, calculate overall similarity
  // This is a simplified approach - could be enhanced
  const patternWords = normalizedPattern.split(/\s+/);
  const textWords = normalizedText.split(/\s+/);
  
  let totalSimilarity = 0;
  let matchedWords = 0;
  
  for (const patternWord of patternWords) {
    let bestWordScore = 0;
    for (const textWord of textWords) {
      const score = similarity(textWord, patternWord);
      if (score > bestWordScore) bestWordScore = score;
    }
    
    if (bestWordScore >= threshold) {
      totalSimilarity += bestWordScore;
      matchedWords++;
    }
  }
  
  if (matchedWords === 0) return null;
  
  const avgSimilarity = totalSimilarity / patternWords.length;
  return avgSimilarity >= threshold ? avgSimilarity : null;
}

