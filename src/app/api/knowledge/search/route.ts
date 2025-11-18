import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Search across all knowledge base resources
 * Searches Email Macros, Text Club Macros, and Product Inquiry QA
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';
    
    if (!query.trim()) {
      return NextResponse.json({
        success: true,
        data: {
          emailMacros: [],
          textClubMacros: [],
          productInquiryQAs: []
        }
      });
    }
    
    const searchTerm = query.trim();
    
    // Search Email Macros
    const emailMacros = await prisma.emailMacro.findMany({
      where: {
        OR: [
          { macroName: { contains: searchTerm, mode: 'insensitive' } },
          { macro: { contains: searchTerm, mode: 'insensitive' } },
          { caseType: { contains: searchTerm, mode: 'insensitive' } },
          { brand: { contains: searchTerm, mode: 'insensitive' } },
          { description: { contains: searchTerm, mode: 'insensitive' } }
        ]
      },
      orderBy: { createdAt: 'desc' },
      take: 100 // Limit results
    });
    
    // Search Text Club Macros
    const textClubMacros = await prisma.textClubMacro.findMany({
      where: {
        OR: [
          { macroName: { contains: searchTerm, mode: 'insensitive' } },
          { macroDetails: { contains: searchTerm, mode: 'insensitive' } }
        ]
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    
    // Search Product Inquiry QA
    const productInquiryQAs = await prisma.productInquiryQA.findMany({
      where: {
        OR: [
          { brand: { contains: searchTerm, mode: 'insensitive' } },
          { product: { contains: searchTerm, mode: 'insensitive' } },
          { question: { contains: searchTerm, mode: 'insensitive' } },
          { answer: { contains: searchTerm, mode: 'insensitive' } }
        ]
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    
    return NextResponse.json({
      success: true,
      data: {
        emailMacros,
        textClubMacros,
        productInquiryQAs,
        total: emailMacros.length + textClubMacros.length + productInquiryQAs.length
      }
    });
  } catch (error) {
    console.error('Error searching knowledge base:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to search knowledge base' },
      { status: 500 }
    );
  }
}

