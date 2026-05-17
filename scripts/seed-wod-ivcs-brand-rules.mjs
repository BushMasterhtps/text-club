/**
 * Seed default WOD/IVCS brand rules (idempotent).
 * Usage: node scripts/seed-wod-ivcs-brand-rules.mjs
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const RULES = [
  {
    sourceReportType: "NETSUITE_REPORT",
    matchField: "Brand",
    matchValue: "City Beauty",
    priority: 10,
  },
  {
    sourceReportType: "AGING_REPORT",
    matchField: "Subsidiary",
    matchValue: "City Beauty LLC",
    priority: 10,
  },
];

async function main() {
  for (const rule of RULES) {
    const existing = await prisma.wodIvcsBrandRule.findFirst({
      where: {
        sourceReportType: rule.sourceReportType,
        matchField: rule.matchField,
        matchValue: rule.matchValue,
      },
    });
    if (!existing) {
      await prisma.wodIvcsBrandRule.create({ data: { ...rule, isInclusive: true, isActive: true } });
      console.log(`Created brand rule: ${rule.sourceReportType} ${rule.matchField}=${rule.matchValue}`);
    } else {
      console.log(`Brand rule exists: ${rule.sourceReportType} ${rule.matchField}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
