import type { TaskType } from "@prisma/client";

/**
 * Canonical task types for Quality Review (template admin overview, server helpers).
 * Keep in sync with Prisma `TaskType` QA coverage.
 */
export const QUALITY_REVIEW_TASK_TYPES: TaskType[] = [
  "TEXT_CLUB",
  "WOD_IVCS",
  "EMAIL_REQUESTS",
  "YOTPO",
  "HOLDS",
  "STANDALONE_REFUNDS",
];

/**
 * Manager QA batch page dropdown order (WOD_IVCS-only sub-filters stay in page.tsx).
 */
export const QA_BATCH_TASK_TYPES: TaskType[] = [
  "TEXT_CLUB",
  "EMAIL_REQUESTS",
  "YOTPO",
  "WOD_IVCS",
  "HOLDS",
  "STANDALONE_REFUNDS",
];
