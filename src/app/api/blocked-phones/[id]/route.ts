import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiAuthDeniedResponse, requireManagerApiAuth } from '@/lib/auth';

// DELETE /api/blocked-phones/[id] - Unblock a phone number
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireManagerApiAuth(req);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  try {
    const { id } = params;

    const blockedPhone = await prisma.blockedPhone.update({
      where: { id },
      data: { isActive: false }
    });

    return NextResponse.json({ success: true, blockedPhone });
  } catch (error) {
    console.error('Error unblocking phone:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to unblock phone number' },
      { status: 500 }
    );
  }
}
