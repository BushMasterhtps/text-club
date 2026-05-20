/**
 * Validates bulk mutation chunking (no DB required for default run).
 * Optional live check against local DB: npx tsx scripts/test-wod-ivcs-bulk-mutation-chunks.ts --live
 */
import { PrismaClient } from "@prisma/client";
import {
  assignWodIvcsOrdersToAgent,
  BULK_ORDER_MUTATION_CHUNK_SIZE,
  chunkOrderIds,
  unassignWodIvcsOrders,
} from "../src/lib/wod-ivcs/order-mutation-service";

function assertChunking() {
  const ids = Array.from({ length: 100 }, (_, i) => `id-${i}`);
  const chunks = chunkOrderIds(ids);
  if (chunks.length !== 4) {
    throw new Error(`Expected 4 chunks for 100 ids, got ${chunks.length}`);
  }
  if (chunks[0]!.length !== 25 || chunks[3]!.length !== 25) {
    throw new Error("Chunk sizes should be 25 for 100 ids");
  }
  const flat = chunks.flat();
  if (flat.length !== 100 || flat[0] !== "id-0" || flat[99] !== "id-99") {
    throw new Error("Chunk flatten order mismatch");
  }
  console.log(`chunkOrderIds OK (${BULK_ORDER_MUTATION_CHUNK_SIZE} per chunk, ${chunks.length} chunks for 100 ids)`);
}

async function liveSmoke(prisma: PrismaClient) {
  const manager = await prisma.user.findFirst({
    where: { role: { in: ["MANAGER", "MANAGER_AGENT"] } },
    select: { id: true },
  });
  if (!manager) throw new Error("No manager user for actorId");

  const agent = await prisma.user.findFirst({
    where: { role: { in: ["AGENT", "MANAGER_AGENT"] }, isActive: true },
    select: { id: true, agentTypes: true },
  });
  if (!agent) throw new Error("No active agent");

  const orders = await prisma.wodIvcsOrder.findMany({
    where: { operationalQueue: "NEEDS_ACTION", isCityBeauty: false },
    take: 75,
    select: { id: true },
  });
  if (orders.length < 50) {
    console.log(`Live smoke skipped: only ${orders.length} NEEDS_ACTION orders (need ~50+)`);
    return;
  }

  const orderIds = orders.map((o) => o.id);
  console.log(`Live assign ${orderIds.length} orders...`);
  const assignResult = await assignWodIvcsOrdersToAgent(prisma, {
    orderIds,
    agentId: agent.id,
    actorId: manager.id,
  });
  if ("error" in assignResult) {
    throw new Error(`Assign failed: ${assignResult.error}`);
  }
  console.log(`Assigned ${assignResult.assigned}, skipped ${assignResult.skipped.length}`);

  const assignedOrders = await prisma.wodIvcsOrder.findMany({
    where: { id: { in: orderIds }, operationalQueue: "ASSIGNED" },
    select: { id: true },
  });
  const assignedIds = assignedOrders.map((o) => o.id);
  if (assignedIds.length < 50) {
    console.log(`Live unassign skipped: only ${assignedIds.length} moved to ASSIGNED`);
    return;
  }

  console.log(`Live unassign ${assignedIds.length} orders...`);
  const unassignResult = await unassignWodIvcsOrders(prisma, {
    orderIds: assignedIds,
    actorId: manager.id,
  });
  console.log(`Unassigned ${unassignResult.unassigned}, skipped ${unassignResult.skipped.length}`);
  console.log("Live bulk mutation smoke OK");
}

async function main() {
  assertChunking();
  if (process.argv.includes("--live")) {
    const prisma = new PrismaClient();
    try {
      await liveSmoke(prisma);
    } finally {
      await prisma.$disconnect();
    }
  } else {
    console.log("Pass --live to run assign/unassign against local DB (mutates data).");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
