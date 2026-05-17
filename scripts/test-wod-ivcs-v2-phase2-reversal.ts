/**
 * Phase 2 import reversal tests (local / Angelic Harmony only).
 * Run: npx tsx scripts/test-wod-ivcs-v2-phase2-reversal.ts
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";
import { executeImport } from "../src/lib/wod-ivcs/import-service";
import {
  buildReversalPlan,
  executeReversal,
  MIN_REVERSAL_REASON_LENGTH,
} from "../src/lib/wod-ivcs/reversal-service";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const prisma = new PrismaClient();

function loadFixture(name: string) {
  return readFileSync(join(root, "fixtures/wod-ivcs", name), "utf8");
}

async function findRunByFileName(fileName: string) {
  const run = await prisma.wodIvcsImportRun.findFirst({
    where: { fileName, isDryRun: false },
    orderBy: { createdAt: "desc" },
  });
  if (!run) throw new Error(`Import run not found for file: ${fileName}`);
  return run;
}

async function main() {
  console.log("=== WOD/IVCS v2 Phase 2 reversal tests ===\n");

  const user = await prisma.user.findFirst({
    where: { role: { in: ["MANAGER", "MANAGER_AGENT"] } },
  });
  if (!user) throw new Error("No manager user found");

  const netsuiteCsv = loadFixture("netsuite-report.sample.csv");
  const agingCsv = loadFixture("aging-report.sample.csv");
  const minusCsv = loadFixture("netsuite-report-minus-one.sample.csv");

  await executeImport(prisma, {
    sourceReportType: "NETSUITE_REPORT",
    fileName: "netsuite-report.sample.csv",
    csvText: netsuiteCsv,
    importedById: user.id,
  });
  console.log("1. NetSuite sample import OK");

  await executeImport(prisma, {
    sourceReportType: "AGING_REPORT",
    fileName: "aging-report.sample.csv",
    csvText: agingCsv,
    importedById: user.id,
  });
  console.log("2. Aging sample import OK");

  await executeImport(prisma, {
    sourceReportType: "NETSUITE_REPORT",
    fileName: "netsuite-report-minus-one.sample.csv",
    csvText: minusCsv,
    importedById: user.id,
  });
  console.log("3. NetSuite minus-one import OK");

  const droppedBefore = await prisma.wodIvcsOrder.findUnique({
    where: { documentNumberNormalized: "GM1001003" },
  });
  if (droppedBefore?.presenceNetSuite !== "DROPPED") {
    throw new Error("GM1001003 should be DROPPED before reversal");
  }

  const minusRun = await findRunByFileName("netsuite-report-minus-one.sample.csv");
  const preview = await buildReversalPlan(prisma, minusRun.id);
  if (preview.summary.totalAffectedOrders === 0) {
    throw new Error("Preview expected affected orders");
  }
  console.log("4. Preview minus-one OK", preview.summary);

  try {
    await executeReversal(prisma, {
      importRunId: minusRun.id,
      actorId: user.id,
      reason: "short",
    });
    throw new Error("Expected short reason to fail");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (!msg.includes(String(MIN_REVERSAL_REASON_LENGTH))) {
      throw new Error(`Expected reason length error, got: ${msg}`);
    }
  }
  console.log("5. Reversal without valid reason fails");

  const reason = "Phase 2 automated reversal test — undo minus-one import";
  const result = await executeReversal(prisma, {
    importRunId: minusRun.id,
    actorId: user.id,
    reason,
  });
  if (result.status !== "REVERSED") {
    throw new Error(`Expected REVERSED, got ${result.status}`);
  }
  console.log("6. Execute reversal OK", result.applied);

  const restored = await prisma.wodIvcsOrder.findUnique({
    where: { documentNumberNormalized: "GM1001003" },
  });
  if (restored?.presenceNetSuite !== "PRESENT") {
    throw new Error(`GM1001003 should be PRESENT after reversal, got ${restored?.presenceNetSuite}`);
  }
  console.log("7. GM1001003 NetSuite presence restored to PRESENT");

  const runAfter = await prisma.wodIvcsImportRun.findUnique({ where: { id: minusRun.id } });
  if (runAfter?.status !== "REVERSED") {
    throw new Error(`Run status should be REVERSED, got ${runAfter?.status}`);
  }
  console.log("8. Import run status REVERSED");

  const action = await prisma.wodIvcsActionEvent.findFirst({
    where: { importRunId: minusRun.id, actionType: "IMPORT_RUN_REVERSED" },
  });
  if (!action) throw new Error("IMPORT_RUN_REVERSED action event missing");
  console.log("9. IMPORT_RUN_REVERSED action event exists");

  try {
    await executeReversal(prisma, {
      importRunId: minusRun.id,
      actorId: user.id,
      reason: "duplicate attempt should fail",
    });
    throw new Error("Expected duplicate reversal to fail");
  } catch (e) {
    const code = e && typeof e === "object" && "code" in e ? (e as { code: string }).code : "";
    if (code !== "ALREADY_REVERSED") {
      throw new Error(`Expected ALREADY_REVERSED, got: ${e}`);
    }
  }
  console.log("10. Duplicate reversal rejected");

  const firstNsRun = await prisma.wodIvcsImportRun.findFirst({
    where: {
      fileName: "netsuite-report.sample.csv",
      status: "COMPLETED",
      isDryRun: false,
    },
    orderBy: { createdAt: "asc" },
  });
  if (!firstNsRun) throw new Error("First NetSuite run not found");

  const blockedPlan = await buildReversalPlan(prisma, firstNsRun.id);
  if (blockedPlan.summary.blockedOrders === 0) {
    throw new Error("Expected first NetSuite run to have blocked orders after later imports");
  }
  console.log("11. Later-import blocked behavior OK", {
    blocked: blockedPlan.summary.blockedOrders,
    total: blockedPlan.summary.totalAffectedOrders,
  });

  console.log("\n✅ All Phase 2 reversal tests passed");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
