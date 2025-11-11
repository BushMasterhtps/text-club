import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Supervisor Dashboard API - Track Yotpo form submissions
 * Shows who submitted what and when for productivity tracking
 */

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');
    const submitter = url.searchParams.get('submitter');
    const exportCsv = url.searchParams.get('export') === 'true';
    
    // Build where clause
    const where: any = {
      taskType: 'YOTPO',
      yotpoImportSource: 'Form', // Only form submissions
      yotpoSubmittedBy: { not: null }
    };
    
    // Date range filter
    if (startDate && endDate) {
      where.yotpoDateSubmitted = {
        gte: new Date(startDate),
        lte: new Date(endDate + 'T23:59:59.999Z')
      };
    }
    
    // Submitter filter
    if (submitter && submitter !== 'all') {
      where.yotpoSubmittedBy = submitter;
    }
    
    // Get submissions
    const submissions = await prisma.task.findMany({
      where,
      select: {
        id: true,
        yotpoDateSubmitted: true,
        yotpoSubmittedBy: true,
        yotpoCustomerName: true,
        yotpoEmail: true,
        yotpoProduct: true,
        yotpoIssueTopic: true,
        status: true,
        disposition: true,
        assignedTo: {
          select: {
            name: true
          }
        },
        createdAt: true
      },
      orderBy: {
        yotpoDateSubmitted: 'desc'
      }
    });
    
    // Calculate stats by person
    const submitterStats: Record<string, {
      name: string;
      total: number;
      today: number;
      thisWeek: number;
      byStatus: Record<string, number>;
      byIssueTopic: Record<string, number>;
    }> = {};
    
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    submissions.forEach(sub => {
      const name = sub.yotpoSubmittedBy || 'Unknown';
      
      if (!submitterStats[name]) {
        submitterStats[name] = {
          name,
          total: 0,
          today: 0,
          thisWeek: 0,
          byStatus: {},
          byIssueTopic: {}
        };
      }
      
      submitterStats[name].total++;
      
      const submittedDate = sub.yotpoDateSubmitted ? new Date(sub.yotpoDateSubmitted) : new Date(0);
      if (submittedDate >= todayStart) {
        submitterStats[name].today++;
      }
      if (submittedDate >= weekStart) {
        submitterStats[name].thisWeek++;
      }
      
      // Count by status
      const status = sub.status || 'UNKNOWN';
      submitterStats[name].byStatus[status] = (submitterStats[name].byStatus[status] || 0) + 1;
      
      // Count by issue topic
      const topic = sub.yotpoIssueTopic || 'Other';
      submitterStats[name].byIssueTopic[topic] = (submitterStats[name].byIssueTopic[topic] || 0) + 1;
    });
    
    // Calculate overall metrics
    const totalSubmissions = submissions.length;
    const submissionsToday = submissions.filter(s => {
      const date = s.yotpoDateSubmitted ? new Date(s.yotpoDateSubmitted) : new Date(0);
      return date >= todayStart;
    }).length;
    const submissionsThisWeek = submissions.filter(s => {
      const date = s.yotpoDateSubmitted ? new Date(s.yotpoDateSubmitted) : new Date(0);
      return date >= weekStart;
    }).length;
    
    // CSV Export
    if (exportCsv) {
      const csvRows = [
        ['Submitted By', 'Date/Time', 'Customer Name', 'Email', 'Product', 'Issue Topic', 'Status', 'Assigned To'].join(',')
      ];
      
      submissions.forEach(sub => {
        const row = [
          sub.yotpoSubmittedBy || '',
          sub.yotpoDateSubmitted ? new Date(sub.yotpoDateSubmitted).toLocaleString() : '',
          sub.yotpoCustomerName || '',
          sub.yotpoEmail || '',
          sub.yotpoProduct || '',
          sub.yotpoIssueTopic || '',
          sub.status || '',
          sub.assignedTo?.name || 'Unassigned'
        ].map(field => `"${String(field).replace(/"/g, '""')}"`);
        
        csvRows.push(row.join(','));
      });
      
      const csvContent = csvRows.join('\n');
      
      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="yotpo-submissions-report-${new Date().toISOString().split('T')[0]}.csv"`
        }
      });
    }
    
    // Return JSON for UI
    return NextResponse.json({
      success: true,
      data: {
        submissions,
        stats: Object.values(submitterStats).sort((a, b) => b.total - a.total),
        metrics: {
          totalSubmissions,
          submissionsToday,
          submissionsThisWeek,
          avgPerDay: submissionsThisWeek / 7,
          activeSubmitters: Object.keys(submitterStats).length
        }
      }
    });
    
  } catch (error) {
    console.error('Error fetching submissions report:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch submissions report'
    }, { status: 500 });
  }
}

