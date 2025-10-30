// src/app/api/manager/tasks/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

/* --------------------------------- helpers -------------------------------- */

type StatusKey =
  | "pending"
  | "in_progress"
  | "assistance_required"
  | "spam_review"
  | "resolved"
  | "completed"
  | "all";

function parseStatus(s: string | null): StatusKey {
  const v = (s ?? "").toLowerCase().replace(/\s+/g, "_") as StatusKey;
  switch (v) {
    case "pending":
    case "in_progress":
    case "assistance_required":
    case "spam_review":
    case "resolved":
    case "completed":
    case "all":
      return v;
    default:
      return "pending";
  }
}

// read from either query string or JSON body (first match wins)
async function getParam(req: Request, keys: string[]) {
  const url = new URL(req.url);
  for (const k of keys) {
    const v = url.searchParams.get(k);
    if (v != null && v !== "") return v;
  }
  try {
    const body = await req.clone().json();
    for (const k of keys) {
      if (body?.[k] != null && body[k] !== "") return String(body[k]);
    }
  } catch {
    /* ignore */
  }
  return null;
}

function looksLikeId(s: string) {
  return /^[a-z0-9_-]{10,}$/i.test(s);
}

/* ------------------------------- route: GET ------------------------------- */
/**
 * Returns rows from RawMessage with the *latest open task (if any)* included.
 * All status/assignee/search filters are pushed into Prisma `where` so
 * pagination + total are accurate.
 */
export async function GET(req: Request) {
  /* ---------- read filters ---------- */
  const url = new URL(req.url);
  const statusKey = parseStatus(url.searchParams.get("status"));
  const q = (url.searchParams.get("q") ?? "").trim();
  const taskType = url.searchParams.get("taskType") ?? "TEXT_CLUB"; // Filter by task type

  const take = Math.min(Math.max(Number(url.searchParams.get("take") ?? 50), 1), 200);
  const skip = Math.max(Number(url.searchParams.get("skip") ?? 0), 0);
  
  // Sorting parameters
  const sortBy = url.searchParams.get("sortBy") ?? "receivedAt";
  const sortOrder = url.searchParams.get("sortOrder") ?? "desc";

  // tolerant "assigned" key: any | unassigned | id | name | email
  const assignedRaw =
    (await getParam(req, [
      "assigned",
      "assignee",
      "assignedToId",
      "assignedTo",
      "userId",
      "user",
      "agentId",
      "agent",
    ])) ?? "any";
  const assignedLower = assignedRaw.trim().toLowerCase();

  /* ---------- build dynamic where ---------- */
  const and: Prisma.RawMessageWhereInput[] = [];

  // (A) Task type filter - only apply to promoted raw messages that have tasks
  // For READY raw messages, we don't filter by task type since they haven't been promoted yet
  if (statusKey !== "pending") {
    and.push({
      tasks: {
        some: {
          taskType: taskType as any
        }
      }
    });
  }

  // (B) Status mapping -> RawMessage/Task relational filter
  // We push these into the query so count/paging match what the UI sees.
  const statusWhere: Prisma.RawMessageWhereInput | undefined = (() => {
    switch (statusKey) {
      case "pending":
        // Either not promoted yet (READY) OR promoted with an open Task in PENDING
        return {
          OR: [
            { status: "READY" as any }, // Raw messages waiting to be promoted
            {
              AND: [
                { status: "PROMOTED" as any },
                { tasks: { some: { 
                  status: "PENDING" as any,
                  taskType: taskType as any // Filter promoted tasks by task type
                } } },
              ],
            },
          ],
        };
      case "in_progress":
        return {
          AND: [
            { status: "PROMOTED" as any },
            { tasks: { some: { 
              status: "IN_PROGRESS" as any,
              taskType: taskType as any // Filter by task type
            } } },
          ],
        };
      case "assistance_required":
        return {
          AND: [
            { status: "PROMOTED" as any },
            { tasks: { some: { status: "ASSISTANCE_REQUIRED" as any } } },
          ],
        };
      case "resolved":
        return {
          AND: [
            { status: "PROMOTED" as any },
            { tasks: { some: { status: "RESOLVED" as any } } },
          ],
        };
      case "completed":
        return {
          AND: [
            { status: "PROMOTED" as any },
            { tasks: { some: { status: "COMPLETED" as any } } },
          ],
        };
      case "spam_review":
        return { status: "SPAM_REVIEW" as any };
      case "all":
        return undefined; // no restriction
    }
  })();

  if (statusWhere) and.push(statusWhere);

  // (B) Assigned filter
  if (assignedLower !== "" && assignedLower !== "any") {
    if (assignedLower === "unassigned") {
      // Either not promoted (READY) OR has an open task with no agent yet
      and.push({
        OR: [
          { status: "READY" as any },
          {
            tasks: {
              some: {
                assignedToId: null,
                status: { not: "COMPLETED" as any },
              },
            },
          },
        ],
      });
    } else {
      const userWhere: Prisma.UserWhereInput = looksLikeId(assignedRaw)
        ? { id: assignedRaw }
        : { OR: [{ name: assignedRaw }, { email: assignedRaw }] };

      and.push({
        tasks: {
          some: {
            status: { not: "COMPLETED" as any },
            assignedTo: userWhere,
          },
        },
      });
    }
  }

  // (C) Search across common fields (SQLite-safe: no `mode: 'insensitive'`)
  if (q) {
    and.push({
      OR: [
        { brand: { contains: q } },
        { text: { contains: q } },
        { email: { contains: q } },
        { phone: { contains: q } },
      ],
    });
  }

  const where: Prisma.RawMessageWhereInput =
    and.length > 0 ? { AND: and } : {};

  /* ---------- build orderBy ---------- */
  const buildOrderBy = (): Prisma.RawMessageOrderByWithRelationInput => {
    const direction = sortOrder === "asc" ? "asc" : "desc";
    
    switch (sortBy) {
      case "brand":
        return { brand: direction };
      case "text":
        return { text: direction };
      case "createdAt":
        return { createdAt: direction };
      case "assignedTo":
        // Sort by assigned user name/email
        return { 
          tasks: {
            _count: direction
          }
        };
      case "receivedAt":
      default:
        return { receivedAt: direction };
    }
  };

  /* ---------- query: total + page ---------- */
  const [total, rows] = await Promise.all([
    prisma.rawMessage.count({ where }),
    prisma.rawMessage.findMany({
      where,
      orderBy: buildOrderBy(),
      skip,
      take,
      include: {
        // latest task matching the selected status (falling back to any open task)
        tasks: {
          where:
            statusKey === "pending"
              ? ({ status: "PENDING" } as any)
              : statusKey === "in_progress"
              ? ({ status: "IN_PROGRESS" } as any)
              : statusKey === "assistance_required"
              ? ({ status: "ASSISTANCE_REQUIRED" } as any)
              : ({ status: { not: "COMPLETED" } } as any),
          orderBy: { createdAt: "desc" },
          take: 1,
          include: {
            assignedTo: { select: { id: true, name: true, email: true } },
          },
        },
      },
    }),
  ]);

  /* ---------- normalize for UI ---------- */
  const items = rows.map((r) => {
    const t = r.tasks?.[0] ?? null;
    return {
      id: r.id,
      brand: r.brand ?? null,
      text: r.text ?? null,
      email: r.email ?? null,
      phone: r.phone ?? null,
      createdAt: r.createdAt,
      receivedAt: r.receivedAt ?? r.createdAt,
      rawStatus: r.status,
      taskId: t?.id ?? null,
      assignedToId: t?.assignedToId ?? null,
      assignedTo: t?.assignedTo ?? null,
      taskStatus: t?.status ?? null,
    };
  });

  return NextResponse.json({
    success: true,
    items,
    total,          // <-- real DB total (not items.length)
    pageSize: take,
    offset: skip,
  });
}