// API route for managing one-on-one meeting notes
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET - Fetch one-on-one notes
export async function GET(request: NextRequest) {
  try {
    
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agentId');
    const noteId = searchParams.get('noteId');
    
    // If fetching a specific note
    if (noteId) {
      const note = await prisma.oneOnOneNote.findUnique({
        where: { id: noteId }
      });
      
      if (!note) {
        return NextResponse.json(
          { success: false, error: 'Note not found' },
          { status: 404 }
        );
      }
      
      return NextResponse.json({ success: true, note });
    }
    
    // If fetching notes for a specific agent
    if (agentId) {
      const notes = await prisma.oneOnOneNote.findMany({
        where: { agentId },
        orderBy: { meetingDate: 'desc' }
      });
      
      return NextResponse.json({ success: true, notes });
    }
    
    // Fetch all notes (managers can see all)
    const notes = await prisma.oneOnOneNote.findMany({
      orderBy: { meetingDate: 'desc' },
      take: 100 // Limit to recent 100
    });
    
    return NextResponse.json({ success: true, notes });
    
  } catch (error) {
    console.error('Error fetching one-on-one notes:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch notes' },
      { status: 500 }
    );
  }
}

// POST - Create new one-on-one note
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      meetingDate,
      agentId,
      agentName,
      agentEmail,
      discussionPoints,
      strengths,
      areasForImprovement,
      notes,
      actionItems,
      nextMeetingDate,
      followUpRequired,
      emailTemplate
    } = body;
    
    // Validate required fields
    if (!meetingDate || !agentId || !agentEmail) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: meetingDate, agentId, agentEmail' },
        { status: 400 }
      );
    }
    
    // Create the note
    const note = await prisma.oneOnOneNote.create({
      data: {
        meetingDate: new Date(meetingDate),
        agentId,
        agentName: agentName || agentEmail,
        agentEmail,
        managerId: 'system', // Manager ID from session/middleware
        managerName: 'Manager', // Can be enhanced later
        discussionPoints,
        strengths,
        areasForImprovement,
        notes,
        actionItems: actionItems || [],
        nextMeetingDate: nextMeetingDate ? new Date(nextMeetingDate) : null,
        followUpRequired: followUpRequired || false,
        emailTemplate
      }
    });
    
    return NextResponse.json({ success: true, note });
    
  } catch (error) {
    console.error('Error creating one-on-one note:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create note' },
      { status: 500 }
    );
  }
}

// PUT - Update existing one-on-one note
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { noteId, ...updateData } = body;
    
    if (!noteId) {
      return NextResponse.json(
        { success: false, error: 'Missing noteId' },
        { status: 400 }
      );
    }
    
    // Check if note exists
    const existingNote = await prisma.oneOnOneNote.findUnique({
      where: { id: noteId }
    });
    
    if (!existingNote) {
      return NextResponse.json(
        { success: false, error: 'Note not found' },
        { status: 404 }
      );
    }
    
    // Prepare update data
    const dataToUpdate: any = {};
    
    if (updateData.meetingDate) dataToUpdate.meetingDate = new Date(updateData.meetingDate);
    if (updateData.discussionPoints !== undefined) dataToUpdate.discussionPoints = updateData.discussionPoints;
    if (updateData.strengths !== undefined) dataToUpdate.strengths = updateData.strengths;
    if (updateData.areasForImprovement !== undefined) dataToUpdate.areasForImprovement = updateData.areasForImprovement;
    if (updateData.notes !== undefined) dataToUpdate.notes = updateData.notes;
    if (updateData.actionItems !== undefined) dataToUpdate.actionItems = updateData.actionItems;
    if (updateData.nextMeetingDate) dataToUpdate.nextMeetingDate = new Date(updateData.nextMeetingDate);
    if (updateData.followUpRequired !== undefined) dataToUpdate.followUpRequired = updateData.followUpRequired;
    if (updateData.emailTemplate !== undefined) dataToUpdate.emailTemplate = updateData.emailTemplate;
    if (updateData.emailSent !== undefined) dataToUpdate.emailSent = updateData.emailSent;
    if (updateData.emailSent && !existingNote.emailSent) dataToUpdate.emailSentAt = new Date();
    
    // Update the note
    const note = await prisma.oneOnOneNote.update({
      where: { id: noteId },
      data: dataToUpdate
    });
    
    return NextResponse.json({ success: true, note });
    
  } catch (error) {
    console.error('Error updating one-on-one note:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update note' },
      { status: 500 }
    );
  }
}

// DELETE - Delete a one-on-one note
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const noteId = searchParams.get('noteId');
    
    if (!noteId) {
      return NextResponse.json(
        { success: false, error: 'Missing noteId' },
        { status: 400 }
      );
    }
    
    await prisma.oneOnOneNote.delete({
      where: { id: noteId }
    });
    
    return NextResponse.json({ success: true });
    
  } catch (error) {
    console.error('Error deleting one-on-one note:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete note' },
      { status: 500 }
    );
  }
}

