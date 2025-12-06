import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Search WOD/IVCS tasks by order number (documentNumber)
 * Returns all tasks, duplicates, and import history for a given order number
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orderNumber = searchParams.get("orderNumber");

    if (!orderNumber || orderNumber.trim() === "") {
      return NextResponse.json(
        { error: "Order number is required" },
        { status: 400 }
      );
    }

    const searchTerm = orderNumber.trim().toUpperCase();

    // 1. Find ALL tasks with this documentNumber (any status)
    // Use case-insensitive search - first find matching IDs with raw SQL
    const matchingTaskIds = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT t.id
      FROM "Task" t
      WHERE t."taskType" = 'WOD_IVCS'
        AND UPPER(TRIM(COALESCE(t."documentNumber", ''))) = ${searchTerm}
      ORDER BY t."createdAt" DESC
    `;

    const taskIds = matchingTaskIds.map(t => t.id);

    // 2. Find ALL duplicate records for this order number (case-insensitive)
    const matchingDuplicateIds = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM "ImportDuplicate"
      WHERE UPPER(TRIM(COALESCE("documentNumber", ''))) = ${searchTerm}
    `;

    const duplicateIds = matchingDuplicateIds.map(d => d.id);

    const duplicateRecords = duplicateIds.length > 0
      ? await prisma.importDuplicate.findMany({
          where: {
            id: {
              in: duplicateIds,
            },
          },
          include: {
            importSession: {
              select: {
                id: true,
                fileName: true,
                importedAt: true,
                importedBy: true,
                source: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        })
      : [];

    // 2b. Get original task IDs from duplicate records
    const originalTaskIds = duplicateRecords
      .map(dup => dup.originalTaskId)
      .filter((id): id is string => id !== null);

    // 2c. Fetch original tasks that were referenced in duplicates
    const originalTasksFromDuplicates = originalTaskIds.length > 0
      ? await prisma.task.findMany({
          where: {
            id: {
              in: originalTaskIds,
            },
            taskType: "WOD_IVCS",
          },
          include: {
            assignedTo: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            completedByUser: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        })
      : [];

    // 2d. Combine all tasks (direct matches + original tasks from duplicates)
    const allTaskIdsSet = new Set([
      ...taskIds,
      ...originalTasksFromDuplicates.map(t => t.id),
    ]);
    
    const allTasksCombined = Array.from(allTaskIdsSet).length > 0
      ? await prisma.task.findMany({
          where: {
            id: {
              in: Array.from(allTaskIdsSet),
            },
          },
          include: {
            assignedTo: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            completedByUser: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        })
      : [];

    // 3. Count how many times this order was imported (from ImportSession)
    // Find import sessions that have duplicates with this order number
    const importSessionsWithOrder = duplicateIds.length > 0
      ? await prisma.importSession.findMany({
          where: {
            taskType: "WOD_IVCS",
            duplicateRecords: {
              some: {
                id: {
                  in: duplicateIds,
                },
              },
            },
          },
          include: {
            duplicateRecords: {
              where: {
                id: {
                  in: duplicateIds,
                },
              },
            },
          },
        })
      : [];

    // Use the combined tasks list (includes direct matches + original tasks from duplicates)
    const allTasks = allTasksCombined;

    // Also check if any tasks were successfully imported (not duplicates)
    const successfullyImportedCount = allTasks.filter(
      (task) => task.status !== "PENDING" || task.assignedToId !== null
    ).length;

    // 4. Get the original task (first one created) if it exists
    const originalTask = allTasks.length > 0 
      ? allTasks[allTasks.length - 1] // Oldest task (last in desc order, so we reverse)
      : null;

    // 5. Get completed task(s) - there should typically be only one
    const completedTasks = allTasks.filter(
      (task) => task.status === "COMPLETED" || task.status === "RESOLVED"
    );

    // 6. Count total imports (successful + duplicates)
    const totalImportCount = importSessionsWithOrder.length + successfullyImportedCount;

    // 7. Count total duplicates prevented
    const totalDuplicateCount = duplicateRecords.length;

    // 8. Format response
    const response = {
      orderNumber: searchTerm,
      summary: {
        totalTasks: allTasks.length,
        totalImports: totalImportCount,
        totalDuplicatesPrevented: totalDuplicateCount,
        completedTasks: completedTasks.length,
        originalTaskCreatedAt: originalTask?.createdAt || null,
      },
      completedTasks: completedTasks.map((task) => ({
        id: task.id,
        completedAt: task.endTime || task.completedAt,
        completedBy: task.completedByUser
          ? {
              id: task.completedByUser.id,
              name: task.completedByUser.name,
              email: task.completedByUser.email,
            }
          : task.assignedTo
          ? {
              id: task.assignedTo.id,
              name: task.assignedTo.name,
              email: task.assignedTo.email,
            }
          : null,
        disposition: task.disposition,
        status: task.status,
        createdAt: task.createdAt,
        assignedTo: task.assignedTo
          ? {
              id: task.assignedTo.id,
              name: task.assignedTo.name,
              email: task.assignedTo.email,
            }
          : null,
        amount: task.amount ? Number(task.amount) : null,
        brand: task.brand,
        wodIvcsSource: task.wodIvcsSource,
        customerName: task.customerName,
        webOrder: task.webOrder,
      })),
      allTasks: allTasks.map((task) => ({
        id: task.id,
        status: task.status,
        createdAt: task.createdAt,
        assignedTo: task.assignedTo
          ? {
              id: task.assignedTo.id,
              name: task.assignedTo.name,
              email: task.assignedTo.email,
            }
          : null,
        disposition: task.disposition,
        endTime: task.endTime,
        completedAt: task.completedAt,
        completedBy: task.completedByUser
          ? {
              id: task.completedByUser.id,
              name: task.completedByUser.name,
              email: task.completedByUser.email,
            }
          : null,
      })),
      duplicateRecords: duplicateRecords.map((dup) => ({
        id: dup.id,
        importSession: {
          id: dup.importSession.id,
          fileName: dup.importSession.fileName,
          importedAt: dup.importSession.importedAt,
          source: dup.importSession.source,
        },
        rowNumber: dup.rowNumber,
        customerName: dup.customerName,
        originalTaskId: dup.originalTaskId,
        originalCreatedAt: dup.originalCreatedAt,
        originalCompletedAt: dup.originalCompletedAt,
        originalDisposition: dup.originalDisposition,
        originalCompletedBy: dup.originalCompletedBy,
        ageInDays: dup.ageInDays,
        createdAt: dup.createdAt,
      })),
      importHistory: importSessionsWithOrder.map((session) => ({
        id: session.id,
        fileName: session.fileName,
        importedAt: session.importedAt,
        source: session.source,
        duplicateCount: session.duplicateRecords.length,
      })),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error searching order number:", error);
    return NextResponse.json(
      { error: "Failed to search order number" },
      { status: 500 }
    );
  }
}

