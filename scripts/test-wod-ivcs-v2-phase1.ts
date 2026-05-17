/**
 * Phase 1 DB-level functional tests (Angelic Harmony only).
 * Run: npx tsx scripts/test-wod-ivcs-v2-phase1.ts
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";
import { runDryRun } from "../src/lib/wod-ivcs/dry-run";
import { executeImport } from "../src/lib/wod-ivcs/import-service";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const prisma = new PrismaClient();

function loadFixture(name: string) {
  return readFileSync(join(root, "fixtures/wod-ivcs", name), "utf8");
}

async function main() {
  console.log("=== WOD/IVCS v2 Phase 1 DB tests ===\n");

  const user = await prisma.user.findFirst({
    where: { role: { in: ["MANAGER", "MANAGER_AGENT"] } },
  });
  if (!user) throw new Error("No manager user found for import tests");

  const netsuiteCsv = loadFixture("netsuite-report.sample.csv");
  const agingCsv = loadFixture("aging-report.sample.csv");

  const dryNs = await runDryRun(prisma, "NETSUITE_REPORT", "netsuite-report.sample.csv", netsuiteCsv);
  if (dryNs.errors.length) throw new Error(`NetSuite dry-run errors: ${JSON.stringify(dryNs.errors)}`);
  console.log("Dry-run NetSuite OK", { parsed: dryNs.parsedRows, cityBeauty: dryNs.cityBeautyCount });

  const dryAg = await runDryRun(prisma, "AGING_REPORT", "aging-report.sample.csv", agingCsv);
  if (dryAg.parsedRows !== 2) throw new Error(`Expected 2 aging orders, got ${dryAg.parsedRows}`);
  console.log("Dry-run Aging OK", { parsed: dryAg.parsedRows, fivePlus: dryAg.fivePlusCount });

  const nsImport = await executeImport(prisma, {
    sourceReportType: "NETSUITE_REPORT",
    fileName: "netsuite-report.sample.csv",
    csvText: netsuiteCsv,
    importedById: user.id,
  });
  console.log("Import NetSuite OK", nsImport.summary);

  const agImport = await executeImport(prisma, {
    sourceReportType: "AGING_REPORT",
    fileName: "aging-report.sample.csv",
    csvText: agingCsv,
    importedById: user.id,
  });
  console.log("Import Aging OK", agImport.summary);

  const order = await prisma.wodIvcsOrder.findUnique({
    where: { documentNumberNormalized: "GM2002001" },
  });
  if (!order) throw new Error("GM2002001 not found");
  const items = order.itemSummaryJson as unknown[];
  if (!Array.isArray(items) || items.length !== 3) {
    throw new Error(`Expected 3 items on GM2002001, got ${Array.isArray(items) ? items.length : 0}`);
  }
  if (!order.isCityBeauty || !order.agingIsFivePlus) {
    throw new Error("GM2002001 City Beauty / 5+ flags wrong");
  }

  const reimport = await executeImport(prisma, {
    sourceReportType: "NETSUITE_REPORT",
    fileName: "netsuite-report.sample.csv",
    csvText: netsuiteCsv,
    importedById: user.id,
  });
  if (reimport.summary.createdOrders > 0) {
    throw new Error("Re-import should not create new orders");
  }
  console.log("Re-import NetSuite OK (no new creates)");

  const minusCsv = loadFixture("netsuite-report-minus-one.sample.csv");
  await executeImport(prisma, {
    sourceReportType: "NETSUITE_REPORT",
    fileName: "netsuite-report-minus-one.sample.csv",
    csvText: minusCsv,
    importedById: user.id,
  });

  const dropped = await prisma.wodIvcsOrder.findUnique({
    where: { documentNumberNormalized: "GM1001003" },
  });
  if (!dropped || dropped.presenceNetSuite !== "DROPPED") {
    throw new Error("GM1001003 should be DROPPED from NetSuite");
  }
  console.log("Drop-off reconciliation OK");

  console.log("\n✅ All Phase 1 DB tests passed");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
