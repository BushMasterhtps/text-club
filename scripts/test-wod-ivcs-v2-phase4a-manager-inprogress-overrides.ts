/**
 * Phase 4A.3b manager IN_PROGRESS override tests (local only).
 * Run: WOD_IVCS_V2_ENABLED=true npx tsx scripts/test-wod-ivcs-v2-phase4a-manager-inprogress-overrides.ts
 */
import { execSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import {
  assignWodIvcsOrdersToAgent,
  unassignWodIvcsOrders,
} from "../src/lib/wod-ivcs/order-mutation-service";
import { startAgentWodIvcsWork } from "../src/lib/wod-ivcs/agent-workflow-service";
import { normalizeDocumentNumber } from "../src/lib/wod-ivcs/normalize";
import {
  compileRoutingMatrixVersion,
  publishRoutingMatrixVersion,
} from "../src/lib/wod-ivcs/routing-matrix-service";
import { getActiveWorkflowDefinition } from "../src/lib/wod-ivcs/workflow-config-service";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const prisma = new PrismaClient();
const WORKFLOW_SLUG = "invalid-cash-sale-v1";

const TEST_DOC_PREFIX = "PHASE4A-OVERRIDE-";
const TEST_CUSTOMER_EMAIL = "phase4a-override-test@local.invalid";
const TEST_AGENT_B_EMAIL = "phase4a-override-agent-b@local.invalid";

process.env.WOD_IVCS_V2_ENABLED = "true";

function testDocNumber(suffix: string): string {
  return `${TEST_DOC_PREFIX}${suffix}`;
}

function testDocNormalized(suffix: string): string {
  const normalized = normalizeDocumentNumber(testDocNumber(suffix));
  if (!normalized) throw new Error(`Invalid test doc suffix: ${suffix}`);
  return normalized;
}

function isOverrideTestDocument(documentNumber: string): boolean {
  return documentNumber.toUpperCase().startsWith(TEST_DOC_PREFIX);
}

async function ensureOverrideTestOrder(suffix: string) {
  const documentNumber = testDocNumber(suffix);
  const documentNumberNormalized = testDocNormalized(suffix);
  return prisma.wodIvcsOrder.upsert({
    where: { documentNumberNormalized },
    create: {
      documentNumber,
      documentNumberNormalized,
      customerName: `Phase 4A Override Test (${suffix})`,
      customerEmail: TEST_CUSTOMER_EMAIL,
      operationalQueue: "NEEDS_ACTION",
      operationalStatus: "OPEN",
      presenceNetSuite: "PRESENT",
      presenceAging: "PRESENT",
      itemSummaryJson: { source: "phase4a-override-test", suffix },
    },
    update: {
      operationalQueue: "NEEDS_ACTION",
      operationalStatus: "OPEN",
      assignedToId: null,
      archivedAt: null,
      workStartedAt: null,
      workStartedById: null,
      activeWorkflowVersionId: null,
      awaitingDropOffStartedAt: null,
      awaitingDropOffDeadlineAt: null,
    },
  });
}

async function ensureWorkflowPublished(managerId: string) {
  execSync("npx tsx scripts/seed-wod-ivcs-workflow-config.mjs", { stdio: "inherit", cwd: root });
  execSync("npx tsx scripts/seed-wod-ivcs-routing-matrix.mjs", { stdio: "inherit", cwd: root });

  const active = await getActiveWorkflowDefinition(prisma);
  if (active.publishedVersion) {
    const stepCount = await prisma.wodIvcsWorkflowStep.count({
      where: { versionId: active.publishedVersion.id },
    });
    if (stepCount > 0) return active.publishedVersion.id;
  }

  const definition = await prisma.wodIvcsWorkflowDefinition.findUniqueOrThrow({
    where: { slug: WORKFLOW_SLUG },
  });
  const draft = await prisma.wodIvcsWorkflowVersion.findFirst({
    where: { workflowId: definition.id, status: "DRAFT" },
    orderBy: { version: "desc" },
  });
  if (!draft) throw new Error("No DRAFT workflow version for publish");

  await compileRoutingMatrixVersion(prisma, draft.id, managerId);
  await publishRoutingMatrixVersion(prisma, draft.id, managerId);
  const after = await getActiveWorkflowDefinition(prisma);
  if (!after.publishedVersion) throw new Error("Publish failed");
  return after.publishedVersion.id;
}

async function findManager() {
  const manager = await prisma.user.findFirst({
    where: { role: { in: ["MANAGER", "MANAGER_AGENT"] }, isActive: true },
    orderBy: { email: "asc" },
  });
  if (!manager) throw new Error("No active manager found");
  return manager;
}

async function findOrCreateAgentA() {
  let agent = await prisma.user.findFirst({
    where: {
      role: { in: ["AGENT", "MANAGER_AGENT"] },
      isActive: true,
      agentTypes: { has: "WOD_IVCS" },
    },
    orderBy: { email: "asc" },
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
  if (!agent) throw new Error("No active agent A found");
  return agent;
}

async function findOrCreateAgentB(primaryId: string) {
  let agent = await prisma.user.findFirst({
    where: {
      role: { in: ["AGENT", "MANAGER_AGENT"] },
      isActive: true,
      id: { not: primaryId },
      agentTypes: { has: "WOD_IVCS" },
    },
    orderBy: { email: "asc" },
  });
  if (agent) return agent;

  let testAgent = await prisma.user.findUnique({ where: { email: TEST_AGENT_B_EMAIL } });
  if (!testAgent) {
    const passwordHash = await bcrypt.hash("phase4a-override-local-only", 10);
    testAgent = await prisma.user.create({
      data: {
        email: TEST_AGENT_B_EMAIL,
        name: "Phase 4A Override Agent B",
        password: passwordHash,
        role: "AGENT",
        isActive: true,
        mustChangePassword: false,
        agentTypes: ["WOD_IVCS"],
      },
    });
  } else {
    testAgent = await prisma.user.update({
      where: { id: testAgent.id },
      data: { isActive: true, agentTypes: { set: [...new Set([...testAgent.agentTypes, "WOD_IVCS"])] } },
    });
  }
  return testAgent;
}

async function agentOrderIds(agentId: string): Promise<string[]> {
  const rows = await prisma.wodIvcsOrder.findMany({
    where: {
      assignedToId: agentId,
      archivedAt: null,
      operationalQueue: { in: ["ASSIGNED", "IN_PROGRESS"] },
      documentNumber: { startsWith: TEST_DOC_PREFIX },
    },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

async function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function main() {
  console.log("Phase 4A.3b manager IN_PROGRESS override tests\n");

  const manager = await findManager();
  const agentA = await findOrCreateAgentA();
  const agentB = await findOrCreateAgentB(agentA.id);
  await ensureWorkflowPublished(manager.id);

  const order = await ensureOverrideTestOrder("PRIMARY");
  assert(isOverrideTestDocument(order.documentNumber), "test doc prefix");

  // Assign to Agent A
  const assignA = await assignWodIvcsOrdersToAgent(prisma, {
    orderIds: [order.id],
    agentId: agentA.id,
    actorId: manager.id,
  });
  if ("error" in assignA) throw new Error(assignA.error);
  assert(assignA.assigned === 1, "assign A failed");

  let row = await prisma.wodIvcsOrder.findUniqueOrThrow({ where: { id: order.id } });
  assert(row.operationalQueue === "ASSIGNED", "expected ASSIGNED after assign");
  assert(row.assignedToId === agentA.id, "expected agent A assignee");

  // Start as Agent A → IN_PROGRESS
  await startAgentWodIvcsWork(prisma, { orderId: order.id, actorId: agentA.id });
  row = await prisma.wodIvcsOrder.findUniqueOrThrow({ where: { id: order.id } });
  assert(row.operationalQueue === "IN_PROGRESS", "expected IN_PROGRESS after start");
  assert(row.workStartedAt != null, "expected workStartedAt");
  assert(row.workStartedById === agentA.id, "expected workStartedBy agent A");
  assert(row.activeWorkflowVersionId != null, "expected activeWorkflowVersionId");
  console.log("✓ Agent A started → IN_PROGRESS");

  // Manager unassign from IN_PROGRESS
  const unassign = await unassignWodIvcsOrders(prisma, {
    orderIds: [order.id],
    actorId: manager.id,
  });
  assert(unassign.unassigned === 1, `unassign failed: ${JSON.stringify(unassign.skipped)}`);

  row = await prisma.wodIvcsOrder.findUniqueOrThrow({ where: { id: order.id } });
  assert(row.assignedToId === null, "expected unassigned");
  assert(row.operationalQueue === "NEEDS_ACTION", "expected NEEDS_ACTION after unassign");
  assert(row.operationalStatus !== "COMPLETED", "must not complete");
  assert(row.workStartedAt === null, "workStartedAt cleared");
  assert(row.workStartedById === null, "workStartedById cleared");
  assert(row.activeWorkflowVersionId === null, "activeWorkflowVersionId cleared");

  const unassignEvent = await prisma.wodIvcsActionEvent.findFirst({
    where: { orderId: order.id, actionType: "MANAGER_OVERRIDE" },
    orderBy: { createdAt: "desc" },
  });
  assert(unassignEvent != null, "MANAGER_OVERRIDE audit missing");
  const unassignPayload = unassignEvent!.payloadJson as Record<string, unknown>;
  assert(unassignPayload.action === "FORCE_UNASSIGN_IN_PROGRESS", "wrong unassign action");
  console.log("✓ Manager unassign from IN_PROGRESS → NEEDS_ACTION");

  // Re-assign to Agent A and start again
  const assignA2 = await assignWodIvcsOrdersToAgent(prisma, {
    orderIds: [order.id],
    agentId: agentA.id,
    actorId: manager.id,
  });
  if ("error" in assignA2) throw new Error(assignA2.error);
  assert(assignA2.assigned === 1, "re-assign A failed");

  await startAgentWodIvcsWork(prisma, { orderId: order.id, actorId: agentA.id });
  row = await prisma.wodIvcsOrder.findUniqueOrThrow({ where: { id: order.id } });
  assert(row.operationalQueue === "IN_PROGRESS", "expected IN_PROGRESS again");
  console.log("✓ Re-assigned and started as Agent A");

  // Manager reassign to Agent B from IN_PROGRESS
  const reassignB = await assignWodIvcsOrdersToAgent(prisma, {
    orderIds: [order.id],
    agentId: agentB.id,
    actorId: manager.id,
  });
  if ("error" in reassignB) throw new Error(reassignB.error);
  assert(reassignB.assigned === 1, `reassign B failed: ${JSON.stringify(reassignB.skipped)}`);

  row = await prisma.wodIvcsOrder.findUniqueOrThrow({ where: { id: order.id } });
  assert(row.assignedToId === agentB.id, "expected agent B assignee");
  assert(row.operationalQueue === "ASSIGNED", "expected ASSIGNED after reassign");
  assert(row.workStartedAt === null, "workStartedAt cleared on reassign");
  assert(row.workStartedById === null, "workStartedById cleared on reassign");
  assert(row.activeWorkflowVersionId === null, "activeWorkflowVersionId cleared on reassign");

  const reassignEvent = await prisma.wodIvcsActionEvent.findFirst({
    where: {
      orderId: order.id,
      actionType: "MANAGER_OVERRIDE",
    },
    orderBy: { createdAt: "desc" },
  });
  const reassignPayload = reassignEvent!.payloadJson as Record<string, unknown>;
  assert(reassignPayload.action === "FORCE_REASSIGN_IN_PROGRESS", "wrong reassign action");
  assert(reassignPayload.newAgentId === agentB.id, "newAgentId missing");

  const agentAIds = await agentOrderIds(agentA.id);
  assert(!agentAIds.includes(order.id), "Agent A should not see order");

  const agentBIds = await agentOrderIds(agentB.id);
  assert(agentBIds.includes(order.id), "Agent B should see order as ASSIGNED");
  console.log("✓ Manager reassign IN_PROGRESS → ASSIGNED for Agent B");

  // Agent B starts cleanly
  await startAgentWodIvcsWork(prisma, { orderId: order.id, actorId: agentB.id });
  row = await prisma.wodIvcsOrder.findUniqueOrThrow({ where: { id: order.id } });
  assert(row.operationalQueue === "IN_PROGRESS", "Agent B start → IN_PROGRESS");
  assert(row.workStartedById === agentB.id, "workStartedBy agent B");
  console.log("✓ Agent B can Start → IN_PROGRESS");

  console.log("\nAll Phase 4A.3b manager IN_PROGRESS override tests passed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
