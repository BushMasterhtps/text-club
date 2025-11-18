import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parse } from 'csv-parse/sync';

// GET - List all product inquiry QAs
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    
    const where: any = {};
    if (search) {
      where.OR = [
        { brand: { contains: search, mode: 'insensitive' } },
        { product: { contains: search, mode: 'insensitive' } },
        { question: { contains: search, mode: 'insensitive' } },
        { answer: { contains: search, mode: 'insensitive' } }
      ];
    }
    
    const qas = await prisma.productInquiryQA.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });
    
    return NextResponse.json({ success: true, data: qas });
  } catch (error) {
    console.error('Error fetching product inquiry QAs:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch product inquiry QAs' },
      { status: 500 }
    );
  }
}

// POST - Create new product inquiry QA or import CSV
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    
    if (file) {
      // CSV Import
      const csvText = await file.text();
      const records = parse(csvText, {
        columns: true,
        skip_empty_lines: true,
        trim: true
      });
      
      let imported = 0;
      let errors = 0;
      
      for (const record of records) {
        try {
          // Flexible column matching
          const brand = record['Brand'] || record['brand'] || '';
          const product = record['Product'] || record['product'] || '';
          const question = record['Question'] || record['question'] || '';
          const answer = record['Answer'] || record['answer'] || '';
          
          if (!brand || !product || !question || !answer) {
            errors++;
            continue;
          }
          
          await prisma.productInquiryQA.create({
            data: {
              brand,
              product,
              question,
              answer
            }
          });
          imported++;
        } catch (error) {
          console.error('Error importing product inquiry QA:', error);
          errors++;
        }
      }
      
      return NextResponse.json({
        success: true,
        imported,
        errors,
        total: records.length
      });
    } else {
      // Manual create
      const body = await request.json();
      const { brand, product, question, answer } = body;
      
      if (!brand || !product || !question || !answer) {
        return NextResponse.json(
          { success: false, error: 'Brand, Product, Question, and Answer are required' },
          { status: 400 }
        );
      }
      
      const newQA = await prisma.productInquiryQA.create({
        data: {
          brand,
          product,
          question,
          answer
        }
      });
      
      return NextResponse.json({ success: true, data: newQA });
    }
  } catch (error) {
    console.error('Error creating/importing product inquiry QA:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create/import product inquiry QA' },
      { status: 500 }
    );
  }
}

// PUT - Update product inquiry QA
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, brand, product, question, answer } = body;
    
    if (!id || !brand || !product || !question || !answer) {
      return NextResponse.json(
        { success: false, error: 'ID, Brand, Product, Question, and Answer are required' },
        { status: 400 }
      );
    }
    
    const updated = await prisma.productInquiryQA.update({
      where: { id },
      data: {
        brand,
        product,
        question,
        answer
      }
    });
    
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('Error updating product inquiry QA:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update product inquiry QA' },
      { status: 500 }
    );
  }
}

// DELETE - Delete product inquiry QA(s)
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const ids = searchParams.get('ids'); // Comma-separated for bulk delete
    
    if (ids) {
      // Bulk delete
      const idArray = ids.split(',').filter(Boolean);
      await prisma.productInquiryQA.deleteMany({
        where: { id: { in: idArray } }
      });
      return NextResponse.json({ success: true, deleted: idArray.length });
    } else if (id) {
      // Single delete
      await prisma.productInquiryQA.delete({ where: { id } });
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json(
        { success: false, error: 'ID or IDs required' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Error deleting product inquiry QA:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete product inquiry QA' },
      { status: 500 }
    );
  }
}

