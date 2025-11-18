import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parse } from 'csv-parse/sync';

// GET - List all email macros
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    
    const where: any = {};
    if (search) {
      where.OR = [
        { macroName: { contains: search, mode: 'insensitive' } },
        { macro: { contains: search, mode: 'insensitive' } },
        { caseType: { contains: search, mode: 'insensitive' } },
        { brand: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } }
      ];
    }
    
    const macros = await prisma.emailMacro.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });
    
    return NextResponse.json({ success: true, data: macros });
  } catch (error) {
    console.error('Error fetching email macros:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch email macros' },
      { status: 500 }
    );
  }
}

// POST - Create new email macro or import CSV
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
          const macroName = record['Macro Name'] || record['macroName'] || record['macro_name'] || record['MacroName'] || '';
          const macro = record['Macro'] || record['macro'] || '';
          const caseType = record['Case Type/ Subcategory'] || record['Case Type'] || record['caseType'] || record['case_type'] || null;
          const brand = record['Brand'] || record['brand'] || null;
          const description = record['What the macro is for'] || record['Description'] || record['description'] || null;
          
          if (!macroName || !macro) {
            errors++;
            continue;
          }
          
          await prisma.emailMacro.create({
            data: {
              macroName,
              macro,
              caseType,
              brand,
              description
            }
          });
          imported++;
        } catch (error) {
          console.error('Error importing email macro:', error);
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
      const { macroName, macro, caseType, brand, description } = body;
      
      if (!macroName || !macro) {
        return NextResponse.json(
          { success: false, error: 'Macro Name and Macro are required' },
          { status: 400 }
        );
      }
      
      const newMacro = await prisma.emailMacro.create({
        data: {
          macroName,
          macro,
          caseType: caseType || null,
          brand: brand || null,
          description: description || null
        }
      });
      
      return NextResponse.json({ success: true, data: newMacro });
    }
  } catch (error) {
    console.error('Error creating/importing email macro:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create/import email macro' },
      { status: 500 }
    );
  }
}

// PUT - Update email macro
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, macroName, macro, caseType, brand, description } = body;
    
    if (!id || !macroName || !macro) {
      return NextResponse.json(
        { success: false, error: 'ID, Macro Name, and Macro are required' },
        { status: 400 }
      );
    }
    
    const updated = await prisma.emailMacro.update({
      where: { id },
      data: {
        macroName,
        macro,
        caseType: caseType || null,
        brand: brand || null,
        description: description || null
      }
    });
    
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('Error updating email macro:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update email macro' },
      { status: 500 }
    );
  }
}

// DELETE - Delete email macro(s)
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const ids = searchParams.get('ids'); // Comma-separated for bulk delete
    
    if (ids) {
      // Bulk delete
      const idArray = ids.split(',').filter(Boolean);
      await prisma.emailMacro.deleteMany({
        where: { id: { in: idArray } }
      });
      return NextResponse.json({ success: true, deleted: idArray.length });
    } else if (id) {
      // Single delete
      await prisma.emailMacro.delete({ where: { id } });
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json(
        { success: false, error: 'ID or IDs required' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Error deleting email macro:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete email macro' },
      { status: 500 }
    );
  }
}

