/**
 * Phase 3E-3a order assignment / queue movement service tests (local / Angelic Harmony only).
 * Run: npx tsx scripts/test-wod-ivcs-v2-phase3e-assignment-apis.ts
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";
import { executeImport } from "../src/lib/wod-ivcs/import-service";
import {
  assignWodIvcsOrdersToAgent,
  moveWodIvcsOrdersToQueue,
  unassignWodIvcsOrders,
} from "../src/lib/wod-ivcs/order-mutation-service";
import { buildWodIvcsQueuesSummary } from "../src/lib/wod-ivcs/queues-summary-service";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const prisma = new PrismaClient();

function loadFixture(name: string) {
  return readFileSync(join(root, "fixtures/wod-ivcs", name), "utf8");
}

async function ensureSampleOrders(managerId: string) {
  const existing = await prisma.wodIvcsOrder.count({
    where: { archivedAt: null, operationalQueue: "NEEDS_ACTION" },
  });
  if (existing >= 2) return;

  const netsuiteCsv = loadFixture("netsuite-report.sample.csv");
  const agingCsv = loadFixture("aging-report.sample.csv");
  await executeImport(prisma, {
    sourceReportType: "NETSUITE_REPORT",
    fileName: "netsuite-report.sample.csv",
    csvText: netsuiteCsv,
    importedById: managerId,
  });
  await executeImport(prisma, {
    sourceReportType: "AGING_REPORT",
    fileName: "aging-report.sample.csv",
    csvText: agingCsv,
    importedById: managerId,
  });
}

async function findOrCreateWodAgent() {
  let agent = await prisma.user.findFirst({
    where: {
      role: { in: ["AGENT", "MANAGER_AGENT"] },
      isActive: true,
      agentTypes: { has: "WOD_IVCS" },
    },
  });

  if (!agent) {
    agent = await prisma.user.findFirst({
      where: { role: { in: ["AGENT", "MANAGER_AGENT"] }, isActive: true },
    });
    if (agent) {
      await prisma.user.update({
        where: { id: agent.id },
        data: { agentTypes: { set: [...new Set([...agent.agentTypes, "WOD_IVCS"])] } },
      });
    }
  }

  if (!agent) {
    throw new Error("No active agent found — create an agent user locally first");
  }

  return agent;
}

async function main() {
  console.log("=== WOD/IVCS v2 Phase 3E-3a assignment API tests ===\n");

  const manager = await prisma.user.findFirst({
    where: { role: { in: ["MANAGER", "MANAGER_AGENT"] } },
  });
  if (!manager) throw new Error("No manager user found");

  await ensureSampleOrders(manager.id);
  const agent = await findOrCreateWodAgent();

  const pool = await prisma.wodIvcsOrder.findMany({
    where: { archivedAt: null, operationalQueue: "NEEDS_ACTION", assignedToId: null },
    take: 3,
    orderBy: { documentNumber: "asc" },
  });
  if (pool.length < 2) {
    throw new Error("Need at least 2 NEEDS_ACTION unassigned orders for tests");
  }

  const [orderA, orderB, orderC] = pool;
  console.log("Using orders:", pool.map((o) => o.documentNumber).join(", "));

  const assignResult = await assignWodIvcsOrdersToAgent(prisma, {
    orderIds: [orderA.id, orderB.id],
    agentId: agent.id,
    actorId: manager.id,
  });
  if ("error" in assignResult) throw new Error(`Assign failed: ${assignResult.error}`);
  if (assignResult.assigned !== 2) {
    throw new Error(`Expected 2 assigned, got ${assignResult.assigned}`);
  }
  console.log("1. Assign two orders OK", { assigned: assignResult.assigned });

  const afterAssign = await prisma.wodIvcsOrder.findMany({
    where: { id: { in: [orderA.id, orderB.id] } },
    select: { id: true, operationalQueue: true, assignedToId: true },
  });
  for (const o of afterAssign) {
    if (o.operationalQueue !== "ASSIGNED" || o.assignedToId !== agent.id) {
      throw new Error(`Order ${o.id} not ASSIGNED to agent after assign`);
    }
  }
  console.log("2. Orders are ASSIGNED with correct assignee");

  const assignEvents = await prisma.wodIvcsActionEvent.count({
    where: {
      orderId: { in: [orderA.id, orderB.id] },
      actionType: { in: ["QUEUE_CHANGED", "MANAGER_OVERRIDE"] },
    },
  });
  if (assignEvents < 2) throw new Error("Expected action events for assign");
  console.log("3. WodIvcsActionEvent rows written for assign");

  const unassignResult = await unassignWodIvcsOrders(prisma, {
    orderIds: [orderA.id],
    actorId: manager.id,
  });
  if (unassignResult.unassigned !== 1) {
    throw new Error(`Expected 1 unassigned, got ${unassignResult.unassigned}`);
  }

  const afterUnassign = await prisma.wodIvcsOrder.findUnique({
    where: { id: orderA.id },
    select: { operationalQueue: true, assignedToId: true },
  });
  if (afterUnassign?.operationalQueue !== "NEEDS_ACTION" || afterUnassign.assignedToId) {
    throw new Error("Unassigned order should be NEEDS_ACTION with no assignee");
  }
  console.log("4. Unassign returns order to NEEDS_ACTION");

  const moveResult = await moveWodIvcsOrdersToQueue(prisma, {
    orderIds: [orderB.id],
    targetQueue: "NEEDS_REVIEW",
    actorId: manager.id,
    note: "Phase 3E-3a test move",
  });
  if ("error" in moveResult) throw new Error(`Move failed: ${moveResult.error}`);
  if (moveResult.moved !== 1) throw new Error(`Expected 1 moved, got ${moveResult.moved}`);

  const afterMove = await prisma.wodIvcsOrder.findUnique({
    where: { id: orderB.id },
    select: { operationalQueue: true },
  });
  if (afterMove?.operationalQueue !== "NEEDS_REVIEW") {
    throw new Error("Order should be in NEEDS_REVIEW after move");
  }

  const moveEvent = await prisma.wodIvcsActionEvent.findFirst({
    where: { orderId: orderB.id, actionType: "QUEUE_CHANGED", toQueue: "NEEDS_REVIEW" },
    orderBy: { createdAt: "desc" },
  });
  if (!moveEvent) throw new Error("QUEUE_CHANGED event missing for move");
  console.log("5. Move to NEEDS_REVIEW OK with audit event");

  const terminal = orderC ?? pool[0];
  await prisma.wodIvcsOrder.update({
    where: { id: terminal.id },
    data: { operationalQueue: "COMPLETED", assignedToId: null },
  });

  const blockedAssign = await assignWodIvcsOrdersToAgent(prisma, {
    orderIds: [terminal.id],
    agentId: agent.id,
    actorId: manager.id,
  });
  if (!("skipped" in blockedAssign) || blockedAssign.assigned !== 0) {
    throw new Error("Expected COMPLETED order to be skipped on assign");
  }
  if (blockedAssign.skipped[0]?.code !== "TERMINAL_QUEUE") {
    throw new Error(`Expected TERMINAL_QUEUE skip, got ${blockedAssign.skipped[0]?.code}`);
  }
  console.log("6. COMPLETED order blocked on assign");

  await prisma.wodIvcsOrder.update({
    where: { id: terminal.id },
    data: { operationalQueue: "ARCHIVED", operationalStatus: "ARCHIVED", archivedAt: new Date() },
  });

  const blockedMove = await moveWodIvcsOrdersToQueue(prisma, {
    orderIds: [terminal.id],
    targetQueue: "NEEDS_REVIEW",
    actorId: manager.id,
  });
  if (!("skipped" in blockedMove) || blockedMove.moved !== 0) {
    throw new Error("Expected ARCHIVED order to be skipped on move from terminal");
  }
  console.log("7. ARCHIVED order blocked on move from terminal");

  const inProgress = await prisma.wodIvcsOrder.findFirst({
    where: { archivedAt: null, operationalQueue: { not: "ARCHIVED" }, id: { not: terminal.id } },
  });
  if (inProgress) {
    await prisma.wodIvcsOrder.update({
      where: { id: inProgress.id },
      data: { operationalQueue: "IN_PROGRESS", assignedToId: agent.id },
    });
    const blockedUnassign = await unassignWodIvcsOrders(prisma, {
      orderIds: [inProgress.id],
      actorId: manager.id,
    });
    if (blockedUnassign.unassigned !== 0 || blockedUnassign.skipped[0]?.code !== "IN_PROGRESS_BLOCKED") {
      throw new Error("Expected IN_PROGRESS unassign to be blocked");
    }
    await prisma.wodIvcsOrder.update({
      where: { id: inProgress.id },
      data: { operationalQueue: "NEEDS_ACTION", assignedToId: null },
    });
    console.log("8. IN_PROGRESS unassign blocked");
  }

  const summaryBefore = await buildWodIvcsQueuesSummary(prisma);
  const summaryAfter = await buildWodIvcsQueuesSummary(prisma);
  if (summaryAfter.totalOrders < summaryBefore.totalOrders) {
    throw new Error("Summary totalOrders regressed unexpectedly");
  }
  console.log("9. queues/summary service runs after mutations", {
    needsAction: summaryAfter.queueCounts.NEEDS_ACTION,
    assigned: summaryAfter.queueCounts.ASSIGNED,
    needsReview: summaryAfter.queueCounts.NEEDS_REVIEW,
  });

  console.log("\n✅ All Phase 3E-3a assignment service tests passed");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
