import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function DELETE() {
  try {
    // Delete all WOD/IVCS tasks
    const result = await prisma.task.deleteMany({
      where: {
        taskType: 'WOD_IVCS'
      }
    });

    return NextResponse.json({
      success: true,
      message: `Successfully deleted ${result.count} WOD/IVCS tasks`,
      deletedCount: result.count
    });
  } catch (error) {
    console.error('Error clearing WOD/IVCS tasks:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
