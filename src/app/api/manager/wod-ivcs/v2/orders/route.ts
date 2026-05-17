export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { apiAuthDeniedResponse, requireManagerApiAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertWodIvcsV2Enabled } from "@/lib/wod-ivcs/api-guard";

export async function GET(request: NextRequest) {
  const disabled = assertWodIvcsV2Enabled();
  if (disabled) return disabled;

  const auth = await requireManagerApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  try {
    const url = new URL(request.url);
    const take = Math.min(Math.max(Number(url.searchParams.get("take") ?? 50), 1), 200);
    const skip = Math.max(Number(url.searchParams.get("skip") ?? 0), 0);
    const q = (url.searchParams.get("q") ?? "").trim();
    const queue = url.searchParams.get("queue");
    const cityBeauty = url.searchParams.get("cityBeauty");
    const fivePlus = url.searchParams.get("fivePlus");

    const and: Prisma.WodIvcsOrderWhereInput[] = [{ archivedAt: null }];

    if (queue) and.push({ operationalQueue: queue as Prisma.EnumWodIvcsOperationalQueueFilter });
    if (cityBeauty === "true") and.push({ isCityBeauty: true });
    if (fivePlus === "true") and.push({ agingIsFivePlus: true });
    if (q) {
      and.push({
        OR: [
          { documentNumber: { contains: q, mode: "insensitive" } },
          { customerName: { contains: q, mode: "insensitive" } },
          { customerEmail: { contains: q, mode: "insensitive" } },
        ],
      });
    }

    const where: Prisma.WodIvcsOrderWhereInput = { AND: and };

    const [total, orders] = await Promise.all([
      prisma.wodIvcsOrder.count({ where }),
      prisma.wodIvcsOrder.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        take,
        skip,
        include: {
          cases: { select: { sourceReportType: true, presenceState: true, lastSeenAt: true } },
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      total,
      orders: orders.map((o) => ({
        id: o.id,
        documentNumber: o.documentNumber,
        operationalQueue: o.operationalQueue,
        operationalStatus: o.operationalStatus,
        customerName: o.customerName,
        customerEmail: o.customerEmail,
        presenceNetSuite: o.presenceNetSuite,
        presenceAging: o.presenceAging,
        isCityBeauty: o.isCityBeauty,
        agingIsFivePlus: o.agingIsFivePlus,
        netSuiteDaysOld: o.netSuiteDaysOld,
        itemSummaryJson: o.itemSummaryJson,
        createdAt: o.createdAt.toISOString(),
        updatedAt: o.updatedAt.toISOString(),
        cases: o.cases.map((c) => ({
          ...c,
          lastSeenAt: c.lastSeenAt?.toISOString() ?? null,
        })),
      })),
    });
  } catch (error) {
    console.error("[wod-ivcs/v2/orders]", error);
    return NextResponse.json(
      { success: false, error: "Failed to load orders" },
      { status: 500 }
    );
  }
}
