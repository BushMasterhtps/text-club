// API route for fetching previous action items from last one-on-one
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';

// Helper to verify authentication
async function getAuthenticatedUser(request: NextRequest) {
  const cookieStore = await cookies();
  const userEmail = cookieStore.get('user_email')?.value;
  
  if (!userEmail) {
    return null;
  }
  
  const user = await prisma.user.findUnique({
    where: { email: userEmail },
    select: { id: true, email: true, name: true, role: true }
  });
  
  return user;
}

// GET - Fetch previous action items for an agent
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agentId');
    
    if (!agentId) {
      return NextResponse.json(
        { success: false, error: 'Missing agentId' },
        { status: 400 }
      );
    }
    
    // Get the most recent one-on-one note for this agent
    const previousNote = await prisma.oneOnOneNote.findFirst({
      where: { agentId },
      orderBy: { meetingDate: 'desc' },
      select: {
        id: true,
        meetingDate: true,
        actionItems: true
      }
    });
    
    if (!previousNote || !previousNote.actionItems) {
      return NextResponse.json({
        success: true,
        hasActionItems: false,
        previousMeetingDate: null,
        actionItems: []
      });
    }
    
    return NextResponse.json({
      success: true,
      hasActionItems: true,
      previousMeetingDate: previousNote.meetingDate,
      actionItems: previousNote.actionItems
    });
    
  } catch (error) {
    console.error('Error fetching previous action items:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch previous action items' },
      { status: 500 }
    );
  }
}

