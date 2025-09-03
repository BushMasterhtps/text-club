// src/app/api/manager/spam/counts/route.ts
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

export async function GET() {
  try {
    const [ready, spamReview] = await Promise.all([
      prisma.rawMessage.count({ where: { status: "READY" } }),
      prisma.rawMessage.count({ where: { status: "SPAM_REVIEW" } }),
    ]);

    return NextResponse.json({ success: true, ready, spamReview });
  } catch (err) {
    console.error("spam counts error:", err);
    return NextResponse.json({ success: false, error: "counts failed" }, { status: 500 });
  }
}