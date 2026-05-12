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

**Staging test user:** After migrations on staging, create one login user with `scripts/create-staging-user.mjs` (requires `ALLOW_STAGING_USER_BOOTSTRAP=1`, blocks `interchange.proxy.rlwy.net` in `DATABASE_URL`). See the script file header for the exact command—use **only** the staging Postgres public URL.

---

## Confirmed working staging (reference — Text Club)

The following staging setup was **verified working** (login, app shell, Netlify production and production DB **untouched**).

| Item | Value |
|------|--------|
| **Railway project** | `angelic-harmony` |
| **App service** | `text-club` |
| **Database** | Railway **Postgres** (staging-only) |
| **Git branch** | `chore/railway-staging-prep` |
| **Build command** | `npm ci && npm run build` |
| **Start command** | `npm run start` |
| **Public URL (example)** | `https://text-club-production-b57b.up.railway.app` (Railway-generated; yours may differ) |
| **Sentry** | Omitted on staging initially |
| **Migrations** | `npx prisma migrate deploy` against **staging** `DATABASE_URL` only |
| **First user** | `scripts/create-staging-user.mjs` (guarded) after migrations |

### Lessons learned (staging)

1. **Next.js version:** Railway security scanning blocked **`next@15.5.7`**. Upgrading to **`next@15.5.9`** (pinned in `package.json` / lockfile on `chore/railway-staging-prep`) cleared the gate.
2. **Package manager:** Stale **`pnpm-lock.yaml`** + **`pnpm-workspace.yaml`** (without a valid `packages:` workspace) caused Railpack to run **`pnpm install`** and fail. **Removing those files** left **`npm`** + **`package-lock.json`** as the only lockfile signal—use **npm** only going forward.
3. **Public networking / port:** The app must be reachable on the port Railway’s **public domain** targets. If **`next start`** listens on **`PORT`** (e.g. **8080** on Railway), the **public HTTP service / domain target port** must match (**8080** worked; **3000** produced **502** on `/login`).
4. **Empty DB:** After deploy, run **`npx prisma migrate deploy`** against **staging** before expecting Prisma-backed APIs to work.
5. **Login:** A **`User`** row is required. Use **`scripts/create-staging-user.mjs`** for a single staging test account (not `prisma/seed.mjs` for users).

---

## Branch strategy: merge before prod Railway (A) vs deploy prep branch first (B)

| Option | Description |
|--------|-------------|
| **A — Merge `chore/railway-staging-prep` → `main` first** | Then create the Railway **production** web service with **`main`** as the deploy branch. |
| **B — Railway production from `chore/railway-staging-prep` first** | Private validation deploys the **same branch** that passed staging; merge to **`main`** after validation. |

**Recommendation for private validation:** **B first** (deploy Railway production service from **`chore/railway-staging-prep`**), then **merge to `main`** once the team is satisfied and wants production Railway aligned with the default branch.

| | **A (merge first)** | **B (prep branch first)** |
|--|---------------------|---------------------------|
| **Pros** | Production Railway tracks **`main`** immediately; one less “wrong branch” risk later; matches typical “prod = default branch”. | No merge approval needed to **start** private prod validation; deploys **exact** bits already proven on staging (Next 15.5.9, npm-only, config). |
| **Cons** | Requires **merge approval** before any Railway prod deploy; `main` gains prep changes before private Railway sign-off if you merge early. | Railway prod temporarily follows a **non-default** branch—must **switch deploy branch to `main`** after merge or risk drift. |
| **Risk** | Low if merge is reviewed; prod Railway still a **new** workload on the DB. | **Medium** if someone forgets to move deploy branch to **`main`** after merge. |

---

## Production Railway Private Validation Plan

Goal: run a **second** Railway **web** service against the **real production Railway Postgres** (`DATABASE_URL` = production), **privately** test the Railway URL, while **agents stay on Netlify**. **No DNS change**, **no Netlify disable**, **no agent announcement**. Keep overlap **short** and **controlled**.

### Create the Railway production web service

1. In the Railway dashboard, **add a new service** to the project (or create a **new project** if policy requires isolation—see below).
2. **Source:** same GitHub repo as staging.
3. **Service type:** **Web** / Node (same pattern as staging `text-club`).
4. **Naming:** Use an unambiguous name (e.g. `text-club-production` or `text-club-netlify-parity`) so it is never confused with the **staging** app service `text-club`.
5. **Branch:** See [Branch strategy](#branch-strategy-merge-before-prod-railway-a-vs-deploy-prep-branch-first-b) — for **B**, deploy from **`chore/railway-staging-prep`** until merge; then switch to **`main`**.
6. **Build command:** `npm ci && npm run build`
7. **Start command:** `npm run start`
8. **Environment variables:** set production values (see below). **Do not** run **`prisma migrate deploy`** against production during this phase unless explicitly approved in a separate change window.
9. **Public networking:** align **public domain / proxy target port** with the process **`PORT`** (staging success used **8080** — match whatever Railway sets for this service so **`/login`** does not **502**).
10. **Sentry:** keep **omitted** initially (same as staging) unless you explicitly re-enable; fewer variables and no build-time Sentry plugin unless DSNs are set.

### Same Railway project vs new project

| Approach | When to use |
|----------|-------------|
| **New web service in the same project** (e.g. alongside `angelic-harmony` staging) | **Default:** simpler navigation, shared team access; **strictly separate** `DATABASE_URL` and service names so staging never receives prod credentials. |
| **New Railway project** | Compliance / billing isolation, or hard separation between “Railway staging experiments” and “Railway production.” |

Either is valid; the critical control is **which `DATABASE_URL` each service has**, not which project folder they live in.

### Required production env vars (Railway production web service)

**Minimum to boot and log in (mirror Netlify semantics):**

| Variable | Notes |
|----------|--------|
| **`DATABASE_URL`** | Must reference the **real production Railway Postgres** connection string for this validation phase. |
| **`JWT_SECRET`** | Should **match current Netlify production** if you want the **same signing key** as today (optional for “login again on new host” anyway). |
| **`NODE_ENV`** | `production` |

**Copy from Netlify production** when you need parity for feature smoke tests (names only; values from your secure store):

- Microsoft / SharePoint (`MICROSOFT_*`, `SHAREPOINT_*`, `EXCEL_FILE_NAME`, `WORKSHEET_NAME`, etc.) if you test those flows.
- Self-healing toggles (`SELF_HEALING_*`) if non-default.
- `LOGIN_DIAG`, `DEBUG_PERFORMANCE`, `NEXT_PUBLIC_DEBUG_PERFORMANCE` only if needed.

### What must match Netlify production

| Variable | Match Netlify? | Why |
|----------|----------------|-----|
| **`DATABASE_URL`** | **Yes** — same **production** database as Netlify uses today | Private validation is meaningless otherwise. **Doubles** application connection pressure vs Netlify alone—keep overlap **short**. |
| **`JWT_SECRET`** | **Recommended yes** | Same **HMAC signing** as Netlify; avoids subtle auth differences during comparison. **Cookies are per hostname** — users still **sign in again** on the Railway URL even with the same secret. |
| **Feature secrets** (Microsoft, etc.) | **Yes**, if testing those features | Otherwise behavior diverges from prod. |
| **Sentry** | **Omit initially** (optional later) | Matches current staging approach; add when you want observability on Railway prod. |

### Sentry

Leave **`SENTRY_DSN`**, **`NEXT_PUBLIC_SENTRY_DSN`**, **`SENTRY_ORG`**, **`SENTRY_PROJECT`**, **`SENTRY_AUTH_TOKEN`** unset until explicitly re-enabled. `next.config.ts` only wraps `withSentryConfig` when a DSN env is present.

### Build / start / port (confirmed pattern)

- **Build:** `npm ci && npm run build`
- **Start:** `npm run start`
- **Public port:** set Railway **public networking** target to the same port **`next start`** binds to (**8080** in the successful staging setup, not **3000**, if that was the mismatch).

### Branch strategy for this phase

- **Recommended:** **B** — deploy Railway **production** validation service from **`chore/railway-staging-prep`** (same commit family as green staging), then **merge** to **`main`** and **switch the Railway production service deploy branch** to **`main`** for long-term hygiene.
- **Alternative:** **A** — merge **`chore/railway-staging-prep`** to **`main`** first, then attach Railway production to **`main`**.

### Private smoke test checklist (Railway production URL only)

Run as **internal testers**; do **not** broadcast the Railway URL.

- [ ] **`GET /login`** loads (no **502** — port / `PORT` correct).
- [ ] **Login** with a **known production user** (password unchanged); confirm redirect to `/agent` or `/manager`.
- [ ] **Agent:** task list, heartbeat, start/complete path on **non-destructive** tasks if possible.
- [ ] **Manager:** dashboard metrics load.
- [ ] **`GET /api/health`** returns healthy when DB is reachable.
- [ ] Confirm **Netlify production** still works for agents **in parallel** (no DNS change).
- [ ] **No** `prisma migrate deploy`, **`db push`**, or **`migrate reset`** unless in an approved window.

### Rollback / abort plan

- **Stop traffic:** remove or disable the Railway **production** web service’s **public domain** / set service **stopped**, or delete the temporary production web service only (does **not** delete Postgres).
- **Database:** if no migrations were run from Railway, schema is unchanged; if something went wrong, follow **backup / restore** runbooks—never `migrate reset` on production.
- **Netlify:** unchanged; agents remain on Netlify.
- **Secrets:** do not rotate unless incident response requires it.

### Avoiding early agent use of the Railway URL

- **Do not** post the Railway URL in team-wide channels or runbooks used by agents until cutover.
- **Do not** add the Railway URL to email footers, bookmarks docs, or SSO redirect URIs until cutover.
- Optional: protect with **Railway TCP / IP allowlist** or **HTTP basic auth** at the edge only if your plan supports it (not required by this doc).

### Risks before connecting the production web app to the real production DB

- **Connection load:** Netlify serverless + Railway Node each open **pools** to the same Postgres—watch **max connections** and Railway/proxy limits during overlap.
- **Write paths:** any bug that **bulk-writes** or **migrates** could affect production data—treat private validation as **read-mostly** where possible.
- **Wrong `DATABASE_URL`:** pasting **staging** URL into the production service (or vice versa) is the highest-impact mistake—**verify hostname** in the UI before first deploy.
- **Migrations:** running **`migrate deploy`** from a laptop or CI against prod by mistake—**do not** during this phase unless explicitly approved.

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

Railway injects **`PORT`** (commonly **`8080`** in deployed services); `next start` listens on **`PORT`**. The **public domain / edge target port** in Railway must match that listen port or routes will **502**.

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

See PR description for: removal of duplicate `next.config.js`, `serverExternalPackages` alignment, `next build` without Turbopack, **Next 15.5.9** security bump, **pnpm file removal**, **`engines.node` 20.x**, **`scripts/create-staging-user.mjs`**, and this document’s **staging reference** + **production private validation** sections.
