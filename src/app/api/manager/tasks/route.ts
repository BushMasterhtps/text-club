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
  // NOTE: For "assigned_not_started", the taskType filter is already in statusWhere, so we skip it here to avoid duplication
  if (statusKey !== "pending" && statusKey !== "assigned_not_started") {
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
        // Either not promoted yet (READY) OR promoted with an open Task in PENDING that is UNASSIGNED
        // This ensures "Pending Tasks" only shows tasks available for assignment
        return {
          OR: [
            { status: "READY" as any }, // Raw messages waiting to be promoted (always unassigned)
            {
              AND: [
                { status: "PROMOTED" as any },
                { tasks: { some: { 
                  status: "PENDING" as any,
                  assignedToId: null,  // Only show unassigned tasks
                  taskType: taskType as any // Filter promoted tasks by task type
                } } },
              ],
            },
          ],
        };
      case "assigned_not_started":
        // Show tasks that are assigned but not started (PENDING with assignedToId)
        return {
          AND: [
            { status: "PROMOTED" as any },
            { tasks: { some: { 
              status: "PENDING" as any,
              assignedToId: { not: null },  // Must be assigned
              taskType: taskType as any
            } } },
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

  // (B) Assigned filter (tie the assignee to the CURRENT STATUS selection)
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
                ...(statusKey === "pending"
                  ? ({ status: "PENDING" } as any)
                  : statusKey === "in_progress"
                  ? ({ status: "IN_PROGRESS" } as any)
                  : statusKey === "assistance_required"
                  ? ({ status: "ASSISTANCE_REQUIRED" } as any)
                  : ({ status: { not: "COMPLETED" } } as any)),
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
            ...(statusKey === "pending"
              ? ({ status: "PENDING" } as any)
              : statusKey === "in_progress"
              ? ({ status: "IN_PROGRESS" } as any)
              : statusKey === "assistance_required"
              ? ({ status: "ASSISTANCE_REQUIRED" } as any)
              : ({ status: { not: "COMPLETED" } } as any)),
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
  let total = 0;
  let rows: any[] = [];
  
  try {
    // Special handling for "assigned_not_started" - query Tasks directly for accuracy
    if (statusKey === "assigned_not_started") {
      // Build task where clause
      const taskWhere: Prisma.TaskWhereInput = {
        status: "PENDING",
        assignedToId: { not: null },
        taskType: taskType as any,
      };
      
      // Add search filter if provided
      if (q) {
        taskWhere.OR = [
          { brand: { contains: q } },
          { text: { contains: q } },
          { email: { contains: q } },
          { phone: { contains: q } },
        ];
      }
      
      // Add assigned filter if provided
      if (assignedLower !== "" && assignedLower !== "any") {
        if (assignedLower === "unassigned") {
          // This shouldn't happen for assigned_not_started, but handle it
          taskWhere.assignedToId = null;
        } else {
          const userWhere: Prisma.UserWhereInput = looksLikeId(assignedRaw)
            ? { id: assignedRaw }
            : { OR: [{ name: assignedRaw }, { email: assignedRaw }] };
          taskWhere.assignedTo = userWhere;
        }
      }
      
      // Query tasks directly
      const [taskTotal, tasks] = await Promise.all([
        prisma.task.count({ where: taskWhere }),
        prisma.task.findMany({
          where: taskWhere,
          orderBy: { createdAt: sortOrder === "asc" ? "asc" : "desc" },
          skip,
          take,
          include: {
            assignedTo: { select: { id: true, name: true, email: true } },
            rawMessage: {
              select: {
                id: true,
                brand: true,
                text: true,
                email: true,
                phone: true,
                createdAt: true,
                receivedAt: true,
                status: true,
              },
            },
          },
        }),
      ]);
      
      // Transform tasks to match RawMessage format for consistency
      // CRITICAL: Only include tasks that are actually assigned (double-check)
      // This filter ensures we never return unassigned tasks, even if the query somehow returns them
      rows = tasks
        .filter(t => {
          // STRICT validation: task MUST have assignedToId AND assignedTo relation
          const isAssigned = t.assignedToId !== null && t.assignedTo !== null;
          if (!isAssigned) {
            console.error("[Manager Tasks API] CRITICAL: Task returned without assignment:", {
              taskId: t.id,
              status: t.status,
              assignedToId: t.assignedToId,
              hasAssignedTo: !!t.assignedTo,
              taskType: t.taskType
            });
            return false;
          }
          return true;
        })
        .map(t => {
          // Double-check assignment before mapping
          if (!t.assignedToId || !t.assignedTo) {
            console.error("[Manager Tasks API] CRITICAL: Task lost assignment during mapping:", t.id);
            return null;
          }
          
          return {
            id: t.rawMessage?.id || t.id, // Use rawMessage ID if available, fallback to task ID
            brand: t.brand || t.rawMessage?.brand || null,
            text: t.text || t.rawMessage?.text || null,
            email: t.email || t.rawMessage?.email || null,
            phone: t.phone || t.rawMessage?.phone || null,
            createdAt: t.createdAt,
            receivedAt: t.rawMessage?.receivedAt || t.createdAt,
            status: t.rawMessage?.status || "PROMOTED",
            tasks: [{
              id: t.id,
              status: t.status,
              assignedToId: t.assignedToId, // MUST be non-null
              assignedTo: t.assignedTo, // MUST be populated
              taskType: t.taskType,
            }],
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null); // Remove any null entries
      
      total = taskTotal;
      
      console.log("[Manager Tasks API] assigned_not_started direct query:", {
        taskTotal,
        tasksReturned: tasks.length,
        rowsAfterFilter: rows.length,
        filteredOut: tasks.length - rows.length,
        sampleRow: rows[0] ? {
          id: rows[0].id,
          hasTask: !!rows[0].tasks?.[0],
          assignedToId: rows[0].tasks?.[0]?.assignedToId,
          assignedToName: rows[0].tasks?.[0]?.assignedTo?.name || rows[0].tasks?.[0]?.assignedTo?.email,
          hasAssignedTo: !!rows[0].tasks?.[0]?.assignedTo
        } : null,
        allRowsHaveAssignment: rows.every(r => r.tasks?.[0]?.assignedToId && r.tasks?.[0]?.assignedTo)
      });
    } else {
      // Original RawMessage query for other statuses
    // Debug logging for pending status queries
    if (statusKey === "pending") {
      console.log("[Manager Tasks API] Pending query:", {
        taskType,
        where: JSON.stringify(where, null, 2),
        skip,
        take
      });
    }
    
    [total, rows] = await Promise.all([
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
                ? ({ status: "PENDING", assignedToId: null, taskType: taskType as any } as any)  // Only unassigned pending tasks
                : statusKey === "in_progress"
                ? ({ status: "IN_PROGRESS", taskType: taskType as any } as any)
                : statusKey === "assistance_required"
                ? ({ status: "ASSISTANCE_REQUIRED", taskType: taskType as any } as any)
                : ({ status: { not: "COMPLETED" }, taskType: taskType as any } as any),
            orderBy: { createdAt: "desc" },
            take: 1,
            include: {
              assignedTo: { select: { id: true, name: true, email: true } },
            },
          },
        },
      }),
    ]);
    
    // Logging for pending (assigned_not_started is logged above)
    if (statusKey === "pending") {
      console.log("[Manager Tasks API] Query result:", {
        statusKey,
        total,
        rowsCount: rows.length,
        sampleRow: rows[0] ? { 
          id: rows[0].id, 
          status: rows[0].status, 
          taskCount: rows[0].tasks?.length,
          task: rows[0].tasks?.[0] ? {
            id: rows[0].tasks[0].id,
            status: rows[0].tasks[0].status,
            assignedToId: rows[0].tasks[0].assignedToId,
            taskType: rows[0].tasks[0].taskType
          } : null
        } : null,
        where: JSON.stringify(where, null, 2)
      });
    }
    }
  } catch (error: any) {
    console.error("[Manager Tasks API] Error querying tasks:", error);
    console.error("[Manager Tasks API] Error details:", {
      message: error?.message,
      code: error?.code,
      meta: error?.meta
    });
    // If there's a database schema mismatch (e.g., new fields not migrated), return empty result
    // This prevents the API from crashing but allows the UI to show an error
    return NextResponse.json({
      success: false,
      error: error?.message || "Database query failed",
      items: [],
      total: 0,
      pageSize: take,
      offset: skip,
    }, { status: 500 });
  }

  /* ---------- normalize for UI ---------- */
  // For "assigned_not_started", we already queried Tasks directly, so no filtering needed
  // For other statuses, use the rows as-is
  const items = rows.map((r) => {
    const t = r.tasks?.[0] ?? null;
    
    return {
      id: r.id,
      brand: r.brand ?? null,
      text: r.text ?? null,
      email: r.email ?? null,
      phone: r.phone ?? null,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
      receivedAt: (r.receivedAt ?? r.createdAt) instanceof Date ? (r.receivedAt ?? r.createdAt).toISOString() : (r.receivedAt ?? r.createdAt),
      rawStatus: r.status,
      taskId: t?.id ?? null,
      assignedToId: t?.assignedToId ?? null,
      assignedTo: t?.assignedTo ?? null,  // This must be populated for assigned_not_started
      taskStatus: t?.status ?? null,
    };
  });
  
  // Update total count for assigned_not_started to reflect filtered items
  const finalTotal = statusKey === "assigned_not_started" ? items.length : total;

  return NextResponse.json({
    success: true,
    items,
    total: finalTotal ?? total,  // Use filtered total for assigned_not_started, otherwise use DB total
    pageSize: take,
    offset: skip,
  });
}