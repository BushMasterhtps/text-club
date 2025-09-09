// src/app/api/spam/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// same normalizer used elsewhere
function normText(s: unknown) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** GET /api/spam — list rules */
export async function GET() {
  try {
    const rules = await prisma.spamRule.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, pattern: true, patternNorm: true, enabled: true, createdAt: true, brand: true },
    });
    // Transform data to match frontend expectations
    const transformedRules = rules.map(rule => ({
      id: rule.id,
      phrase: rule.pattern, // Map pattern to phrase for frontend
      brand: rule.brand,
      createdAt: rule.createdAt.toISOString(),
      enabled: rule.enabled
    }));
    
    return NextResponse.json({ success: true, rules: transformedRules });
  } catch (err) {
    console.error("spam GET error:", err);
    return NextResponse.json({ success: false, error: "Failed to load rules" }, { status: 500 });
  }
}

/** POST /api/spam — create one rule
 * body: { pattern: string, phrase: string, brand?: string, enabled?: boolean }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    // Support both 'phrase' and 'pattern' for frontend compatibility
    const pattern = String(body?.pattern ?? body?.phrase ?? "").trim();
    const brand = body?.brand ? String(body.brand).trim() : null;
    const enabled = typeof body?.enabled === "boolean" ? body.enabled : true;

    if (!pattern) {
      return NextResponse.json({ success: false, error: "Pattern is required" }, { status: 400 });
    }

    const patternNorm = normText(pattern);

    const rule = await prisma.spamRule.create({
      data: { pattern, patternNorm, brand, enabled },
      select: { id: true, pattern: true, patternNorm: true, brand: true, enabled: true, createdAt: true },
    });

    return NextResponse.json({ success: true, rule });
  } catch (err: any) {
    // unique constraint on patternNorm -> duplicate
    if (err?.code === "P2002") {
      return NextResponse.json({ success: false, error: "Duplicate pattern" }, { status: 409 });
    }
    console.error("spam POST error:", err);
    return NextResponse.json({ success: false, error: "Failed to create rule" }, { status: 500 });
  }
}

/** PATCH /api/spam — update one rule
 * body: { id: string, pattern?: string, enabled?: boolean }
 */
export async function PATCH(req: Request) {
  try {
    const body = (await req.json()) as { id?: string; pattern?: string; enabled?: boolean };
    if (!body?.id) {
      return NextResponse.json({ success: false, error: "id is required" }, { status: 400 });
    }

    const data: any = {};
    if (typeof body.enabled === "boolean") data.enabled = body.enabled;

    if (typeof body.pattern === "string") {
      const nextPattern = body.pattern.trim();
      if (!nextPattern) {
        return NextResponse.json({ success: false, error: "pattern cannot be empty" }, { status: 400 });
      }
      data.pattern = nextPattern;
      data.patternNorm = normText(nextPattern);
    }

    const rule = await prisma.spamRule.update({
      where: { id: body.id },
      data,
      select: { id: true, pattern: true, patternNorm: true, enabled: true, createdAt: true },
    });

    return NextResponse.json({ success: true, rule });
  } catch (err: any) {
    if (err?.code === "P2002") {
      return NextResponse.json({ success: false, error: "Duplicate pattern" }, { status: 409 });
    }
    console.error("spam PATCH error:", err);
    return NextResponse.json({ success: false, error: "Failed to update rule" }, { status: 500 });
  }
}

/** DELETE /api/spam — delete one
 * body: { id: string }
 */
export async function DELETE(req: Request) {
  try {
    const body = (await req.json()) as { id?: string };
    if (!body?.id) {
      return NextResponse.json({ success: false, error: "id is required" }, { status: 400 });
    }
    await prisma.spamRule.delete({ where: { id: body.id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("spam DELETE error:", err);
    return NextResponse.json({ success: false, error: "Failed to delete rule" }, { status: 500 });
  }
}