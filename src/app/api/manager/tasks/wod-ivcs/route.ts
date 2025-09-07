import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

type StatusKey =
  | "pending"
  | "in_progress"
  | "assistance_required"
  | "completed"
  | "all";

function parseStatus(s: string | null): StatusKey {
  const v = (s ?? "").toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_") as StatusKey;
  switch (v) {
    case "pending":
    case "in_progress":
    case "assistance_required":
    case "completed":
    case "all":
      return v;
    default:
      return "pending";
  }
}

function looksLikeId(s: string) {
  return /^[a-z0-9_-]{10,}$/i.test(s);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const statusKey = parseStatus(url.searchParams.get("status"));
  const q = (url.searchParams.get("q") ?? url.searchParams.get("search") ?? "").trim();
  const wodIvcsSource = url.searchParams.get("wodIvcsSource") ?? url.searchParams.get("source") ?? null;
  const ageFilter = url.searchParams.get("ageFilter") ?? url.searchParams.get("orderAge") ?? null;

  const take = Math.min(Math.max(Number(url.searchParams.get("take") ?? 50), 1), 200);
  const skip = Math.max(Number(url.searchParams.get("skip") ?? 0), 0);
  
  // Sorting parameters
  const sortBy = url.searchParams.get("sortBy") ?? "createdAt";
  const sortOrder = url.searchParams.get("sortOrder") ?? "desc";

  // Assigned filter - support both "assigned" and "assignedFilter" parameters
  const assignedRaw = url.searchParams.get("assigned") ?? url.searchParams.get("assignedFilter") ?? "any";
  const assignedLower = assignedRaw.trim().toLowerCase();

  /* ---------- build dynamic where ---------- */
  const and: Prisma.TaskWhereInput[] = [];

  // (A) Task type filter - only WOD/IVCS tasks
  and.push({ taskType: "WOD_IVCS" });

  // (B) WOD/IVCS source filter
  if (wodIvcsSource) {
    and.push({ wodIvcsSource: wodIvcsSource as any });
  }

  // (C) Status filter
  const statusWhere: Prisma.TaskWhereInput | undefined = (() => {
    switch (statusKey) {
      case "pending":
        return { status: "PENDING" };
      case "in_progress":
        return { status: "IN_PROGRESS" };
      case "assistance_required":
        return { status: "ASSISTANCE_REQUIRED" };
      case "completed":
        return { status: "COMPLETED" };
      case "all":
        return undefined; // no restriction
    }
  })();

  if (statusWhere) and.push(statusWhere);

  // (D) Assigned filter
  if (assignedLower !== "" && assignedLower !== "any" && assignedLower !== "anyone") {
    if (assignedLower === "unassigned") {
      and.push({ assignedToId: null });
    } else {
      const userWhere: Prisma.UserWhereInput = looksLikeId(assignedRaw)
        ? { id: assignedRaw }
        : { OR: [{ name: assignedRaw }, { email: assignedRaw }] };

      and.push({
        assignedTo: userWhere,
      });
    }
  }

  // (E) Age filter
  if (ageFilter) {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    
    switch (ageFilter) {
      case "today":
        and.push({
          orderDate: {
            gte: new Date(now - oneDay)
          }
        });
        break;
      case "today":
        and.push({
          orderDate: {
            gte: new Date(now - oneDay)
          }
        });
        break;
      case "1-3":
        and.push({
          AND: [
            { orderDate: { gte: new Date(now - 3 * oneDay) } },
            { orderDate: { lt: new Date(now - oneDay) } }
          ]
        });
        break;
      case "4-7":
        and.push({
          AND: [
            { orderDate: { gte: new Date(now - 7 * oneDay) } },
            { orderDate: { lt: new Date(now - 3 * oneDay) } }
          ]
        });
        break;
      case "8+":
        and.push({
          orderDate: {
            lt: new Date(now - 7 * oneDay)
          }
        });
        break;
    }
  }

  // (F) Search across WOD/IVCS specific fields
  if (q) {
    and.push({
      OR: [
        { brand: { contains: q } },
        { customerName: { contains: q } },
        { documentNumber: { contains: q } },
        { webOrder: { contains: q } },
        { email: { contains: q } },
      ],
    });
  }

  const where: Prisma.TaskWhereInput =
    and.length > 0 ? { AND: and } : {};

  /* ---------- build orderBy ---------- */
  const buildOrderBy = (): Prisma.TaskOrderByWithRelationInput => {
    const direction = sortOrder === "asc" ? "asc" : "desc";
    
    switch (sortBy) {
      case "brand":
        return { brand: direction };
      case "customerName":
        return { customerName: direction };
      case "documentNumber":
        return { documentNumber: direction };
      case "webOrder":
        return { webOrder: direction };
      case "amount":
        return { amount: direction };
      case "webOrderDifference":
        return { webOrderDifference: direction };
      case "nsVsWebDiscrepancy":
        return { nsVsWebDiscrepancy: direction };
      case "webVsNsDifference":
        return { webVsNsDifference: direction };
      case "orderAgeDays":
        // Sort by order date (newest first for age calculation)
        return { orderDate: direction };
      case "wodIvcsSource":
        return { wodIvcsSource: direction };
      case "assignedTo":
        return { 
          assignedTo: {
            name: direction
          }
        };
      case "createdAt":
      default:
        return { createdAt: direction };
    }
  };

  /* ---------- query: total + page ---------- */
  const [total, rows] = await Promise.all([
    prisma.task.count({ where }),
    prisma.task.findMany({
      where,
      orderBy: buildOrderBy(),
      skip,
      take,
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
      },
    }),
  ]);

  /* ---------- normalize for UI ---------- */
  const items = rows.map((task) => {
    // Calculate order age based on the orderDate field
    let orderAge = null;
    let orderAgeDays = null;
    
    if (task.orderDate) {
      orderAgeDays = Math.floor((Date.now() - task.orderDate.getTime()) / (1000 * 60 * 60 * 24));
      orderAge = orderAgeDays === 0 ? "Today" : `${orderAgeDays} day${orderAgeDays === 1 ? '' : 's'} old`;
    }

    return {
      id: task.id,
      brand: task.brand ?? null,
      text: null, // WOD/IVCS tasks don't have text
      email: task.email ?? null,
      phone: task.phone ?? null,
      createdAt: task.createdAt,
      receivedAt: task.createdAt, // Use createdAt as receivedAt for WOD/IVCS
      rawStatus: null, // WOD/IVCS tasks don't have rawStatus
      taskId: task.id,
      assignedToId: task.assignedToId,
      assignedTo: task.assignedTo,
      taskStatus: task.status,
      
      // WOD/IVCS specific fields
      wodIvcsSource: task.wodIvcsSource,
      documentNumber: task.documentNumber,
      warehouseEdgeStatus: task.warehouseEdgeStatus,
      amount: task.amount,
      webOrderDifference: task.webOrderDifference,
      webOrder: task.webOrder,
      webOrderSubtotal: task.webOrderSubtotal,
      webOrderTotal: task.webOrderTotal,
      nsVsWebDiscrepancy: task.nsVsWebDiscrepancy,
      customerName: task.customerName,
      netSuiteTotal: task.netSuiteTotal,
      webTotal: task.webTotal,
      webVsNsDifference: task.webVsNsDifference,
      shippingCountry: task.shippingCountry,
      shippingState: task.shippingState,
      
      // Order age fields
      orderDate: task.orderDate,
      orderAge: orderAge,
      orderAgeDays: orderAgeDays,
    };
  });

  return NextResponse.json({
    success: true,
    items,
    total,
    pageSize: take,
    offset: skip,
  });
}
