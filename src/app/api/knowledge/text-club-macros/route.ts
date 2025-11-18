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
      try {
        const csvText = await file.text();
        
        if (!csvText || csvText.trim().length === 0) {
          return NextResponse.json(
            { success: false, error: 'CSV file is empty' },
            { status: 400 }
          );
        }
        
        let records;
        try {
          records = parse(csvText, {
            columns: true,
            skip_empty_lines: true,
            trim: true
          });
        } catch (parseError: any) {
          console.error('CSV parse error:', parseError);
          return NextResponse.json(
            { success: false, error: `Failed to parse CSV: ${parseError.message || 'Invalid CSV format'}` },
            { status: 400 }
          );
        }
        
        if (!records || records.length === 0) {
          return NextResponse.json(
            { success: false, error: 'CSV file contains no valid records' },
            { status: 400 }
          );
        }
        
        // Prepare data for batch insert
      const dataToInsert: Array<{
        macroName: string;
        macroDetails: string;
      }> = [];
      
      let errors = 0;
      const errorDetails: string[] = [];
      
      // Process records and prepare data
      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        try {
          // Flexible column matching
          const macroName = record['Macro Name'] || record['macroName'] || record['macro_name'] || record['MacroName'] || '';
          const macroDetails = record['Macro Details'] || record['macroDetails'] || record['macro_details'] || record['MacroDetails'] || record['Macro'] || record['macro'] || '';
          
          if (!macroName || !macroDetails) {
            errors++;
            errorDetails.push(`Row ${i + 2}: Missing required fields (Macro Name or Macro Details)`);
            continue;
          }
          
          dataToInsert.push({
            macroName,
            macroDetails
          });
        } catch (error: any) {
          console.error(`Error processing text club macro row ${i + 2}:`, error);
          errors++;
          errorDetails.push(`Row ${i + 2}: ${error.message || 'Processing error'}`);
        }
      }
      
      // Batch insert using createMany (much faster than individual creates)
      const BATCH_SIZE = 100;
      let imported = 0;
      
      for (let i = 0; i < dataToInsert.length; i += BATCH_SIZE) {
        const batch = dataToInsert.slice(i, i + BATCH_SIZE);
        try {
          const result = await prisma.textClubMacro.createMany({
            data: batch,
            skipDuplicates: true
          });
          imported += result.count;
        } catch (error: any) {
          console.error(`Error inserting batch starting at row ${i + 2}:`, error);
          // Try individual inserts for this batch if batch fails
          for (const item of batch) {
            try {
              await prisma.textClubMacro.create({ data: item });
              imported++;
            } catch (individualError: any) {
              errors++;
              errorDetails.push(`Row ${i + 2}: ${individualError.message || 'Database error'}`);
            }
          }
        }
        
        return NextResponse.json({
          success: true,
          imported,
          errors,
          total: records.length,
          errorDetails: errorDetails.length > 0 ? errorDetails.slice(0, 10) : undefined
        });
      } catch (fileError: any) {
        console.error('File processing error:', fileError);
        return NextResponse.json(
          { success: false, error: `Failed to process file: ${fileError.message || 'Unknown error'}` },
          { status: 500 }
        );
      }
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
  } catch (error: any) {
    console.error('Error creating/importing text club macro:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create/import text club macro' },
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

