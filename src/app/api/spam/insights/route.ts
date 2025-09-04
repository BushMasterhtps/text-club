// Spam learning insights and visualization API
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const brand = url.searchParams.get('brand');

    // Get spam learning statistics
    const [totalDecisions, spamDecisions, legitimateDecisions] = await Promise.all([
      prisma.spamLearning.count({
        where: brand ? { brand } : {}
      }).catch(() => 0),
      prisma.spamLearning.count({
        where: { 
          isSpam: true,
          ...(brand ? { brand } : {})
        }
      }).catch(() => 0),
      prisma.spamLearning.count({
        where: { 
          isSpam: false,
          ...(brand ? { brand } : {})
        }
      }).catch(() => 0)
    ]);

    // Get most common spam patterns
    const spamPatterns = await prisma.spamLearning.findMany({
      where: { 
        isSpam: true,
        ...(brand ? { brand } : {})
      },
      select: {
        patterns: true,
        reasons: true,
        score: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    }).catch(() => []);

    // Analyze patterns
    const patternAnalysis = analyzePatterns(spamPatterns);

    // Get recent learning activity
    const recentActivity = await prisma.spamLearning.findMany({
      where: brand ? { brand } : {},
      select: {
        isSpam: true,
        score: true,
        createdAt: true,
        text: true
      },
      orderBy: { createdAt: 'desc' },
      take: 20
    }).catch(() => []);

    // Get accuracy over time (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentDecisions = await prisma.spamLearning.findMany({
      where: {
        createdAt: { gte: thirtyDaysAgo },
        ...(brand ? { brand } : {})
      },
      select: {
        isSpam: true,
        score: true,
        createdAt: true
      },
      orderBy: { createdAt: 'asc' }
    }).catch(() => []);

    const accuracyOverTime = calculateAccuracyOverTime(recentDecisions);

    return NextResponse.json({
      success: true,
      insights: {
        totalDecisions,
        spamDecisions,
        legitimateDecisions,
        accuracy: totalDecisions > 0 ? (spamDecisions / totalDecisions) * 100 : 0,
        patternAnalysis,
        recentActivity,
        accuracyOverTime
      }
    });
  } catch (error) {
    console.error('Spam insights error:', error);
    return NextResponse.json({ 
      success: false, 
      error: "Failed to get spam insights" 
    }, { status: 500 });
  }
}

function analyzePatterns(spamPatterns: any[]) {
  const patternCounts: Record<string, number> = {};
  const reasonCounts: Record<string, number> = {};
  const scoreRanges = {
    '0-20': 0,
    '21-40': 0,
    '41-60': 0,
    '61-80': 0,
    '81-100': 0
  };

  spamPatterns.forEach(item => {
    // Count patterns
    try {
      const patterns = JSON.parse(item.patterns);
      patterns.forEach((pattern: any) => {
        const key = `${pattern.type}_${pattern.pattern}`;
        patternCounts[key] = (patternCounts[key] || 0) + 1;
      });
    } catch (e) {
      // Ignore parsing errors
    }

    // Count reasons
    if (Array.isArray(item.reasons)) {
      item.reasons.forEach((reason: string) => {
        reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
      });
    }

    // Count score ranges
    if (item.score >= 0 && item.score <= 20) scoreRanges['0-20']++;
    else if (item.score <= 40) scoreRanges['21-40']++;
    else if (item.score <= 60) scoreRanges['41-60']++;
    else if (item.score <= 80) scoreRanges['61-80']++;
    else scoreRanges['81-100']++;
  });

  return {
    topPatterns: Object.entries(patternCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([pattern, count]) => ({ pattern, count })),
    topReasons: Object.entries(reasonCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([reason, count]) => ({ reason, count })),
    scoreDistribution: scoreRanges
  };
}

function calculateAccuracyOverTime(decisions: any[]) {
  const dailyData: Record<string, { total: number; spam: number; avgScore: number }> = {};
  
  decisions.forEach(decision => {
    const date = decision.createdAt.toISOString().split('T')[0];
    if (!dailyData[date]) {
      dailyData[date] = { total: 0, spam: 0, avgScore: 0 };
    }
    dailyData[date].total++;
    if (decision.isSpam) dailyData[date].spam++;
    dailyData[date].avgScore += decision.score;
  });

  // Calculate averages
  Object.keys(dailyData).forEach(date => {
    const data = dailyData[date];
    data.avgScore = data.avgScore / data.total;
  });

  return Object.entries(dailyData)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, data]) => ({
      date,
      ...data,
      spamRate: (data.spam / data.total) * 100
    }));
}
