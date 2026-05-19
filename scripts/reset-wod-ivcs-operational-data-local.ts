/**
 * Local-only reset of WOD/IVCS imported operational data (orders, imports, presence, submissions).
 * Does NOT touch Routing Matrix / workflow configuration tables.
 *
 * Preview:  npx tsx scripts/reset-wod-ivcs-operational-data-local.ts
 * Confirm:  ALLOW_WOD_IVCS_LOCAL_RESET=true npx tsx scripts/reset-wod-ivcs-operational-data-local.ts --confirm
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const OPERATIONAL_TABLES = [
  "WodIvcsActionEvent",
  "WodIvcsWorkflowSubmission",
  "WodIvcsReportPresenceEvent",
  "WodIvcsImportRow",
  "WodIvcsCase",
  "WodIvcsOrder",
  "WodIvcsImportRun",
] as const;

const CONFIG_TABLES = [
  "WodIvcsWorkflowDefinition",
  "WodIvcsWorkflowVersion",
  "WodIvcsWorkflowStep",
  "WodIvcsWorkflowStepCondition",
  "WodIvcsWorkflowCatalog",
  "WodIvcsWorkflowCatalogOption",
  "WodIvcsWorkflowOutcomeRule",
  "WodIvcsWorkflowRoutingRule",
  "WodIvcsWorkflowRoutingSubDispositionOption",
  "WodIvcsWorkflowConfigAuditLog",
  "WodIvcsBrandRule",
] as const;

function parseDbTarget(databaseUrl: string): { host: string; database: string } {
  try {
    const u = new URL(databaseUrl);
    const database = u.pathname.replace(/^\//, "") || "(unknown)";
    return { host: u.hostname || "(unknown)", database };
  } catch {
    return { host: "(unparseable)", database: "(unknown)" };
  }
}

function isLocalDatabaseHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0" || h === "::1") {
    return true;
  }
  if (h.endsWith(".local")) return true;
  return false;
}

function assertSafeToRun(): { host: string; database: string } {
  if (process.env.NODE_ENV === "production") {
    console.error("Refusing to run: NODE_ENV is production.");
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl?.trim()) {
    console.error("Refusing to run: DATABASE_URL is not set.");
    process.exit(1);
  }

  const target = parseDbTarget(databaseUrl);
  const allowOverride = process.env.ALLOW_WOD_IVCS_LOCAL_RESET === "true";

  if (!isLocalDatabaseHost(target.host) && !allowOverride) {
    console.error(
      `Refusing to run: database host "${target.host}" is not local (localhost/127.0.0.1).`
    );
    console.error(
      "Set ALLOW_WOD_IVCS_LOCAL_RESET=true only if you are certain this is a dev database."
    );
    process.exit(1);
  }

  if (!isLocalDatabaseHost(target.host) && allowOverride) {
    console.warn(
      `WARNING: ALLOW_WOD_IVCS_LOCAL_RESET=true — proceeding against non-local host "${target.host}".`
    );
  }

  return target;
}

async function countOperationalTables(): Promise<Record<string, number>> {
  const [
    actionEvents,
    submissions,
    presenceEvents,
    importRows,
    cases,
    orders,
    importRuns,
  ] = await Promise.all([
    prisma.wodIvcsActionEvent.count(),
    prisma.wodIvcsWorkflowSubmission.count(),
    prisma.wodIvcsReportPresenceEvent.count(),
    prisma.wodIvcsImportRow.count(),
    prisma.wodIvcsCase.count(),
    prisma.wodIvcsOrder.count(),
    prisma.wodIvcsImportRun.count(),
  ]);

  return {
    WodIvcsActionEvent: actionEvents,
    WodIvcsWorkflowSubmission: submissions,
    WodIvcsReportPresenceEvent: presenceEvents,
    WodIvcsImportRow: importRows,
    WodIvcsCase: cases,
    WodIvcsOrder: orders,
    WodIvcsImportRun: importRuns,
  };
}

async function countConfigTables(): Promise<Record<string, number>> {
  const [
    definitions,
    versions,
    steps,
    stepConditions,
    catalogs,
    catalogOptions,
    outcomeRules,
    routingRules,
    subDispositionOptions,
    configAudit,
    brandRules,
  ] = await Promise.all([
    prisma.wodIvcsWorkflowDefinition.count(),
    prisma.wodIvcsWorkflowVersion.count(),
    prisma.wodIvcsWorkflowStep.count(),
    prisma.wodIvcsWorkflowStepCondition.count(),
    prisma.wodIvcsWorkflowCatalog.count(),
    prisma.wodIvcsWorkflowCatalogOption.count(),
    prisma.wodIvcsWorkflowOutcomeRule.count(),
    prisma.wodIvcsWorkflowRoutingRule.count(),
    prisma.wodIvcsWorkflowRoutingSubDispositionOption.count(),
    prisma.wodIvcsWorkflowConfigAuditLog.count(),
    prisma.wodIvcsBrandRule.count(),
  ]);

  return {
    WodIvcsWorkflowDefinition: definitions,
    WodIvcsWorkflowVersion: versions,
    WodIvcsWorkflowStep: steps,
    WodIvcsWorkflowStepCondition: stepConditions,
    WodIvcsWorkflowCatalog: catalogs,
    WodIvcsWorkflowCatalogOption: catalogOptions,
    WodIvcsWorkflowOutcomeRule: outcomeRules,
    WodIvcsWorkflowRoutingRule: routingRules,
    WodIvcsWorkflowRoutingSubDispositionOption: subDispositionOptions,
    WodIvcsWorkflowConfigAuditLog: configAudit,
    WodIvcsBrandRule: brandRules,
  };
}

async function deleteOperationalData(): Promise<Record<string, number>> {
  return prisma.$transaction(async (tx) => {
    const deleted: Record<string, number> = {};

    const actionEvents = await tx.wodIvcsActionEvent.deleteMany({});
    deleted.WodIvcsActionEvent = actionEvents.count;

    const submissions = await tx.wodIvcsWorkflowSubmission.deleteMany({});
    deleted.WodIvcsWorkflowSubmission = submissions.count;

    const presenceEvents = await tx.wodIvcsReportPresenceEvent.deleteMany({});
    deleted.WodIvcsReportPresenceEvent = presenceEvents.count;

    const importRows = await tx.wodIvcsImportRow.deleteMany({});
    deleted.WodIvcsImportRow = importRows.count;

    const cases = await tx.wodIvcsCase.deleteMany({});
    deleted.WodIvcsCase = cases.count;

    const orders = await tx.wodIvcsOrder.deleteMany({});
    deleted.WodIvcsOrder = orders.count;

    const importRuns = await tx.wodIvcsImportRun.deleteMany({});
    deleted.WodIvcsImportRun = importRuns.count;

    return deleted;
  });
}

function printCounts(label: string, counts: Record<string, number>) {
  console.log(`\n${label}:`);
  for (const table of OPERATIONAL_TABLES) {
    console.log(`  ${table}: ${counts[table] ?? 0}`);
  }
}

async function main() {
  const confirm = process.argv.includes("--confirm");
  const target = assertSafeToRun();

  console.log("=== WOD/IVCS local operational data reset ===\n");
  console.log(`Database host: ${target.host}`);
  console.log(`Database name: ${target.database}`);
  console.log(`NODE_ENV: ${process.env.NODE_ENV ?? "(unset)"}`);

  const before = await countOperationalTables();
  const configBefore = await countConfigTables();

  printCounts("Rows that would be deleted (operational/import only)", before);

  console.log("\nRouting Matrix / config tables (NOT deleted):");
  for (const table of CONFIG_TABLES) {
    console.log(`  ${table}: ${configBefore[table] ?? 0} (unchanged)`);
  }

  if (!confirm) {
    console.log(
      "\nDry run only. To delete operational data, re-run with --confirm:\n" +
        "  ALLOW_WOD_IVCS_LOCAL_RESET=true npx tsx scripts/reset-wod-ivcs-operational-data-local.ts --confirm\n"
    );
    return;
  }

  console.log("\nDeleting operational data…");
  const deleted = await deleteOperationalData();
  const after = await countOperationalTables();

  printCounts("Deleted", deleted);
  printCounts("Remaining (should be 0)", after);

  const configAfter = await countConfigTables();
  let configUnchanged = true;
  for (const table of CONFIG_TABLES) {
    if ((configBefore[table] ?? 0) !== (configAfter[table] ?? 0)) {
      configUnchanged = false;
      console.error(`  UNEXPECTED CHANGE: ${table} count changed!`);
    }
  }

  if (configUnchanged) {
    console.log("\nRouting Matrix / workflow configuration tables were not modified.");
  } else {
    console.error("\nERROR: Config table counts changed — investigate immediately.");
    process.exit(1);
  }

  console.log("\nDone. Re-import real NetSuite/Aging CSVs to test from a clean operational state.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
