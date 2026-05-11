# Railway migration and staging plan

This document supports moving the Text Club portal from Netlify (serverless Next) to **Railway** as a **long-running Node** process, with a **staging** environment first. It does not change production by itself—follow the safety sections.

---

## Business-hours safe work vs after-hours work

### Safe during business hours (repo / local only)

- Edit application code and docs on a **feature branch**; open PRs for review.
- Run **local** commands: `npm run build`, `npm run lint`, `npx prisma validate`, `npx prisma generate`, `npm run dev`.
- **Railway staging** service setup (new service, **staging database**, env vars copied from a template—**not** production secrets in chat logs).
- Smoke-test **staging URL** with test accounts (no production data changes unless explicitly approved).

### Prefer after-hours or change windows (or explicit approval)

- **`prisma migrate deploy`** against **production**.
- **Production** Railway or Netlify **env** changes, **DNS**, **custom domains**, disabling Netlify, or **rotating secrets**.
- **Bulk data** operations, restores, or anything that could lock or stress **production** Postgres during peak agent use.
- Pointing **staging** at the **production** `DATABASE_URL` (never do without explicit written approval).

---

## Staging setup plan

1. **Branch / PR:** Ship preparatory changes via PR (e.g. `chore/railway-staging-prep`); merge only after review—not direct to `main` without approval.
2. **Railway project:** Create a **new** Railway project (or new environment) for **staging**.
3. **Postgres:** Provision a **dedicated staging Postgres** (clone/snapshot from prod only if your process allows; default is empty or seed).
4. **Service:** One **Web** service from this repo: **root directory** default, **Node** runtime.
5. **Package manager:** This repo uses **`npm`** and **`package-lock.json`**. Do not commit **`pnpm-lock.yaml`** or a **`pnpm-workspace.yaml`** without a real `packages:` workspace—Railway/Railpack auto-detects pnpm and runs `pnpm install`, which can fail or diverge from npm.
6. **Build / start:** Use the commands in [Railway build/start](#railway-build-and-start-commands) below.
7. **Migrations (staging only):** When the team is ready, run `npx prisma migrate deploy` **against staging `DATABASE_URL`** from CI or a one-off job—not mixed with production.
8. **Smoke tests:** Login, agent task list, heartbeat, manager dashboard, critical API routes (see [Workflows to test](#workflows-to-test-before-production-cutover)).

**Do not** point staging at production DB without explicit approval from the project owner.

---

## Required environment variables (names only—no secret values)

Copy from your secure store (e.g. Netlify UI export / 1Password). **Set the same variable names on Railway staging** with **staging-appropriate values** (especially `DATABASE_URL` and optional `JWT_SECRET` policy).

### Core

| Variable | Scope | Notes |
|----------|--------|--------|
| `DATABASE_URL` | Server | Staging DB connection string only for staging. |
| `JWT_SECRET` | Server | Required for auth; staging may use a different secret than prod (all users re-login on that host). |
| `NODE_ENV` | Server | `production` for Railway staging/prod deploys. |

### Auth / optional diagnostics

| Variable | Notes |
|----------|--------|
| `LOGIN_DIAG` | Optional; `1` enables verbose login logging. |

### Sentry

| Variable | Notes |
|----------|--------|
| `SENTRY_DSN` | Server-side Sentry. |
| `NEXT_PUBLIC_SENTRY_DSN` | Client-side; also used at build time when Sentry webpack plugin is enabled. |
| `SENTRY_ORG` | Optional; source maps. |
| `SENTRY_PROJECT` | Optional; source maps. |
| `SENTRY_AUTH_TOKEN` | Optional; CI/source map upload. |

### Microsoft / SharePoint (if email-requests features are tested on staging)

| Variable | Notes |
|----------|--------|
| `MICROSOFT_CLIENT_ID` | |
| `MICROSOFT_CLIENT_SECRET` | |
| `SHAREPOINT_SITE_URL` | |
| `EXCEL_FILE_NAME` | |
| `WORKSHEET_NAME` | |

### Self-healing (optional toggles)

`SELF_HEALING_ENABLED`, `SELF_HEALING_RETRY`, `SELF_HEALING_MAX_RETRIES`, `SELF_HEALING_INITIAL_DELAY`, `SELF_HEALING_MAX_DELAY`, `SELF_HEALING_CIRCUIT_BREAKER`, `SELF_HEALING_FAILURE_THRESHOLD`, `SELF_HEALING_RESET_TIMEOUT`, `SELF_HEALING_STATUS_VALIDATION`, `SELF_HEALING_RESPONSE_VALIDATION`, `SELF_HEALING_LOGGING`, `SELF_HEALING_LOG_LEVEL`

### Client debug

| Variable | Notes |
|----------|--------|
| `NEXT_PUBLIC_DEBUG_PERFORMANCE` | Optional; verbose client logging. |

### Server debug

| Variable | Notes |
|----------|--------|
| `DEBUG_PERFORMANCE` | Optional; e.g. agent tasks API logging. |

Railway injects **`PORT`**; `next start` listens on it automatically.

---

## Railway build and start commands

Recommended for **staging** (matches `package.json` after prep branch):

| Phase | Command |
|--------|---------|
| **Install** | `npm ci` (preferred if `package-lock.json` is committed) or `npm install` |
| **Build** | `npm run build` |
| **Start** | `npm run start` |

`npm run build` runs `prisma generate` then **`next build`** (standard webpack build—conservative for first Railway deploy).

`npm run start` runs **`next start`**, which is correct for a **persistent Node** service on Railway.

---

## Migration safety rules

**Allowed (when you intentionally run migrations against the intended DB):**

- `npx prisma migrate deploy` against **staging** `DATABASE_URL` during a planned window.
- `npx prisma validate` / `npx prisma generate` locally or in CI (no DB schema change).

**Do not (production and shared safety):**

- `prisma migrate reset`
- `prisma db push` against production (especially `--force-reset`)
- Use **production** `DATABASE_URL` as a **shadow** database for any command
- Run destructive SQL without backup and approval
- Point **staging** at **production** `DATABASE_URL` without **explicit** approval

The Prisma schema does not define `shadowDatabaseUrl`; `migrate deploy` does not use a shadow DB the way `migrate dev` does—still treat every deploy as **irreversible** without a restore plan.

---

## Production cutover checklist (future—not executed by this doc)

- [ ] Backup production Postgres; verify restore procedure.
- [ ] Merge migration-prep PRs; freeze schema for the window.
- [ ] Run `prisma migrate deploy` against **production** in a controlled step (after hours unless approved).
- [ ] Set all production env vars on Railway **production** service.
- [ ] Deploy Railway production; smoke-test with internal accounts.
- [ ] Switch **DNS / custom domain** when ready (separate change window).
- [ ] Update any **OAuth / Azure** redirect URIs that still reference the Netlify hostname.
- [ ] Communicate new URL to agents and managers.

---

## Rollback plan

- **DNS:** Point canonical hostname back to Netlify if DNS was switched.
- **Traffic:** Re-enable or keep Netlify as primary until Railway is verified.
- **Database:** If a bad migration was applied, **restore from backup**—do not `migrate reset` on production.
- **Secrets:** Do not rotate unless incident response requires it.

---

## Netlify redirect / decommission plan (future)

**After** Railway production is validated:

1. **301 redirect** from the Netlify site (`thunderous-crisp-50ad13.netlify.app` or custom domain on Netlify) to the **canonical** Railway URL or custom domain on Railway.
2. Keep Netlify **read-only** (redirect-only deploy) for a defined period so bookmarks continue to work.
3. Remove Netlify **build hooks** / primary deploy only when the team agrees Netlify is no longer needed.
4. Update internal runbooks and bookmarks.

Do **not** disable Netlify or change Netlify production settings until the team explicitly cuts over.

---

## Workflows to test before production cutover

Run on **staging** with staging credentials:

- **Auth:** `/login` → JWT cookie → `/agent` or `/manager`; logout; password change if applicable.
- **Agent:** task list load/poll, `completed-today`, completion stats, start task (double-click idempotency), complete task, assistance thread.
- **Manager:** dashboard metrics, user list, heartbeat from agent session (`/api/manager/users/heartbeat`).
- **Health:** `GET /api/health` (confirms `DATABASE_URL` present; extend expectations as needed).
- **Optional:** email-requests import paths if Microsoft envs are set on staging.
- **Sentry:** trigger a safe test error in staging; confirm events and source maps if configured.

---

## Repo configuration notes (canonical Next config)

- **Single Next config:** `next.config.ts` at the repo root (Sentry `withSentryConfig` + `serverExternalPackages: ['@prisma/client']`).
- **Prisma client:** `src/lib/prisma.ts` is the shared DB client for the app.
- **`src/lib/spam.ts`:** contains a legacy `PrismaClient` and `scanAndLabelSpam`; **no current imports** of `@/lib/spam` in routes—spam flows use `@/lib/spam-detection` → `@/lib/prisma`. **Do not remove** without a dedicated cleanup PR and grep verification.

---

## Open questions before configuring Railway

1. **Staging database:** Fresh Postgres vs restore from prod snapshot (privacy + process)?
2. **JWT:** Same `JWT_SECRET` as prod for staging (portable cookies between envs—usually no) vs separate secret?
3. **Custom domain:** Will staging use `*.up.railway.app` only, or a dedicated subdomain (e.g. `staging.example.com`)?
4. **Replicas:** Single Railway instance vs multiple (affects migration job concurrency and load)?
5. **Sentry:** Separate staging project vs same DSN with environment tagging?

---

## Changelog reference (prep branch)

See PR description for: removal of duplicate `next.config.js`, `serverExternalPackages` alignment, and `next build` without Turbopack for conservative CI/Railway builds.
