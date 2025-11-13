import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Update agent specializations (agentTypes)
 */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { agentId, agentTypes } = body;

    if (!agentId || !Array.isArray(agentTypes)) {
      return NextResponse.json({
        success: false,
        error: 'agentId and agentTypes array required'
      }, { status: 400 });
    }

    // Validate agentTypes values
    const validTypes = ['TEXT_CLUB', 'WOD_IVCS', 'EMAIL_REQUESTS', 'YOTPO', 'HOLDS', 'STANDALONE_REFUNDS'];
    const invalidTypes = agentTypes.filter(type => !validTypes.includes(type));
    
    if (invalidTypes.length > 0) {
      return NextResponse.json({
        success: false,
        error: `Invalid agent types: ${invalidTypes.join(', ')}`
      }, { status: 400 });
    }

    // Update the agent's types
    const updatedAgent = await prisma.user.update({
      where: { id: agentId },
      data: {
        agentTypes: agentTypes
      },
      select: {
        id: true,
        email: true,
        name: true,
        agentTypes: true
      }
    });

    return NextResponse.json({
      success: true,
      agent: updatedAgent,
      message: `Updated agent specializations for ${updatedAgent.name || updatedAgent.email}`
    });

  } catch (error) {
    console.error('Error updating agent types:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to update agent types'
    }, { status: 500 });
  }
}

