import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Trello Import API
 * Allows managers to manually add Trello card completion counts for agents
 */

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const dateStart = url.searchParams.get("dateStart");
    const dateEnd = url.searchParams.get("dateEnd");
    
    // Default to last 30 days if no range specified
    const now = new Date();
    const defaultEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    const defaultStart = new Date(defaultEnd);
    defaultStart.setDate(defaultStart.getDate() - 30);
    defaultStart.setHours(0, 0, 0, 0);

    const start = dateStart ? new Date(dateStart) : defaultStart;
    const end = dateEnd ? new Date(dateEnd) : defaultEnd;

    const entries = await prisma.trelloCompletion.findMany({
      where: {
        date: {
          gte: start,
          lte: end
        }
      },
      include: {
        agent: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: [
        { date: 'desc' },
        { createdAt: 'desc' }
      ]
    });

    return NextResponse.json({
      success: true,
      entries: entries.map(e => ({
        id: e.id,
        date: e.date.toISOString(),
        agentId: e.agentId,
        agentName: e.agent.name || e.agent.email,
        agentEmail: e.agent.email,
        cardsCount: e.cardsCount,
        createdAt: e.createdAt.toISOString(),
        createdBy: e.createdBy
      }))
    });
  } catch (error) {
    console.error("Error fetching Trello completions:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch Trello completions" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { date, agentId, cardsCount, createdBy } = body;

    if (!date || !agentId || cardsCount === undefined || cardsCount === null) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: date, agentId, cardsCount" },
        { status: 400 }
      );
    }

    if (cardsCount < 0) {
      return NextResponse.json(
        { success: false, error: "Cards count must be >= 0" },
        { status: 400 }
      );
    }

    // Verify agent exists
    const agent = await prisma.user.findUnique({
      where: { id: agentId },
      select: { id: true, name: true, email: true }
    });

    if (!agent) {
      return NextResponse.json(
        { success: false, error: "Agent not found" },
        { status: 404 }
      );
    }

    // Parse date and set to start of day UTC
    const entryDate = new Date(date);
    entryDate.setHours(0, 0, 0, 0);

    // Upsert: create or update if already exists for this agent + date
    const entry = await prisma.trelloCompletion.upsert({
      where: {
        date_agentId: {
          date: entryDate,
          agentId: agentId
        }
      },
      create: {
        date: entryDate,
        agentId: agentId,
        cardsCount: parseInt(cardsCount),
        createdBy: createdBy || null
      },
      update: {
        cardsCount: parseInt(cardsCount),
        createdBy: createdBy || null
      },
      include: {
        agent: {
          select: {
            name: true,
            email: true
          }
        }
      }
    });

    return NextResponse.json({
      success: true,
      entry: {
        id: entry.id,
        date: entry.date.toISOString(),
        agentName: entry.agent.name || entry.agent.email,
        agentEmail: entry.agent.email,
        cardsCount: entry.cardsCount
      },
      message: `Added ${cardsCount} Trello cards for ${entry.agent.name || entry.agent.email} on ${entryDate.toLocaleDateString()}`
    });
  } catch (error) {
    console.error("Error adding Trello completion:", error);
    return NextResponse.json(
      { success: false, error: "Failed to add Trello completion" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Entry ID required" },
        { status: 400 }
      );
    }

    await prisma.trelloCompletion.delete({
      where: { id }
    });

    return NextResponse.json({
      success: true,
      message: "Trello entry deleted"
    });
  } catch (error) {
    console.error("Error deleting Trello completion:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete entry" },
      { status: 500 }
    );
  }
}

