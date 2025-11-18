import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parse } from 'csv-parse/sync';

// GET - List all text club macros
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    
    const where: any = {};
    if (search) {
      where.OR = [
        { macroName: { contains: search, mode: 'insensitive' } },
        { macroDetails: { contains: search, mode: 'insensitive' } }
      ];
    }
    
    const macros = await prisma.textClubMacro.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });
    
    return NextResponse.json({ success: true, data: macros });
  } catch (error) {
    console.error('Error fetching text club macros:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch text club macros' },
      { status: 500 }
    );
  }
}

// POST - Create new text club macro or import CSV
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
          const macroDetails = record['Macro Details'] || record['macroDetails'] || record['macro_details'] || record['MacroDetails'] || record['Macro'] || record['macro'] || '';
          
          if (!macroName || !macroDetails) {
            errors++;
            continue;
          }
          
          await prisma.textClubMacro.create({
            data: {
              macroName,
              macroDetails
            }
          });
          imported++;
        } catch (error) {
          console.error('Error importing text club macro:', error);
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
      const { macroName, macroDetails } = body;
      
      if (!macroName || !macroDetails) {
        return NextResponse.json(
          { success: false, error: 'Macro Name and Macro Details are required' },
          { status: 400 }
        );
      }
      
      const newMacro = await prisma.textClubMacro.create({
        data: {
          macroName,
          macroDetails
        }
      });
      
      return NextResponse.json({ success: true, data: newMacro });
    }
  } catch (error) {
    console.error('Error creating/importing text club macro:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create/import text club macro' },
      { status: 500 }
    );
  }
}

// PUT - Update text club macro
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, macroName, macroDetails } = body;
    
    if (!id || !macroName || !macroDetails) {
      return NextResponse.json(
        { success: false, error: 'ID, Macro Name, and Macro Details are required' },
        { status: 400 }
      );
    }
    
    const updated = await prisma.textClubMacro.update({
      where: { id },
      data: {
        macroName,
        macroDetails
      }
    });
    
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('Error updating text club macro:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update text club macro' },
      { status: 500 }
    );
  }
}

// DELETE - Delete text club macro(s)
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const ids = searchParams.get('ids'); // Comma-separated for bulk delete
    
    if (ids) {
      // Bulk delete
      const idArray = ids.split(',').filter(Boolean);
      await prisma.textClubMacro.deleteMany({
        where: { id: { in: idArray } }
      });
      return NextResponse.json({ success: true, deleted: idArray.length });
    } else if (id) {
      // Single delete
      await prisma.textClubMacro.delete({ where: { id } });
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json(
        { success: false, error: 'ID or IDs required' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Error deleting text club macro:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete text club macro' },
      { status: 500 }
    );
  }
}

