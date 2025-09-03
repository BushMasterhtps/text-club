import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from 'bcryptjs';

// GET: list users (agents and managers)
export async function GET() {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isLive: true,
        lastSeen: true,
      },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ success: true, users });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || "Failed to load users" }, { status: 500 });
  }
}

// POST: create a user with default password
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const name = (body?.name ?? null) as string | null;
    const email = String(body?.email || "").trim();
    const role = (body?.role === "MANAGER" ? "MANAGER" : body?.role === "MANAGER_AGENT" ? "MANAGER_AGENT" : "AGENT") as "MANAGER" | "AGENT" | "MANAGER_AGENT";
    const tempPassword = body?.tempPassword || 'welcome123';

    if (!email) return NextResponse.json({ success: false, error: "Email required" }, { status: 400 });

    // Hash the temporary password
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    const created = await prisma.user.create({
      data: { 
        name, 
        email, 
        role, 
        password: hashedPassword,
        mustChangePassword: true,
        isActive: true
      },
      select: { id: true, name: true, email: true, role: true, isLive: true, lastSeen: true },
    });
    
    return NextResponse.json({ 
      success: true, 
      user: created,
      message: `User created with temporary password: ${tempPassword}. They will be prompted to change it on first login.`
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || "Failed to create user" }, { status: 500 });
  }
}

// DELETE: remove access (set isLive to false, clear lastSeen)
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json({ success: false, error: "User ID required" }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { 
        isLive: false,
        lastSeen: null 
      },
      select: { id: true, email: true, isLive: true, lastSeen: true },
    });

    return NextResponse.json({ 
      success: true, 
      message: `Access removed for ${updated.email}`,
      user: updated 
    });
  } catch (err: any) {
    return NextResponse.json({ 
      success: false, 
      error: err?.message || "Failed to remove access" 
    }, { status: 500 });
  }
}
