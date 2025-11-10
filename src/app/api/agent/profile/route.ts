// API route for agent profile information
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    let email = searchParams.get('email');
    
    // If no email provided, get from cookies (current user)
    if (!email) {
      const cookieStore = await cookies();
      email = cookieStore.get('user_email')?.value || null;
    }
    
    if (!email) {
      return NextResponse.json(
        { success: false, error: 'Email required' },
        { status: 400 }
      );
    }
    
    const agent = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true
      }
    });
    
    if (!agent) {
      return NextResponse.json(
        { success: false, error: 'Agent not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ success: true, agent });
    
  } catch (error) {
    console.error('Error fetching agent profile:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch agent profile' },
      { status: 500 }
    );
  }
}

