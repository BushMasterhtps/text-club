/**
 * Phase 4A.1 agent workflow service tests (Angelic Harmony / local only).
 * Run: WOD_IVCS_V2_ENABLED=true npx tsx scripts/test-wod-ivcs-v2-phase4a-agent-workflow-service.ts
 */
import { execSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { assignWodIvcsOrdersToAgent } from "../src/lib/wod-ivcs/order-mutation-service";
import { normalizeDocumentNumber } from "../src/lib/wod-ivcs/normalize";
import {
  AgentWorkflowError,
  previewAgentWodIvcsWorkflow,
  startAgentWodIvcsWork,
  submitAgentWodIvcsWorkflow,
} from "../src/lib/wod-ivcs/agent-workflow-service";
import {
  compileRoutingMatrixVersion,
  getRoutingRules,
  publishRoutingMatrixVersion,
} from "../src/lib/wod-ivcs/routing-matrix-service";
import { getActiveWorkflowDefinition } from "../src/lib/wod-ivcs/workflow-config-service";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const prisma = new PrismaClient();
const WORKFLOW_SLUG = "invalid-cash-sale-v1";

const TEST_DOC_PREFIX = "PHASE4A-TEST-";
const TEST_CUSTOMER_EMAIL = "phase4a-test@local.invalid";
const TEST_AGENT_B_EMAIL = "phase4a-test-agent-b@local.invalid";

process.env.WOD_IVCS_V2_ENABLED = "true";

function testDocNumber(suffix: string): string {
  return `${TEST_DOC_PREFIX}${suffix}`;
}

function testDocNormalized(suffix: string): string {
  const normalized = normalizeDocumentNumber(testDocNumber(suffix));
  if (!normalized) throw new Error(`Invalid test doc suffix: ${suffix}`);
  return normalized;
}

function isPhase4aTestDocument(documentNumber: string): boolean {
  return documentNumber.toUpperCase().startsWith(TEST_DOC_PREFIX);
}

async function resetPhase4aTestOrderToNeedsAction(orderId: string, documentNumber: string) {
  if (!isPhase4aTestDocument(documentNumber)) {
    throw new Error(`Refusing to reset non-test order: ${documentNumber}`);
  }
  await prisma.wodIvcsOrder.update({
    where: { id: orderId },
    data: {
      operationalQueue: "NEEDS_ACTION",
      operationalStatus: "OPEN",
      assignedToId: null,
      activeWorkflowVersionId: null,
      workStartedAt: null,
      workStartedById: null,
      awaitingDropOffStartedAt: null,
      awaitingDropOffDeadlineAt: null,
      archivedAt: null,
      processedReship: null,
      replacementOrderNumber: null,
    },
  });
}

async function createPhase4aTestOrder(suffix: string) {
  const documentNumber = testDocNumber(suffix);
  const documentNumberNormalized = testDocNormalized(suffix);
  return prisma.wodIvcsOrder.create({
    data: {
      documentNumber,
      documentNumberNormalized,
      customerName: `Phase 4A Local Test (${suffix})`,
      customerEmail: TEST_CUSTOMER_EMAIL,
      operationalQueue: "NEEDS_ACTION",
      operationalStatus: "OPEN",
      presenceNetSuite: "PRESENT",
      presenceAging: "PRESENT",
      itemSummaryJson: { source: "phase4a-test-script", suffix },
      latestNetSuiteSnapshotJson: { phase4aTest: true, suffix },
    },
  });
}

/** Reusable local-only order in NEEDS_ACTION (resets prior test queue state when needed). */
async function ensurePhase4aNeedsActionOrder(suffix: string) {
  const documentNumberNormalized = testDocNormalized(suffix);
  let order = await prisma.wodIvcsOrder.findUnique({
    where: { documentNumberNormalized },
  });

  if (order) {
    if (!isPhase4aTestDocument(order.documentNumber)) {
      throw new Error(`Document collision on non-test order: ${order.documentNumber}`);
    }
    const needsReset =
      order.operationalQueue !== "NEEDS_ACTION" ||
      order.assignedToId != null ||
      order.archivedAt != null ||
      order.activeWorkflowVersionId != null;

    if (needsReset) {
      await resetPhase4aTestOrderToNeedsAction(order.id, order.documentNumber);
      order = await prisma.wodIvcsOrder.findUniqueOrThrow({ where: { id: order.id } });
    }
    return order;
  }

  return createPhase4aTestOrder(suffix);
}

async function ensurePhase4aArchivedOrder(suffix = "ARCHIVED") {
  const documentNumber = testDocNumber(suffix);
  const documentNumberNormalized = testDocNormalized(suffix);
  const now = new Date();
  return prisma.wodIvcsOrder.upsert({
    where: { documentNumberNormalized },
    create: {
      documentNumber,
      documentNumberNormalized,
      customerName: `Phase 4A Local Test (${suffix})`,
      customerEmail: TEST_CUSTOMER_EMAIL,
      operationalQueue: "ARCHIVED",
      operationalStatus: "ARCHIVED",
      archivedAt: now,
      presenceNetSuite: "PRESENT",
      presenceAging: "PRESENT",
      itemSummaryJson: { source: "phase4a-test-script", suffix },
      latestNetSuiteSnapshotJson: { phase4aTest: true, suffix },
    },
    update: {
      operationalQueue: "ARCHIVED",
      operationalStatus: "ARCHIVED",
      archivedAt: now,
      assignedToId: null,
      activeWorkflowVersionId: null,
      workStartedAt: null,
      workStartedById: null,
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
    if (stepCount > 0) {
      console.log("Published workflow ready", `v${active.publishedVersion.version}`);
      return active.publishedVersion.id;
    }
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
  console.log("Published workflow from draft", `v${after.publishedVersion.version}`);
  return after.publishedVersion.id;
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
  if (!agent) throw new Error("No active agent found");
  return agent;
}

async function findOrCreateSecondAgent(primaryAgentId: string) {
  const existing = await prisma.user.findFirst({
    where: {
      role: { in: ["AGENT", "MANAGER_AGENT"] },
      isActive: true,
      id: { not: primaryAgentId },
      agentTypes: { has: "WOD_IVCS" },
    },
    orderBy: { email: "asc" },
  });
  if (existing) return existing;

  let testAgent = await prisma.user.findUnique({ where: { email: TEST_AGENT_B_EMAIL } });
  if (!testAgent) {
    const passwordHash = await bcrypt.hash("phase4a-test-local-only", 10);
    testAgent = await prisma.user.create({
      data: {
        email: TEST_AGENT_B_EMAIL,
        name: "Phase 4A Test Agent B",
        password: passwordHash,
        role: "AGENT",
        isActive: true,
        mustChangePassword: false,
        agentTypes: ["WOD_IVCS"],
      },
    });
    console.log("Created Phase 4A test agent B:", testAgent.email);
  } else {
    const types = new Set([...testAgent.agentTypes, "WOD_IVCS"]);
    if (!testAgent.isActive || testAgent.agentTypes.length !== types.size) {
      testAgent = await prisma.user.update({
        where: { id: testAgent.id },
        data: { isActive: true, agentTypes: { set: [...types] } },
      });
    }
  }

  return testAgent;
}

async function ensureAssignedOrder(managerId: string, agentId: string, suffix = "PRIMARY") {
  const assigned = await prisma.wodIvcsOrder.findFirst({
    where: {
      documentNumberNormalized: testDocNormalized(suffix),
      archivedAt: null,
      operationalQueue: "ASSIGNED",
      assignedToId: agentId,
    },
  });
  if (assigned) return assigned;

  const pool = await ensurePhase4aNeedsActionOrder(suffix);
  const assignResult = await assignWodIvcsOrdersToAgent(prisma, {
    orderIds: [pool.id],
    agentId,
    actorId: managerId,
  });
  if ("error" in assignResult) throw new Error(`Assign failed: ${assignResult.error}`);
  if (assignResult.assigned !== 1) {
    throw new Error(`Expected 1 assigned, got ${assignResult.assigned}`);
  }

  return prisma.wodIvcsOrder.findUniqueOrThrow({ where: { id: pool.id } });
}

async function expectThrows(fn: () => Promise<unknown>, code?: string) {
  try {
    await fn();
    throw new Error(`Expected error${code ? ` (${code})` : ""} but call succeeded`);
  } catch (e) {
    if (e instanceof AgentWorkflowError) {
      if (code && e.code !== code) {
        throw new Error(`Expected code ${code}, got ${e.code}: ${e.message}`);
      }
      return e;
    }
    if (e instanceof Error && e.message.startsWith("Expected error")) throw e;
    throw e;
  }
}

async function main() {
  console.log("=== WOD/IVCS v2 Phase 4A.1 agent workflow service tests ===\n");

  const manager = await prisma.user.findFirst({
    where: { role: { in: ["MANAGER", "MANAGER_AGENT"] } },
  });
  if (!manager) throw new Error("No manager user found");

  await ensureWorkflowPublished(manager.id);
  console.log("1. Workflow config / routing matrix seed OK\n");

  const agent = await findOrCreateWodAgent();
  const otherAgent = await findOrCreateSecondAgent(agent.id);

  const order = await ensureAssignedOrder(manager.id, agent.id, "PRIMARY");
  console.log("2. ASSIGNED order ready:", order.documentNumber);

  const start = await startAgentWodIvcsWork(prisma, { orderId: order.id, actorId: agent.id });
  if (start.order.operationalQueue !== "IN_PROGRESS") {
    throw new Error(`Expected IN_PROGRESS after start, got ${start.order.operationalQueue}`);
  }
  if (!start.workflowVersionId || !start.order.activeWorkflowVersionId) {
    throw new Error("activeWorkflowVersionId not set after start");
  }
  const afterStart = await prisma.wodIvcsOrder.findUniqueOrThrow({
    where: { id: order.id },
    select: { workStartedAt: true, workStartedById: true, operationalQueue: true },
  });
  if (!afterStart.workStartedAt || afterStart.workStartedById !== agent.id) {
    throw new Error("workStartedAt / workStartedById not set");
  }
  console.log("3–7. startAgentWodIvcsWork OK");

  const startEvents = await prisma.wodIvcsActionEvent.findMany({
    where: { orderId: order.id, actionType: { in: ["AGENT_WORK_STARTED", "QUEUE_CHANGED"] } },
    orderBy: { createdAt: "asc" },
  });
  if (!startEvents.some((e) => e.actionType === "AGENT_WORK_STARTED")) {
    throw new Error("Missing AGENT_WORK_STARTED event");
  }
  if (!startEvents.some((e) => e.actionType === "QUEUE_CHANGED" && e.toQueue === "IN_PROGRESS")) {
    throw new Error("Missing QUEUE_CHANGED to IN_PROGRESS");
  }
  console.log("8. Start audit events OK");

  const idempotent = await startAgentWodIvcsWork(prisma, { orderId: order.id, actorId: agent.id });
  if (!idempotent.idempotent) throw new Error("Expected idempotent start");
  console.log("8b. Idempotent start OK");

  const { publishedVersion } = await getActiveWorkflowDefinition(prisma);
  if (!publishedVersion) throw new Error("No published version");
  const { rules } = await getRoutingRules(prisma, publishedVersion.id);
  const taxRule = rules.find((r) => r.label?.includes("Re-triggered CS Only"));
  if (!taxRule?.rootCauseOption || !taxRule.fixTypeOption) {
    throw new Error("Tax Mismatch retrigger rule not found");
  }

  const taxAnswers = {
    root_cause: taxRule.rootCauseOption.value,
    cash_sale_exists: taxRule.cashSaleExistsOption?.value ?? "yes",
    merchant: taxRule.merchantOption?.value ?? "cybersource",
    fix_type: taxRule.fixTypeOption.value,
    retrigger_confirmation: true,
  };

  const preview = await previewAgentWodIvcsWorkflow(prisma, {
    orderId: order.id,
    actorId: agent.id,
    answers: taxAnswers,
  });
  if (!preview.matchedRoutingRule?.id) {
    throw new Error("Preview did not match routing rule");
  }
  if (!preview.matchedRoutingRule.requiresRetriggerConfirmation) {
    throw new Error("Expected requiresRetriggerConfirmation on matched rule");
  }
  if (preview.predictedTargetQueue !== "AWAITING_DROP_OFF") {
    throw new Error(`Expected AWAITING_DROP_OFF, got ${preview.predictedTargetQueue}`);
  }
  if (!preview.validation.valid) {
    throw new Error(`Preview validation failed: ${preview.validation.errors.join("; ")}`);
  }
  console.log("9–10. previewAgentWodIvcsWorkflow Tax Mismatch path OK");

  const submit = await submitAgentWodIvcsWorkflow(prisma, {
    orderId: order.id,
    actorId: agent.id,
    answers: taxAnswers,
  });
  if (submit.targetQueue !== "AWAITING_DROP_OFF") {
    throw new Error(`Submit targetQueue ${submit.targetQueue}`);
  }

  const submission = await prisma.wodIvcsWorkflowSubmission.findUniqueOrThrow({
    where: { id: submit.submissionId },
  });
  if (submission.orderId !== order.id) throw new Error("Submission orderId mismatch");
  console.log("11–13. submit + submission + queue move OK");

  const submitEvents = await prisma.wodIvcsActionEvent.findMany({
    where: {
      orderId: order.id,
      actionType: { in: ["WORKFLOW_SUBMITTED", "QUEUE_CHANGED"] },
      createdAt: { gte: afterStart.workStartedAt! },
    },
  });
  if (!submitEvents.some((e) => e.actionType === "WORKFLOW_SUBMITTED")) {
    throw new Error("Missing WORKFLOW_SUBMITTED");
  }
  console.log("14. Submit audit events OK");

  const invalidOrder = await ensureAssignedOrder(manager.id, agent.id, "INVALID-SUBMIT");
  await startAgentWodIvcsWork(prisma, { orderId: invalidOrder.id, actorId: agent.id });
  await expectThrows(
    () =>
      submitAgentWodIvcsWorkflow(prisma, {
        orderId: invalidOrder.id,
        actorId: agent.id,
        answers: { root_cause: taxRule.rootCauseOption!.value },
      }),
    "VALIDATION_FAILED"
  );
  console.log("15. Invalid submit validation fails OK");

  const wrongAgentOrder = await ensureAssignedOrder(manager.id, agent.id, "WRONG-AGENT");
  await expectThrows(
    () => startAgentWodIvcsWork(prisma, { orderId: wrongAgentOrder.id, actorId: otherAgent.id }),
    "NOT_ASSIGNED_TO_ACTOR"
  );
  console.log("16. Wrong agent cannot start OK");

  const archived = await ensurePhase4aArchivedOrder("ARCHIVED");
  await prisma.wodIvcsOrder.update({
    where: { id: archived.id },
    data: { assignedToId: agent.id },
  });
  await expectThrows(
    () => startAgentWodIvcsWork(prisma, { orderId: archived.id, actorId: agent.id }),
    "TERMINAL_QUEUE"
  );
  console.log("17. Archived order cannot start OK");

  console.log("\n✅ All Phase 4A.1 agent workflow service tests passed");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
