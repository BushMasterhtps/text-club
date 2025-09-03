import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/blocked-phones - List all blocked phone numbers
export async function GET() {
  try {
    const blockedPhones = await prisma.blockedPhone.findMany({
      where: { isActive: true },
      orderBy: { blockedAt: 'desc' },
      select: {
        id: true,
        phone: true,
        brand: true,
        reason: true,
        blockedAt: true,
        blockedBy: true,
      }
    });

    return NextResponse.json({ 
      success: true, 
      blockedPhones 
    });
  } catch (error) {
    console.error('Error fetching blocked phones:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch blocked phones' },
      { status: 500 }
    );
  }
}

// POST /api/blocked-phones - Add a new blocked phone number
export async function POST(req: Request) {
  try {
    const { phone, brand, reason } = await req.json();

    if (!phone) {
      return NextResponse.json(
        { success: false, error: 'Phone number is required' },
        { status: 400 }
      );
    }

    // Check if phone is already blocked
    const existing = await prisma.blockedPhone.findUnique({
      where: { phone }
    });

    if (existing) {
      if (existing.isActive) {
        return NextResponse.json(
          { success: false, error: 'Phone number is already blocked' },
          { status: 400 }
        );
      } else {
        // Reactivate existing blocked phone
        const updated = await prisma.blockedPhone.update({
          where: { id: existing.id },
          data: {
            isActive: true,
            brand,
            reason,
            blockedAt: new Date(),
            updatedAt: new Date()
          }
        });
        return NextResponse.json({ success: true, blockedPhone: updated });
      }
    }

    // Create new blocked phone
    const blockedPhone = await prisma.blockedPhone.create({
      data: {
        phone,
        brand,
        reason,
        isActive: true
      }
    });

    return NextResponse.json({ success: true, blockedPhone });
  } catch (error) {
    console.error('Error creating blocked phone:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to block phone number' },
      { status: 500 }
    );
  }
}
