# Text Club — Security & Data Protection Overview

**Audience:** Executives and stakeholders  
**Purpose:** High-level summary of how customer and operational data are protected.  
**Last updated:** _[Date]_ — _[Owner name / role]_

---

## Executive summary

Text Club is a web application used for customer-care task management and analytics. **Sensitive business and customer data is stored in a managed PostgreSQL database** (hosted on Railway) and is **only accessed from our server-side application**, not directly from users’ browsers. Users sign in through the application; **manager and agent areas require authentication and role checks** before data or internal tools are available.

Security relies on **industry-standard practices** (encrypted connections, secrets kept on the server, database behind credentials and platform controls) and on **how we operate the system** (who has access, backups, monitoring, and updates). No system is “unhackable”; our goal is **defensible architecture** plus **sound operations** and **clear incident response**.

---

## Where data lives

| Item | Location | Notes |
|------|----------|--------|
| Application (UI + APIs) | Netlify (or your host) | Served over HTTPS to end users. |
| Database | Railway — PostgreSQL | Holds tasks, users, messages, and related operational data. |
| Secrets (DB URL, JWT signing key, etc.) | Environment variables on the host | **Not** committed to source code when configured correctly. |

**Fill in for your org:** Production site URL: `________________`  
**Fill in:** Primary data types: e.g. customer contact info, order references, agent actions, disposition notes — `________________`

---

## How data is protected in transit and at rest

- **In transit:** Traffic between users and the site uses **HTTPS (TLS)**. Traffic between the application and the database should use **TLS** per Railway’s standard database connectivity.
- **At rest:** The database resides on Railway’s managed infrastructure, which includes **platform-level storage protections**. Exact features (e.g. backup retention) depend on your **Railway plan and settings** — confirm in the Railway dashboard.

---

## Who can access what (application layer)

- **Authentication:** Users log in; the application issues a **signed session token (JWT)** so the server can verify identity on each protected request.
- **Authorization:** **Role-based access** (e.g. manager vs agent) limits which areas of the product a user can reach. Protected routes and APIs are enforced **on the server**, not only in the browser UI.
- **Direct database access:** End users **do not** connect to PostgreSQL. Only the **backend** uses the database connection string.

---

## Operational controls (what good looks like)

Stakeholders often ask “who can see production data?” The answer should be explicit:

| Practice | Status / owner |
|----------|----------------|
| **Least privilege** — only people who need prod access have it | _[e.g. 3 admins — names/roles]_ |
| **Multi-factor authentication (2FA)** on GitHub, Netlify, Railway | _[Yes / In progress]_ |
| **Separate** production vs staging database and secrets | _[Yes / Planned]_ |
| **Strong, unique `JWT_SECRET`** in production; rotate if ever exposed | _[Confirmed / Date]_ |
| **`DATABASE_URL` and keys only in hosting env** — not in git | _[Confirmed]_ |
| **Backups** enabled on Railway; restore tested periodically | _[Plan / Last test date]_ |
| **Monitoring / error tracking** (e.g. logs, Sentry) for anomalies | _[Tool / Link internal]_ |
| **Dependency updates** for critical security patches | _[Cadence, e.g. monthly]_ |

---

## Vendor and shared responsibility

- **Netlify** and **Railway** provide secure hosting and managed services; they publish their own security and compliance documentation.
- **Shared responsibility:** They secure the **platform**; we secure **our application configuration**, **secrets**, **access to dashboards**, and **how we use** the data (retention, internal policies, training).

**If asked about compliance (HIPAA, PCI, SOC 2, etc.):**  
Compliance depends on **data type**, **contracts** (e.g. BAAs/DPAs), and **process**—not the stack name alone. Answer with: _“We use standard cloud Postgres and HTTPS; for [specific regulation], we’d confirm with legal and vendors whether our current setup and agreements meet requirements.”_

---

## Integrity and availability

- **Integrity:** PostgreSQL supports transactional updates and constraints; application logic defines what gets written. Optional enhancements: **audit logs** for sensitive actions (who changed what, when).
- **Availability:** Depends on Netlify/Railway uptime and your **backup/restore** procedures. Document **RTO/RPO** targets internally if leadership cares about recovery time.

---

## Limitations (honest framing)

- **Insider risk:** Anyone with production DB or admin dashboard access can potentially view data—mitigate with **least privilege**, **logging**, and **access reviews**.
- **Credential theft:** Stolen passwords or session cookies remain a risk—mitigate with **MFA**, **session policies**, and **user training**.
- **Supply chain:** Third-party packages and hosts can have vulnerabilities—mitigate with **updates** and **monitoring**.

---

## If something goes wrong (high level)

1. **Contain:** Revoke compromised credentials, rotate secrets if exposed, disable affected accounts.  
2. **Assess:** Scope (what data, which users), using logs and Railway/Netlify tooling.  
3. **Notify:** Per **legal/privacy** policy and any regulatory obligations.  
4. **Remediate:** Patch, restore from backup if needed, document lessons learned.

**Internal contact for security questions:** _[Name, email]_  
**Next review date for this document:** _[Quarter / date]_

---

*This document is for internal and stakeholder communication. It does not constitute legal advice or a formal certification.*
