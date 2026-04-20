# Quality Review — v1 Pre-Build Specification

**Product name (UI):** Quality Review  
**Code / DB prefix:** `QA*` (e.g. `QATemplate`, `QATaskReview`)

This document is the final pre-build spec: schema, seed shape, reservation rules, and build order. **Manager-only v1** — no agent UI, no ranking integration, no disputes, no template admin UI.

---

## 1. Final Prisma schema draft

Add to `schema.prisma` (relation names can be adjusted to match your conventions). `User` / `Task` backrefs are optional but shown for clarity.

### Enums

```prisma
enum QASampleBatchStatus {
  OPEN       // batch created; reviews may be PENDING
  COMPLETED  // batch finished (all tasks submitted — see lifecycle in §3)
  CANCELLED  // batch voided; PENDING reviews removed
}

enum QATaskReviewStatus {
  PENDING    // reserved for this batch; not yet submitted
  SUBMITTED  // immutable outcome; task globally excluded from future sampling
}

enum QAReviewLineResponse {
  PASS
  FAIL
  NA
}
```

### `QATemplate`

| Field           | Type              | Constraints / notes |
|-----------------|-------------------|---------------------|
| `id`            | `String`          | `@id @default(cuid())` |
| `slug`          | `String`          | `@unique` — stable seed key (e.g. `qr-text-club-v1`) |
| `displayName`   | `String`          | e.g. `Quality Review – Text Club` |
| `taskType`      | `TaskType`        | Which queue this applies to |
| `wodIvcsSource` | `WodIvcsSource?`  | `null` = all WOD/IVCS for that `taskType`; set to narrow (e.g. `SO_VS_WEB_DIFFERENCE`) |
| `isActive`      | `Boolean`         | `@default(true)` |
| `createdAt`     | `DateTime`        | `@default(now())` |
| `updatedAt`     | `DateTime`        | `@updatedAt` |
| `createdById`   | `String?`        | `FK → User.id`, `onDelete: SetNull`, optional |

**Indexes**

- `@@index([taskType, isActive])`
- Optional: `@@index([taskType, wodIvcsSource, isActive])` if you filter by source frequently.

**Note:** “One active template per `(taskType, wodIvcsSource)`” can be enforced in application code for v1 unless you add a partial unique index via raw SQL later.

---

### `QATemplateVersion`

| Field           | Type       | Constraints / notes |
|-----------------|------------|---------------------|
| `id`            | `String`   | `@id @default(cuid())` |
| `templateId`    | `String`   | `FK → QATemplate.id`, `onDelete: Cascade` |
| `version`       | `Int`      | Monotonic per template; **immutable** after publish |
| `createdAt`     | `DateTime` | `@default(now())` |
| `createdById`   | `String?`  | `FK → User`, optional |

**Uniques / indexes**

- `@@unique([templateId, version])`
- `@@index([templateId])`

**Rule:** Never UPDATE `QALine` rows for a published version. Rubric change = new `version` + new lines.

---

### `QALine`

| Field               | Type       | Constraints / notes |
|---------------------|------------|---------------------|
| `id`                | `String`   | `@id @default(cuid())` |
| `templateVersionId` | `String` | `FK → QATemplateVersion.id`, `onDelete: Cascade` |
| `slug`              | `String`   | Stable per line within version (seed idempotency) |
| `sectionOrder`      | `Int`      | Sort sections (lower first) |
| `sectionTitle`      | `String`   | Display section name |
| `lineOrder`         | `Int`      | Order within section |
| `label`             | `String`   | Line prompt |
| `helpText`          | `String?`  | Optional reviewer guidance |
| `weight`            | `Decimal`  | `@db.Decimal(10, 2)` |
| `isCritical`        | `Boolean`  | `@default(false)` |
| `allowNa`           | `Boolean`  | `@default(false)` — if `true`, `NA` allowed on submit |

**Uniques / indexes**

- `@@unique([templateVersionId, slug])`
- `@@index([templateVersionId])`
- Optional: `@@unique([templateVersionId, sectionOrder, lineOrder])` to catch duplicate ordering

---

### `QASampleBatch`

| Field               | Type                  | Constraints / notes |
|---------------------|-----------------------|---------------------|
| `id`                | `String`              | `@id @default(cuid())` |
| `reviewerId`        | `String`              | `FK → User.id` (manager), `onDelete: Restrict` |
| `subjectAgentId`    | `String`              | `FK → User.id` (agent under review), `onDelete: Restrict` |
| `templateVersionId` | `String`              | `FK → QATemplateVersion.id`, `onDelete: Restrict` |
| `periodStartDate`   | `String`              | `@db.VarChar(10)` — `YYYY-MM-DD` |
| `periodEndDate`     | `String`              | `@db.VarChar(10)` — inclusive calendar end; app uses half-open UTC bounds |
| `filtersJson`       | `Json?`               | e.g. `{ "dispositions": string[] }` |
| `sampleCount`       | `Int`                 | Requested sample size |
| `status`            | `QASampleBatchStatus` | `@default(OPEN)` |
| `createdAt`         | `DateTime`            | `@default(now())` |
| `completedAt`       | `DateTime?`           | Set when batch `COMPLETED` |

**Indexes**

- `@@index([reviewerId, createdAt])`
- `@@index([subjectAgentId, createdAt])`
- `@@index([status])`

---

### `QASampleBatchTask`

| Field        | Type     | Constraints / notes |
|--------------|----------|---------------------|
| `id`         | `String` | `@id @default(cuid())` |
| `batchId`    | `String` | `FK → QASampleBatch.id`, `onDelete: Cascade` |
| `taskId`     | `String` | `FK → Task.id`, `onDelete: Restrict` |
| `sortIndex`  | `Int`    | `0..n-1` step order |

**Uniques / indexes**

- `@@unique([batchId, taskId])`
- `@@index([taskId])`

---

### `QATaskReview`

| Field                 | Type                 | Constraints / notes |
|-----------------------|----------------------|---------------------|
| `id`                  | `String`             | `@id @default(cuid())` |
| `batchId`             | `String`             | `FK → QASampleBatch.id`, `onDelete: Cascade` |
| `taskId`              | `String`             | `FK → Task.id`, **`@unique`** — **global one row per task** |
| `templateVersionId`   | `String`             | `FK → QATemplateVersion.id`, `onDelete: Restrict` |
| `reviewerId`          | `String`             | `FK → User.id`, `onDelete: Restrict` |
| `status`              | `QATaskReviewStatus` | `PENDING` \| `SUBMITTED` |
| `weightedScore`       | `Decimal?`           | `@db.Decimal(5, 2)` — on submit |
| `failedCriticalCount` | `Int?`             | On submit |
| `scoreCap`            | `Decimal?`           | `@db.Decimal(5, 2)` |
| `finalScore`          | `Decimal?`           | `@db.Decimal(5, 2)` |
| `submittedAt`         | `DateTime?`         | Set when `SUBMITTED` |
| `taskSnapshot`        | `Json`               | Filled on submit — frozen task summary |
| `reviewerNotes`       | `String?`            | `@db.Text`, optional |

**Indexes**

- `@@index([batchId])`
- `@@index([status])`
- `@@index([templateVersionId])`

**Global once:** `taskId @unique` ⇒ at most one `QATaskReview` per task (covers both `PENDING` and `SUBMITTED`).

---

### `QALineResult`

| Field                 | Type                   | Constraints / notes |
|-----------------------|------------------------|---------------------|
| `id`                  | `String`               | `@id @default(cuid())` |
| `taskReviewId`        | `String`               | `FK → QATaskReview.id`, `onDelete: Cascade` |
| `lineId`              | `String`               | `FK → QALine.id`, `onDelete: Restrict` |
| `response`            | `QAReviewLineResponse` | `PASS` \| `FAIL` \| `NA` |
| `comment`             | `String?`              | Optional |
| `labelSnapshot`       | `String`               | |
| `weightSnapshot`      | `Decimal`              | `@db.Decimal(10, 2)` |
| `isCriticalSnapshot`  | `Boolean`              | |
| `allowNaSnapshot`     | `Boolean`              | |

**Uniques / indexes**

- `@@unique([taskReviewId, lineId])`
- `@@index([taskReviewId])`

---

### Optional `User` / `Task` backrefs

```prisma
// Example — mirror with proper @relation names on both sides:

// User:
//   qaBatchesAsReviewer QASampleBatch[] @relation("QABatchReviewer")
//   qaBatchesAsSubject  QASampleBatch[] @relation("QABatchSubject")
//   qaTaskReviews       QATaskReview[]

// Task:
//   qaTaskReview QATaskReview?
```

---

## 2. Final seed data structure

Seed input is **data only** (JSON or TS constants). A seed **expander** creates `QATemplate`, `QATemplateVersion`, and `QALine` rows.

### Conceptual types

```ts
// Contract only — not production code

type SeedTaskType =
  | "TEXT_CLUB"
  | "EMAIL_REQUESTS"
  | "YOTPO"
  | "WOD_IVCS"
  /* + others as needed */;

type QASeedFile = {
  templates: QASeedTemplate[];
};

type QASeedTemplate = {
  slug: string; // base slug for logical rubric
  displayName: string;
  taskTypes: SeedTaskType[]; // expand to N QATemplate rows
  wodIvcsSource: WodIvcsSource | null;
  versions: QASeedTemplateVersion[];
};

type QASeedTemplateVersion = {
  version: number;
  lines: QASeedLine[];
};

type QASeedLine = {
  slug: string; // unique per templateVersion after expansion
  sectionOrder: number;
  sectionTitle: string;
  lineOrder: number;
  label: string;
  helpText?: string | null;
  weight: string; // decimal as string, e.g. "5.00"
  isCritical: boolean;
  allowNa: boolean;
};
```

### Expansion rule (shared rubric)

For each entry in `taskTypes[]`, create one **`QATemplate`** with a **globally unique** `slug`, e.g. `${baseSlug}__${taskType}`, and the same `versions[].lines` copied into each template’s `QATemplateVersion` / `QALine` tree. `displayName` can include the channel (e.g. `Quality Review – Yotpo`).

### Example: communications core (illustrative)

```json
{
  "templates": [
    {
      "slug": "qr-communications-core-v1",
      "displayName": "Quality Review – Communications (Core)",
      "taskTypes": ["TEXT_CLUB", "EMAIL_REQUESTS", "YOTPO"],
      "wodIvcsSource": null,
      "versions": [
        {
          "version": 1,
          "lines": [
            {
              "slug": "problem-solving-path",
              "sectionOrder": 1,
              "sectionTitle": "Problem Solving",
              "lineOrder": 1,
              "label": "Correct overall solution path for the customer issue",
              "helpText": "Fail if the agent chose an incorrect resolution path.",
              "weight": "10.00",
              "isCritical": true,
              "allowNa": false
            },
            {
              "slug": "protocol-compliance-spam-unfeasible",
              "sectionOrder": 2,
              "sectionTitle": "Protocol Compliance",
              "lineOrder": 1,
              "label": "Correct handling of spam / unfeasible disposition when applicable",
              "weight": "10.00",
              "isCritical": true,
              "allowNa": true
            },
            {
              "slug": "soft-skills-tone",
              "sectionOrder": 3,
              "sectionTitle": "Soft Skills",
              "lineOrder": 1,
              "label": "Professional tone, clarity, and customer-appropriate language",
              "weight": "5.00",
              "isCritical": false,
              "allowNa": false
            },
            {
              "slug": "end-documentation-disposition",
              "sectionOrder": 4,
              "sectionTitle": "End / Documentation / Disposition",
              "lineOrder": 1,
              "label": "Accurate disposition and documentation for the outcome",
              "weight": "8.00",
              "isCritical": false,
              "allowNa": false
            }
          ]
        }
      ]
    }
  ]
}
```

### WOD / IVCS

Same `QASeedFile` shape; `taskTypes: ["WOD_IVCS"]` and either:

- `wodIvcsSource: null` — one checklist for all WOD sources, or  
- **Separate** `QASeedTemplate` entries per `wodIvcsSource` (e.g. `SO_VS_WEB_DIFFERENCE`) when rubrics diverge.

Example line with **`allowNa: true`** (system outcome):

```json
{
  "slug": "wms-download-after-48h",
  "sectionOrder": 5,
  "sectionTitle": "Systems Outcome",
  "lineOrder": 1,
  "label": "Did the Sale Order download into WMS after 48 hours?",
  "helpText": "NA if agent followed procedure but system failed outside agent control.",
  "weight": "3.00",
  "isCritical": false,
  "allowNa": true
}
```

**Weights:** Parse `weight` string into `Decimal` in seed. Scoring formula (cap, `min(weightedScore, cap)`) stays in application code.

---

## 3. Final reservation / exclusion rules

| Situation | Behavior |
|-----------|----------|
| **`QATaskReview` exists, `status = PENDING`** | Task is **reserved** for that batch (`taskId` is globally unique). |
| **Eligible again** | No `QATaskReview` row for that `taskId`, **or** the `PENDING` row was **deleted** (e.g. batch cancelled). |
| **`status = SUBMITTED`** | Task is **permanently excluded** from random sampling for new batches. Row should **not** be deleted in v1. |
| **Batch `CANCELLED`** | Delete all **`PENDING`** `QATaskReview` rows tied to that batch (and cascade or explicitly remove batch tasks). **`SUBMITTED`** rows are never removed by cancel. |
| **Abandoned session** (browser closed, no cancel) | **`PENDING` remains** → task stays reserved until **cancel** or a **future** cleanup job (not in v1 — document as ops risk). |
| **Batch `COMPLETED`** | Every batch task has `QATaskReview.status = SUBMITTED`; set `completedAt`. |

**Sampling query must exclude:**

1. Any `taskId` with a **`SUBMITTED`** `QATaskReview` (global), and  
2. Any `taskId` with a **`PENDING`** `QATaskReview` (prevents double reservation).

**Concurrency:** Create batch + insert `PENDING` reviews inside a **transaction**. Conflicting `taskId` insert fails unique constraint → return a clear error and **retry sample**.

---

## 4. Final build order

1. **Prisma schema** — Enums + seven models + relations + indexes/uniques (`QATaskReview.taskId` `@unique`).  
2. **Migration** — Generate SQL; verify FK `onDelete` and `taskId` unique behavior.  
3. **Seed artifact** — Commit JSON (or TS) rubric file; implement seed **expander** (upsert template by slug, create version + lines idempotently).  
4. **Backend helpers** — Eligibility: `COMPLETED` + date bounds + agent attribution + optional filters + `NOT EXISTS` (submitted/pending reviews).  
5. **API routes** — Eligibility → create batch (transactional sample + `PENDING`) → get batch / get task → submit → optional cancel.  
6. **Manager UI** — “Quality Review”: filters → counts → batch → step-through → done.  
7. **Tests** — Unique `taskId`, reservation, cancel release, scoring + snapshots on submit.

---

*End of v1 pre-build specification.*
