import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Public API endpoint for Yotpo form submissions
 * Creates tasks directly in the Pending Yotpo Request Tasks queue
 */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate required fields
    const requiredFields = [
      'submittedBy',
      'customerName',
      'email',
      'orderDate',
      'product',
      'issueTopic',
      'reviewDate',
      'review'
    ];
    
    const missingFields = requiredFields.filter(field => !body[field]);
    if (missingFields.length > 0) {
      return NextResponse.json({
        success: false,
        error: `Missing required fields: ${missingFields.join(', ')}`
      }, { status: 400 });
    }
    
    // Parse dates
    const parseDate = (dateStr: string): Date | null => {
      try {
        const date = new Date(dateStr);
        return isNaN(date.getTime()) ? null : date;
      } catch {
        return null;
      }
    };
    
    const orderDate = parseDate(body.orderDate);
    const reviewDate = parseDate(body.reviewDate);
    
    if (!orderDate || !reviewDate) {
      return NextResponse.json({
        success: false,
        error: 'Invalid date format for Order Date or Review Date'
      }, { status: 400 });
    }
    
    // Check for duplicates (same email + product + review date)
    const existing = await prisma.task.findFirst({
      where: {
        taskType: 'YOTPO',
        yotpoEmail: body.email.trim(),
        yotpoProduct: body.product.trim(),
        yotpoReviewDate: reviewDate
      }
    });
    
    if (existing) {
      return NextResponse.json({
        success: false,
        error: 'Duplicate submission detected. This request already exists in the system.',
        duplicate: true,
        existingTaskId: existing.id
      }, { status: 409 });
    }
    
    // Create the Yotpo task
    const task = await prisma.task.create({
      data: {
        taskType: 'YOTPO',
        status: 'PENDING',
        brand: 'Yotpo',
        
        // Yotpo-specific fields
        yotpoDateSubmitted: new Date(), // Current timestamp
        yotpoPrOrYotpo: body.prOrYotpo?.trim() || 'Yotpo',
        yotpoCustomerName: body.customerName.trim(),
        yotpoEmail: body.email.trim(),
        yotpoOrderDate: orderDate,
        yotpoProduct: body.product.trim(),
        yotpoIssueTopic: body.issueTopic.trim(),
        yotpoReviewDate: reviewDate,
        yotpoReview: body.review.trim(),
        yotpoSfOrderLink: body.sfOrderLink?.trim() || null,
        
        // Import tracking
        yotpoImportSource: 'Form',
        yotpoSubmittedBy: body.submittedBy.trim(),
        
        // For agent portal display
        text: body.customerName.trim() || body.email.trim() || 'Yotpo Request',
        email: body.email.trim(),
      }
    });
    
    return NextResponse.json({
      success: true,
      message: 'Yotpo request submitted successfully!',
      taskId: task.id,
      data: {
        taskId: task.id,
        customerName: task.yotpoCustomerName,
        email: task.yotpoEmail,
        submittedBy: task.yotpoSubmittedBy,
        submittedAt: task.yotpoDateSubmitted
      }
    });
    
  } catch (error) {
    console.error('Error submitting Yotpo form:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to submit Yotpo request. Please try again.'
    }, { status: 500 });
  }
}

