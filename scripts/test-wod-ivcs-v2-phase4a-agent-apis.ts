/**
 * Phase 4A.2 agent WOD/IVCS v2 API route tests (Angelic Harmony / local only).
 * Run: WOD_IVCS_V2_ENABLED=true npx tsx scripts/test-wod-ivcs-v2-phase4a-agent-apis.ts
 */
import { execSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { SignJWT } from "jose";
import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { GET as listAgentOrders } from "../src/app/api/agent/wod-ivcs/v2/orders/route";
import { GET as getAgentOrder } from "../src/app/api/agent/wod-ivcs/v2/orders/[id]/route";
import { POST as startAgentOrder } from "../src/app/api/agent/wod-ivcs/v2/orders/[id]/start/route";
import { POST as previewAgentWorkflow } from "../src/app/api/agent/wod-ivcs/v2/orders/[id]/workflow/preview/route";
import { POST as submitAgentOrder } from "../src/app/api/agent/wod-ivcs/v2/orders/[id]/submit/route";
import { GET as getActiveAgentWorkflow } from "../src/app/api/agent/wod-ivcs/v2/workflow/active/route";
import { assignWodIvcsOrdersToAgent } from "../src/lib/wod-ivcs/order-mutation-service";
import { normalizeDocumentNumber } from "../src/lib/wod-ivcs/normalize";
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

const TEST_DOC_PREFIX = "PHASE4A-API-";
const TEST_CUSTOMER_EMAIL = "phase4a-api-test@local.invalid";
const TEST_AGENT_B_EMAIL = "phase4a-api-test-agent-b@local.invalid";

process.env.WOD_IVCS_V2_ENABLED = "true";

type TestUser = { id: string; email: string; role: "AGENT" | "MANAGER_AGENT" };

function testDocNumber(suffix: string): string {
  return `${TEST_DOC_PREFIX}${suffix}`;
}

function testDocNormalized(suffix: string): string {
  const normalized = normalizeDocumentNumber(testDocNumber(suffix));
  if (!normalized) throw new Error(`Invalid test doc suffix: ${suffix}`);
  return normalized;
}

async function signAuthToken(user: TestUser): Promise<string> {
  const secret = process.env.JWT_SECRET;
  if (!secret?.trim()) {
    throw new Error("JWT_SECRET is required for API route tests");
  }
  return new SignJWT({
    userId: user.id,
    email: user.email,
    role: user.role,
    mustChangePassword: false,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(secret));
}

async function agentRequest(
  user: TestUser,
  path: string,
  init?: { method?: string; body?: Record<string, unknown> }
): Promise<NextResponse> {
  const token = await signAuthToken(user);
  const url = `http://localhost${path}`;
  const headers = new Headers({ cookie: `auth-token=${token}` });
  let body: string | undefined;
  if (init?.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(init.body);
  }
  const request = new NextRequest(url, {
    method: init?.method ?? "GET",
    headers,
    body,
  });
  if (path === "/api/agent/wod-ivcs/v2/orders" && (!init?.method || init.method === "GET")) {
    return listAgentOrders(request);
  }
  if (path === "/api/agent/wod-ivcs/v2/workflow/active") {
    return getActiveAgentWorkflow(request);
  }
  const orderMatch = path.match(/^\/api\/agent\/wod-ivcs\/v2\/orders\/([^/]+)(\/.*)?$/);
  if (!orderMatch) throw new Error(`Unhandled test path: ${path}`);
  const orderId = orderMatch[1];
  const sub = orderMatch[2] ?? "";
  const params = Promise.resolve({ id: orderId });

  if (sub === "" || sub === undefined) {
    return getAgentOrder(request, { params });
  }
  if (sub === "/start") {
    return startAgentOrder(request, { params });
  }
  if (sub === "/workflow/preview") {
    return previewAgentWorkflow(request, { params });
  }
  if (sub === "/submit") {
    return submitAgentOrder(request, { params });
  }
  throw new Error(`Unhandled test subpath: ${sub}`);
}

async function readJson<T = Record<string, unknown>>(res: NextResponse): Promise<{
  status: number;
  data: T;
}> {
  const data = (await res.json()) as T;
  return { status: res.status, data };
}

async function ensureWorkflowPublished(managerId: string) {
  execSync("npx tsx scripts/seed-wod-ivcs-workflow-config.mjs", { stdio: "inherit", cwd: root });
  execSync("npx tsx scripts/seed-wod-ivcs-routing-matrix.mjs", { stdio: "inherit", cwd: root });

  const active = await getActiveWorkflowDefinition(prisma);
  if (active.publishedVersion) {
    const stepCount = await prisma.wodIvcsWorkflowStep.count({
      where: { versionId: active.publishedVersion.id },
    });
    if (stepCount > 0) return;
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
}

async function findOrCreateWodAgent(): Promise<TestUser> {
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
  return {
    id: agent.id,
    email: agent.email,
    role: agent.role === "MANAGER_AGENT" ? "MANAGER_AGENT" : "AGENT",
  };
}

async function findOrCreateSecondAgent(primaryId: string): Promise<TestUser> {
  const existing = await prisma.user.findFirst({
    where: {
      role: { in: ["AGENT", "MANAGER_AGENT"] },
      isActive: true,
      id: { not: primaryId },
      agentTypes: { has: "WOD_IVCS" },
    },
  });
  if (existing) {
    return {
      id: existing.id,
      email: existing.email,
      role: existing.role === "MANAGER_AGENT" ? "MANAGER_AGENT" : "AGENT",
    };
  }

  let testAgent = await prisma.user.findUnique({ where: { email: TEST_AGENT_B_EMAIL } });
  if (!testAgent) {
    const passwordHash = await bcrypt.hash("phase4a-api-test-local-only", 10);
    testAgent = await prisma.user.create({
      data: {
        email: TEST_AGENT_B_EMAIL,
        name: "Phase 4A API Test Agent B",
        password: passwordHash,
        role: "AGENT",
        isActive: true,
        mustChangePassword: false,
        agentTypes: ["WOD_IVCS"],
      },
    });
  }
  return { id: testAgent.id, email: testAgent.email, role: "AGENT" };
}

async function resetPhase4aApiOrder(suffix: string) {
  const documentNumberNormalized = testDocNormalized(suffix);
  const existing = await prisma.wodIvcsOrder.findUnique({ where: { documentNumberNormalized } });
  if (!existing) return null;
  await prisma.wodIvcsOrder.update({
    where: { id: existing.id },
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
  return existing.id;
}

async function ensurePhase4aApiOrder(suffix: string) {
  await resetPhase4aApiOrder(suffix);
  const documentNumberNormalized = testDocNormalized(suffix);
  const existing = await prisma.wodIvcsOrder.findUnique({ where: { documentNumberNormalized } });
  if (existing) return existing;

  return prisma.wodIvcsOrder.create({
    data: {
      documentNumber: testDocNumber(suffix),
      documentNumberNormalized,
      customerName: `Phase 4A API Test (${suffix})`,
      customerEmail: TEST_CUSTOMER_EMAIL,
      operationalQueue: "NEEDS_ACTION",
      operationalStatus: "OPEN",
      presenceNetSuite: "PRESENT",
      presenceAging: "PRESENT",
      itemSummaryJson: { source: "phase4a-api-test-script", suffix },
      latestNetSuiteSnapshotJson: { phase4aApiTest: true, suffix },
    },
  });
}

async function ensureAssigned(suffix: string, agentId: string, managerId: string) {
  const order = await ensurePhase4aApiOrder(suffix);
  const assignResult = await assignWodIvcsOrdersToAgent(prisma, {
    orderIds: [order.id],
    agentId,
    actorId: managerId,
  });
  if ("error" in assignResult) throw new Error(`Assign failed: ${assignResult.error}`);
  return prisma.wodIvcsOrder.findUniqueOrThrow({ where: { id: order.id } });
}

async function main() {
  console.log("=== WOD/IVCS v2 Phase 4A.2 agent API tests ===\n");

  const manager = await prisma.user.findFirst({
    where: { role: { in: ["MANAGER", "MANAGER_AGENT"] } },
  });
  if (!manager) throw new Error("No manager user found");

  await ensureWorkflowPublished(manager.id);
  console.log("1. Workflow seed OK");

  const agent = await findOrCreateWodAgent();
  const otherAgent = await findOrCreateSecondAgent(agent.id);

  const primary = await ensureAssigned("PRIMARY", agent.id, manager.id);
  const wrongAgentOrder = await ensureAssigned("WRONG-AGENT", agent.id, manager.id);
  const otherAssigned = await ensureAssigned("OTHER-AGENT", otherAgent.id, manager.id);
  console.log("2. Test orders ready:", primary.documentNumber, wrongAgentOrder.documentNumber);

  const listRes = await readJson(await agentRequest(agent, "/api/agent/wod-ivcs/v2/orders"));
  if (listRes.status !== 200 || listRes.data.success !== true) {
    throw new Error(`List failed: ${listRes.status} ${JSON.stringify(listRes.data)}`);
  }
  const listOrders = listRes.data.orders as Array<{ id: string }>;
  if (!listOrders.some((o) => o.id === primary.id)) {
    throw new Error("List missing PRIMARY assigned order");
  }
  if (listOrders.some((o) => o.id === otherAssigned.id)) {
    throw new Error("List included another agent's order");
  }
  console.log("3. List returns only current agent assigned orders");

  const detailRes = await readJson(
    await agentRequest(agent, `/api/agent/wod-ivcs/v2/orders/${primary.id}`)
  );
  if (detailRes.status !== 200 || detailRes.data.success !== true) {
    throw new Error(`Detail failed: ${JSON.stringify(detailRes.data)}`);
  }
  console.log("4. Detail OK for assigned order");

  const wrongDetail = await readJson(
    await agentRequest(otherAgent, `/api/agent/wod-ivcs/v2/orders/${primary.id}`)
  );
  if (wrongDetail.status !== 404 || wrongDetail.data.success !== false) {
    throw new Error(`Expected 404 for wrong agent detail, got ${wrongDetail.status}`);
  }
  console.log("5. Detail blocks wrong agent");

  const activeRes = await readJson(
    await agentRequest(agent, "/api/agent/wod-ivcs/v2/workflow/active")
  );
  if (activeRes.status !== 200 || !activeRes.data.active) {
    throw new Error("Active workflow endpoint failed");
  }
  const routingRules = (activeRes.data.active as { routingRules?: unknown[] }).routingRules;
  if (!Array.isArray(routingRules) || routingRules.length === 0) {
    throw new Error("Active workflow missing routingRules");
  }
  console.log("6. Active workflow endpoint OK");

  const wrongStart = await readJson(
    await agentRequest(otherAgent, `/api/agent/wod-ivcs/v2/orders/${wrongAgentOrder.id}/start`, {
      method: "POST",
    })
  );
  if (wrongStart.status !== 403 || wrongStart.data.code !== "NOT_ASSIGNED_TO_ACTOR") {
    throw new Error(
      `Expected NOT_ASSIGNED_TO_ACTOR, got ${wrongStart.status} ${wrongStart.data.code}`
    );
  }
  console.log("7. Wrong agent cannot start assigned order");

  const startRes = await readJson(
    await agentRequest(agent, `/api/agent/wod-ivcs/v2/orders/${primary.id}/start`, {
      method: "POST",
    })
  );
  if (startRes.status !== 200 || startRes.data.success !== true) {
    throw new Error(`Start failed: ${JSON.stringify(startRes.data)}`);
  }
  const startedOrder = startRes.data.order as { operationalQueue: string };
  if (startedOrder.operationalQueue !== "IN_PROGRESS") {
    throw new Error(`Expected IN_PROGRESS, got ${startedOrder.operationalQueue}`);
  }
  console.log("8. Start moves order to IN_PROGRESS");

  const { publishedVersion } = await getActiveWorkflowDefinition(prisma);
  if (!publishedVersion) throw new Error("No published version");
  const { rules } = await getRoutingRules(prisma, publishedVersion.id);
  const taxRule = rules.find((r) => r.label?.includes("Re-triggered CS Only"));
  if (!taxRule?.rootCauseOption || !taxRule.fixTypeOption) {
    throw new Error("Tax Mismatch rule not found");
  }

  const taxAnswers = {
    root_cause: taxRule.rootCauseOption.value,
    cash_sale_exists: taxRule.cashSaleExistsOption?.value ?? "yes",
    merchant: taxRule.merchantOption?.value ?? "cybersource",
    fix_type: taxRule.fixTypeOption.value,
    retrigger_confirmation: true,
  };

  const previewRes = await readJson(
    await agentRequest(agent, `/api/agent/wod-ivcs/v2/orders/${primary.id}/workflow/preview`, {
      method: "POST",
      body: { answers: taxAnswers },
    })
  );
  if (previewRes.status !== 200 || previewRes.data.success !== true) {
    throw new Error(`Preview failed: ${JSON.stringify(previewRes.data)}`);
  }
  const matchedRoutingRule = previewRes.data.matchedRoutingRule as { id?: string } | null;
  if (!matchedRoutingRule?.id) {
    throw new Error("Preview missing matched routing rule");
  }
  if (previewRes.data.predictedTargetQueue !== "AWAITING_DROP_OFF") {
    throw new Error(`Preview target queue ${previewRes.data.predictedTargetQueue}`);
  }
  console.log("9. Preview returns Tax Mismatch match + target queue");

  const invalidSubmit = await readJson(
    await agentRequest(agent, `/api/agent/wod-ivcs/v2/orders/${primary.id}/submit`, {
      method: "POST",
      body: { answers: { root_cause: taxRule.rootCauseOption.value } },
    })
  );
  if (invalidSubmit.status !== 400 || invalidSubmit.data.code !== "VALIDATION_FAILED") {
    throw new Error(`Expected validation error, got ${invalidSubmit.status} ${invalidSubmit.data.code}`);
  }
  console.log("10. Invalid submit returns VALIDATION_FAILED");

  const submitRes = await readJson(
    await agentRequest(agent, `/api/agent/wod-ivcs/v2/orders/${primary.id}/submit`, {
      method: "POST",
      body: { answers: taxAnswers },
    })
  );
  if (submitRes.status !== 200 || submitRes.data.success !== true) {
    throw new Error(`Submit failed: ${JSON.stringify(submitRes.data)}`);
  }
  if (submitRes.data.targetQueue !== "AWAITING_DROP_OFF") {
    throw new Error(`Submit targetQueue ${submitRes.data.targetQueue}`);
  }
  const submissionId = submitRes.data.submissionId as string;
  const row = await prisma.wodIvcsWorkflowSubmission.findUnique({ where: { id: submissionId } });
  if (!row) throw new Error("Submission row missing");
  console.log("11. Submit creates submission and moves queue");

  const prevFlag = process.env.WOD_IVCS_V2_ENABLED;
  process.env.WOD_IVCS_V2_ENABLED = "false";
  const disabledRes = await readJson(await agentRequest(agent, "/api/agent/wod-ivcs/v2/orders"));
  process.env.WOD_IVCS_V2_ENABLED = prevFlag;
  if (disabledRes.status !== 404 || disabledRes.data.success !== false) {
    throw new Error(`Expected 404 when v2 disabled, got ${disabledRes.status}`);
  }
  console.log("12. Disabled flag returns 404 (other agent order excluded from list)");

  void otherAssigned;

  console.log("\n✅ All Phase 4A.2 agent API tests passed");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
