# Production Remediation Checklist

This checklist tracks remediation from `docs/audit.md` and the consolidated
pre-production audit. Work proceeds in phase order. Update task and phase
status only when acceptance criteria have evidence; a failed or unrun check is
not complete. Findings are grouped into six executable phases while retaining
coverage of all nine audit categories.

## Status and priority

- **Status:** NOT STARTED, IN PROGRESS, BLOCKED, COMPLETED.
- **Priority:** CRITICAL, HIGH, MEDIUM, LOW.
- A completed phase may retain a blocked security-risk task only when the
  approved work in that phase is complete and the unresolved risk is explicitly
  recorded below. This does not mean the risk is fixed or the application is
  production-ready.
- Do not perform destructive database actions, migrations against existing
  data, production actions, business-rule changes, sensitive-data exposure, or
  significant-cost work without explicit user approval.

## Progress summary

| Phase | Scope | Status | Completed tasks | Remaining tasks |
|---|---|---:|---:|---:|
| 1 | Security dependency remediation | COMPLETED | 4 | 0 |
| 2 | Production deployment and configuration | BLOCKED | 2 | 2 blocked |
| 3 | Database integrity, migrations and recovery | BLOCKED | 4 | 2 business decisions |
| 4 | Authentication, authorization and API integration tests | BLOCKED | 5 | 1 |
| 5 | Performance, scalability and reliability | BLOCKED | 0 | 5 |
| 6 | Release testing, privacy, UI/accessibility and code quality | BLOCKED | 2 | 5 |

**Overall:** 17 tasks completed; 15 tasks remain.
Phase 3's technical tasks are complete; it remains blocked on two business
decisions and the existing-data tenant ownership preflight recorded under
P3-03. Phase 4's authorized isolated integration and browser suites pass, but
P4-06 remains blocked pending production-proxy rate-limit verification.
Phases 5–6 remain blocked on representative performance targets/data volumes,
operational evidence, privacy decisions, physical-device checks and hosted
release gates. The approved Prisma major upgrade removed the previously
unresolved HIGH advisory chain. The production dependency audit now has zero
findings; the full audit retains 16 MODERATE development-tooling entries.
This is not a production-readiness declaration.

### Owner-directed deferral — 2026-11-03

The owner requested postponing production operations and performance work.
These items are **out of the current execution scope**, not completed,
verified, waived or accepted as production risks. Their existing BLOCKED
statuses, priorities and acceptance criteria remain unchanged.

| Deferred group | Tasks | Resume condition |
|---|---|---|
| Production environment and operations | P2-03, P2-04, P4-06, P5-05, P6-06 | Owner requests resumption and provides the applicable infrastructure/access and operational decisions |
| Performance measurements and scalability | P5-01, P5-02, P5-03, P5-04 | Owner requests resumption; representative workloads and performance targets are then agreed |

Do not perform further work in these groups until the owner resumes them.
P6-07 remains blocked; deferral does not authorize production deployment or
existing-data migrations. P6-01 and P6-04 are not included in this deferral.
The current discussion focuses on P3-01, P3-02 and P6-03 business/privacy
decisions. An answer approving a policy is not approval to modify an existing
database or execute a destructive operation.

### Business/privacy decision agenda — awaiting owner answers

Ask these decisions individually, using the first answer to avoid irrelevant
historical-data questions. The recommendations below are proposals, not
approved business rules or legal conclusions.

| Decision | Concrete decision to obtain | Recommendation and reason |
|---|---|---|
| B01 — Existing data | Will deployment use a new empty database, only disposable synthetic test data, or existing real partner/purchase data? | Prefer a new empty production database if there are no real records to preserve. If real records exist, preserve them and require a separately approved read-only preflight/rehearsal; never treat them as test data. |
| B02 — Duplicate tokens (P3-01) | If real duplicate active QR/NFC tokens exist, should the survivor be selected manually per partner/type, by last use, or by creation time? | Explicit manual selection based on the card actually held/used; do not revoke a working card solely because another token has a newer ID. Keep QR and NFC independent and preserve purchase references. |
| B03 — Hash-only tokens (P3-01) | Should old working tokens without a recoverable encrypted URL remain usable until the owner explicitly replaces them? | Keep them usable; explain that reopening/reprinting requires explicit replacement and that replacement invalidates the old credential. No automatic blanket replacement. |
| B04 — Historical amounts (P3-02) | Do historical purchase amounts include VAT, exclude VAT, or vary across records? | Confirm from source records; do not infer gross/net meaning from the current schema or assume one interpretation for mixed history. |
| B05 — Historical VAT (P3-02) | Is 23% evidenced for every historical purchase, or are there other rates/exemptions by record/period? | Use evidenced per-record/period rates; block uncertain records instead of applying blanket 23%. |
| B06 — Historical points/badges (P3-02) | Preserve already awarded historical points/badges, or explicitly recalculate them under an agreed rule? | Preserve earned history by default. Any correction needs an approved rule, before/after reconciliation and preserved original values; no silent retroactive reduction. |
| B07 — Future points (P3-02) | Confirm whether new purchases earn FLOOR(net amount), FLOOR(gross amount), or another formula, including rounding. | Retain the current net-based formula unless the owner intentionally changes it: gross 123 at 23% gives net 100 and 100 points. Historical policy is a separate decision. |
| B08 — Historical tenant ownership (P3-03 preflight) | If real pre-company records exist, do all belong to one explicitly identified company, or must ownership be mapped per record? | Explicit ownership mapping; never infer that every historical row belongs to company ID 1. |
| B09 — Public card fields (P6-03) | Should anyone with the bearer QR/NFC link see detailed purchase history, only aggregate points/totals, or only basic card identity/status? | Minimize public disclosure: basic identity/status and only the owner-approved aggregate needed for the card; reserve detailed purchase history/contact/internal fields for authenticated authorized users. Requires owner/legal approval before changing current behavior. |
| B10 — Retention (P6-03) | Who will approve retention periods for partner/contact data, purchases, privacy evidence, audit logs and backups? | Have the controller/legal adviser define periods by data category and obligation; do not invent one blanket period or implement automatic deletion before approval. |
| B11 — Rights handling (P6-03) | Initially use a documented administrator-managed, identity-verified export/erasure process, or implement a self-service workflow? | Start with a documented, authorized administrator-managed process and scoped export/anonymization where legally allowed. Preserve legally required purchase/audit evidence and define backup treatment; do not equate soft deletion with erasure. |

**B01 owner answer (2026-11-03):** Production will start with a new empty
database; current data is test-only. Preserve the existing test database; this
answer does not authorize deleting it or running migrations against it.
No historical data/token import is requested. B02–B06 and B08 therefore do
not require historical policy decisions for this selected fresh-start release.
Their findings remain relevant to any future existing-data import/migration.
P3-01/P3-02 are not marked completed by this answer alone: reconcile their
release applicability and fresh-database evidence when implementing the
agreed plan. B07 and B09–B11 still require decisions.

**B07 owner answer (2026-11-03):** Retain the current rule for new purchases:
one point per whole euro of the net amount, rounded down (`FLOOR(net amount)`).
Gross 123 EUR at 23% VAT gives net 100 EUR and 100 points; net 100.99 EUR
gives 100 points. No historical recalculation or application change is
authorized or needed for this confirmed existing rule. B09–B11 remain pending.

**B09 owner answer (2026-11-03):** Retain the current public QR/NFC card
disclosure, including purchase history and monetary/points/badge summaries.
This approves retaining existing product behavior, not a legal compliance
conclusion or completion of P6-03. Retention and rights handling (B10/B11)
remain pending.

**Lost-card behavior clarification:** Replace the credential on the existing
partner, not by creating a new partner. `rotatePartnerToken` deactivates the
selected old token and creates its replacement with the same company/partner
identity, with audit records in one transaction. Public purchase history is
queried by company/partner, not by the current token, so the new card retains
old non-deleted purchases, totals and badge history. Old purchase token
references are not rewritten. QR and NFC replacements are type-specific:
if both credentials were on the lost physical card, revoke/replace both;
replacing QR alone does not invalidate NFC. Merely reprinting an existing
credential does not revoke the lost card.

### Latest local-readiness verification

The user explicitly approved the Prisma major upgrade and rerunning both
disposable database harnesses. No existing/production database was migrated;
the 11 checked-in migration SQL files are unchanged.

| Check | Actual result |
|---|---|
| Dependency versions | Next.js/config 16.4.3; Zod 4.6.6; Prisma/client/MariaDB adapter 7.10.1 |
| Dependency audits | Production: 0; full: 16 moderate, 0 high/critical; no forced fixes/overrides |
| Local lint, typecheck, unit tests, standalone build | Passed; 65/65 unit tests |
| Clean Linux Node 24 build and offline quality gates | Passed; lint, typecheck, 65/65 units and unused-local/parameter checks |
| Complete standalone acceptance | 132/132, including 54 API matrix tests and 27 browser tests |
| Logout/history regression | Three fresh HTTPS sessions; actual login form reappears, private content absent, API returns 401 |
| Disposable Phase 3 harness | Schema/grants, four race orderings, audit rollback, populated restore, key recovery and Prisma ledger/resume passed |
| Actual non-root runtime image | UID 1001, Prisma 7.10.1, 11 login assets return 200, CSP, anonymous 401, canonical redirect and generic DB-outage 503 |
| Offline shutdown smoke | SIGTERM stopped the server within 10 seconds, exit 143; in-flight write draining was not measured |
| Production/hosted infrastructure | Not accessed or inferred; existing blockers remain |

Local-readiness follow-up files: `package.json`, `package-lock.json`,
`prisma.config.ts`, `prisma/schema.prisma`, both `prisma/seed*.ts` scripts,
`src/server/db.ts`, `src/server/db-adapter.mjs`, `src/proxy.ts`,
`scripts/check-database.mjs`, `scripts/prepare-standalone.mjs`,
`tests/db-adapter.test.ts`, `tests/phase11.test.ts`,
`tests/phase11-http.test.ts`, `tests/exports-acceptance.test.ts`,
`tests/browser-acceptance.test.ts`, `tests/run-phase5a.mjs`,
`tests/phase3-database.test.ts`, `tests/run-phase3-db.mjs`,
`.github/workflows/ci.yml`, `docs/deployment.md` and this checklist.
The worktree also contains the earlier authorized deployment, API and
transaction changes; this list is not a clean-commit diff.

## Phase 1 — Security dependency remediation

**Phase status: COMPLETED.** The separately approved Prisma 7 transition and
database regressions are verified, in addition to the earlier Next.js/Zod work.
Remaining MODERATE development-tooling advisories are recorded under P1-04.

### P1-01 — Patch Next.js and its matching ESLint configuration

- **Status:** COMPLETED
- **Priority:** CRITICAL
- **Original findings:** Audit Phase 1 (dependency vulnerabilities); consolidated
  finding DEP-1.
- **Evidence/result:** `package.json` and `package-lock.json` now resolve
  `next` **16.4.3** and `eslint-config-next` **16.4.3**. The audited version
  16.4.0 was within the affected ranges for Next.js image-optimization RCE,
  Server Actions DoS and typed-array cache RCE advisories. The installed
  `sharp` resolves to **0.35.5**. No application `use cache` function returning
  typed arrays was found, but App Router and a Server Action are used.
- **Acceptance criteria/evidence:** Matching patched framework/lint package
  versions in the lockfile; dependency audit no longer reports the affected
  Next.js advisories; lint, typecheck, unit tests and production build pass.
- **Verification:** Exact versions confirmed with `npm ls`; full and
  production-only audits no longer report Next.js; lint, typecheck, 57/57 unit
  tests and production build passed.

### P1-02 — Patch Zod

- **Status:** COMPLETED
- **Priority:** HIGH
- **Original findings:** Audit Phase 1 (dependency vulnerabilities); consolidated
  finding DEP-2.
- **Evidence/result:** `package.json` and `package-lock.json` now resolve Zod
  **4.6.6**, the first version reported as patched for GHSA-mrhx-c7xc-m3w5.
  The application’s token-ID array has a maximum length of 100; no unbounded
  array schema was found. JSON body byte-size limits remain a separate
  deployment/API concern.
- **Acceptance criteria/evidence:** Patched Zod version in the lockfile; audit
  no longer reports the Zod advisory; validation tests and approved regression
  suite pass.
- **Verification:** Exact version confirmed with `npm ls`; full and
  production-only audits no longer report Zod; lint, typecheck, 57/57 unit
  tests and production build passed.

### P1-03 — Resolve Prisma advisories through the separately approved upgrade

- **Status:** COMPLETED
- **Priority:** HIGH
- **Original findings:** Audit Phase 1 (dependency vulnerabilities); consolidated
  finding DEP-3.
- **Evidence/result:** The initial compatible **6.19.3** patch removed the
  `effect` advisory but left the HIGH `deepmerge-ts` chain. After explicit
  user approval, `prisma`, `@prisma/client` and
  `@prisma/adapter-mariadb` were upgraded together to **7.10.1**.
  `@prisma/config` now resolves patched `deepmerge-ts` **8.0.2** and
  `effect` **3.20.0**. Both audits contain zero HIGH/CRITICAL entries;
  production-only audit contains zero vulnerabilities. No override or risk
  acceptance was used.
  Runtime, seeds, diagnostics and test observers use the shared MariaDB
  adapter with UTC and explicit connection/pool defaults. CLI datasource
  configuration uses `MIGRATE_DATABASE_URL`; runtime still uses the
  least-privilege `DATABASE_URL`. The supported `prisma-client-js` generator
  was retained to preserve imports. Prisma validation/generation, lint,
  typecheck, 65 units, clean Linux production build and 132 standalone
  acceptance tests passed. The entire Phase 3 disposable harness passed,
  including schema/grants, concurrency/audit rollback, populated restore,
  separate key recovery and migration bookkeeping. No migration SQL or
  historical business rules changed.
- **Acceptance criteria/evidence:** A compatible, non-breaking remediation is
  verified against official advisory data and Prisma 6 compatibility, or a
  separately approved Prisma 7 migration is fully tested; applicable audit
  findings are absent or a specific, justified risk decision is recorded.
- **Files involved:** `package.json`, `package-lock.json`,
  `prisma/schema.prisma`, `prisma.config.ts`, `src/server/db.ts`,
  `src/server/db-adapter.mjs`, seeds, diagnostics and database test runners.
- **Regression tests:** Prisma validation/client generation, typecheck, build,
  database and transaction integration tests, isolated acceptance suite.
- **Approval boundary:** The major upgrade and both disposable runners were
  explicitly approved. No override was applied. Any migration against
  existing data still requires separate explicit approval.

### P1-04 — Maintain dependency security evidence

- **Status:** COMPLETED
- **Priority:** HIGH
- **Original findings:** Audit Phase 1 and Phase 6 (dependency audit).
- **Evidence/result:** After Prisma 7.10.1, the full audit reports
  **16 findings (0 critical, 0 high, 16 moderate)**; production-only audit
  reports **0**. The moderate entries are the development/lint
  `minimatch <11.0.1` DoS chain, GHSA-g3hv-75wg-m249, not 16 independently
  exploitable application defects. npm suggests incompatible downgrades of
  ESLint/config or major dependency changes, not a verified compatible
  complete fix. Forced downgrades/overrides were not applied. The HIGH/CRITICAL
  CI threshold passes, but the full dependency tree is not vulnerability-free.
- **Acceptance criteria/evidence:** Keep audit output with each dependency
  change; do not describe unresolved findings as fixed; rerun both full and
  production-only audits after each dependency change.

## Phase 2 — Production deployment and configuration

**Phase status: BLOCKED.** The user confirmed Docker + Caddy as the production
target. Local build, service health, TLS/header/CSP behavior, secret-file
loading, backup and isolated restore are verified. Production-domain TLS,
operator-provisioned secrets, external monitoring, off-host encrypted backup,
and release-specific rollback readiness require production access or operator
decisions and are documented as blockers. Phase 3 technical verification is
complete but remains blocked on business decisions and an existing-data
ownership preflight.

### P2-01 — Inventory and validate existing deployment configuration

- **Status:** COMPLETED
- **Priority:** HIGH
- **Original findings:** Audit Phase 6 (deployment/configuration); consolidated
  finding PROD-1.
- **Evidence/result:** Compared `docs/deployment.md` and
  `docs/architecture.md` with repository files. Existing evidence indicates
  development `docker-compose.yml` only; no `Dockerfile`,
  `docker-compose.prod.yml`, Caddy configuration, checked-in CI workflow or
  `/api/health` route was found. `next.config.ts` does not set standalone
  output. `docker compose config --quiet` passed without starting or changing
  services.
- **Acceptance criteria/evidence:** Recorded actual tracked files and target
  options; development Compose validation was read-only and performed no
  container or database operation.
  configuration validation is read-only and performs no container or database
  operation; do not mark Docker production packaging complete merely because
  development Compose is valid.
- **Likely files if remediation is later approved:** `docker-compose.yml`,
  deployment docs, and—only for Docker target—new production artifacts.
- **Approval boundary:** No deployment, service startup, image build or
  production environment changes in this inventory task.

### P2-02 — Confirm the intended production hosting target

- **Status:** COMPLETED
- **Priority:** HIGH
- **Original findings:** Audit Phase 6 (deployment, HTTPS, proxy and runtime);
  consolidated finding PROD-1.
- **Evidence/result:** User confirmed Docker + Caddy as the intended production
  target. The deployment requirements remain those documented in
  `docs/deployment.md`.
- **Acceptance criteria/evidence:** Target confirmed; runtime, health/readiness,
  HTTPS, trusted proxy, secrets, process restart, logs and rollback will be
  checked against that target in P2-03/P2-04.
- **Dependencies:** P2-01.

### P2-03 — Implement only the selected deployment artifacts

- **Status:** BLOCKED
- **Priority:** HIGH
- **Original findings:** Audit Phase 6 (packaging, production start, TLS,
  headers, health/readiness, graceful shutdown, rollback).
- **Evidence/result:** Added standalone Next.js output, a multi-stage non-root
  Docker image, production Compose services with private DB networking and an
  explicit migration profile, Caddy HTTPS/security headers and client-IP
  forwarding, a production-only MariaDB initializer, file-backed runtime
  secrets, nonce-based CSP for page responses, and an anonymous
  database-readiness endpoint. Built the app and migration images with
  synthetic build-only values. In a newly created isolated Compose project,
  MariaDB initialized the separate app/migration users, all 11 migrations
  applied, the documented app-table grants worked, and the application became
  healthy. `/api/health` returned `200 {"status":"ok"}`. The earlier smoke
  verified POST returns 405 and DB outage returns generic 503, followed by
  recovery. Secret-file entrypoint checks confirmed all four runtime values
  were loaded without printing them; no mounted synthetic secret values were
  found in app logs. All test secret files were mode 0600 in a mode 0700
  directory.
- **TLS/header/CSP verification:** Ran the repository Caddyfile against the
  isolated app using a local Caddy certificate authority. `caddy validate`
  passed; HTTPS returned 200; TLS 1.2 and 1.3 negotiated and TLS 1.1 was
  rejected. The response contained HSTS, `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, and CSP. The CSP
  script nonce matched the returned HTML; `script-src` contained neither
  `unsafe-inline` nor `unsafe-eval`. `style-src` retains `unsafe-inline` for
  existing inline style use. The local certificate chain was not trusted by
  the host, as expected for this isolated CA test.
- **Acceptance criteria:** Local build/configuration, readiness, secret-file
  loading, nonce CSP, TLS negotiation and security headers are evidenced.
  Completion additionally requires a successful public-domain certificate
  issuance/renewal and externally trusted HTTPS/header check, operator-created
  production secret files and rotation/permissions evidence, and actual
  production settings/ingress verification.
- **Remaining blockers:** No production domain/DNS, public ingress/firewall,
  ACME issuance/renewal, trusted external TLS check, production secrets or
  secret manager access was provided. The forwarding behavior is locally
  configured for a direct client; if production sits behind a load balancer,
  the operator must identify its trusted proxy ranges and test the actual
  chain. No production service or existing database was accessed.
- **Files:** `Dockerfile`, `.dockerignore`, `docker-compose.prod.yml`,
  `docker/caddy/Caddyfile`, `docker/mariadb/prod-init/01-databases-and-users.sh`,
  `docker/app/entrypoint.sh`, `next.config.ts`,
  `src/app/api/health/route.ts`, `src/proxy.ts`, health/proxy tests and
  `docs/deployment.md`.
- **Regression tests:** Production Docker build, fresh isolated MariaDB
  initialization, 11 migrations, runtime grants, app health, local HTTPS,
  security headers and CSP nonce-to-HTML match passed. Lint, typecheck, unit
  tests (59/59) and production build passed earlier in this phase; shell syntax,
  Compose configuration and `git diff --check` are rerun before handoff.
- **Dependencies/approval:** P2-02. Local reversible implementation can proceed
  after target confirmation; never deploy without explicit approval.

### P2-04 — Verify operational secrets, ingress, monitoring and recovery setup

- **Status:** BLOCKED
- **Priority:** HIGH
- **Original findings:** Audit Phase 1 (secrets/configuration, headers, trusted
  proxy), Phase 6 (monitoring, reliability, backups).
- **Evidence/result:** `scripts/db-backup.sh` created an isolated synthetic
  database backup; the resulting gzip archive was valid, mode 0600, in a mode
  0700 directory. `scripts/db-restore-test.sh` restored it into a fresh
  MariaDB container using `--network none`, confirmed 11 tables and 11
  completed migrations, and cleaned up its named test container/volume.
  Restore-test root credentials are generated locally, kept in a mode 0600
  temporary file mounted read-only, and removed on exit; cleanup failure makes
  the script fail. Compose app and database healthchecks are configured, and
  the isolated app healthcheck was healthy. Deployment documentation now
  contains manual backup/restore, key-recovery, monitoring/alerting and
  rollback procedures.
- **Remaining blockers:** No production database backup or restore was
  performed. Scheduling, 30-day retention, encryption, off-host storage,
  restore cadence, and independent recovery of `TOKEN_ENCRYPTION_KEY` require
  an approved production backup provider and operator configuration. No
  external uptime/error monitor or alert routing was provided; select a
  provider, cost, recipients and escalation path, then verify alerts for app
  outage, DB health, disk capacity, backup failure/staleness and recovery.
  Rollback commands are documented, but no actual prior immutable image tag,
  deployed release record or backward-compatible schema evidence exists.
  Production ingress/proxy-chain trust also remains unverified.
- **Acceptance criteria:** Evidence must show production secrets are sourced,
  rotated and access-limited without exposure; ingress trust matches the real
  topology; monitoring alerts are delivered; backups are encrypted and stored
  off-host with approved retention; isolated restore and encryption-key
  recovery succeed; and a release-specific rollback is rehearsed against
  compatible schema/image versions. Local backup and restore checks alone do
  not satisfy these production criteria.
- **Dependencies:** P2-02 and P2-03.
- **Approval boundary:** Reading or changing production secrets, monitoring
  subscriptions with material cost, production settings, backup provider or
  retention decisions, or a production rollback requires explicit approval.

## Phase 3 — Database integrity, migrations and recovery

**Phase status: BLOCKED.** All technically actionable Phase 3 tasks are
complete. Static review of all 11 checked-in SQL
migrations, the Prisma schema/configuration, seed code and deployment
instructions is complete. Fresh-database deployment, Prisma schema parity,
effective grants, app concurrency/transaction tests, a populated synthetic
backup/restore and separate token-key recovery have now been verified using
uniquely named disposable MariaDB resources. Prisma ledger failure and recovery
behavior was exercised with temporary copies of migration files only. No
production or pre-existing database was accessed, and no checked-in migration
SQL was changed. P3-01/P3-02 remain BLOCKED on business decisions. Before any
existing-data migration, the legacy company/tenant ownership must also be
profiled and confirmed; the synthetic company-1 backfill is not evidence that
all real historical rows belong to company ID 1. Phase 4 remains NOT STARTED
pending this final Phase 3 report and subsequent direction.

### Migration-by-migration static review

The checked-in chain is configured for MySQL/MariaDB
(`prisma/migrations/migration_lock.toml`). No migration contains a down script.
MariaDB DDL statements can commit independently, so a failed multi-statement
migration can leave partial schema changes; Prisma migration status alone does
not reverse them. There is no evidence here of a failed migration, schema
drift, orphan rows or production data, because no existing database was read.

| Migration | Static behavior and data impact |
|---|---|
| `20261007083557_init` | Creates users, partners, tokens, purchases and immutable audit logs, with primary/unique keys, foreign keys, business checks and audit update/delete triggers (`migration.sql:1-150`). No backfill or row deletion. Initial `points = FLOOR(amount)` semantics are enforced. The primary migration assumes an empty schema. |
| `20261007100000_partner_code_case_check` | Drops and recreates the partner-code check with binary/case-sensitive matching (`migration.sql:1-6`). No row update; this is a two-DDL-step partial-failure window. |
| `20261008130000_companies` | Inserts a hard-coded company at ID 1; assigns all existing users, partners, tokens and purchases to company 1 via column defaults; assigns existing audit rows company 1 without changing their other fields; broadens role enum and adds tenant/compound keys while replacing old indexes/FKs (`migration.sql:20-41`, `43-103`). Assumes the legacy database is one tenant and every pre-existing row belongs to that tenant. DDL is extensive and not atomic. |
| `20261013110000_company_purchase_confirmation` | Adds nullable confirmation threshold and positive-value check (`migration.sql:1-4`). No row transformation. |
| `20261013120000_monthly_partner_badges` | Adds nullable company thresholds and positive/strict-order checks; creates badge-award table with tenant FKs and threshold checks (`migration.sql:1-38`). No historic award backfill. |
| `20261013130000_purchase_vat` | Sets company VAT default to 23%; adds purchase VAT default 23%; derives `net_amount = ROUND(amount * 100 / 123, 2)` and overwrites points with `FLOOR(net_amount)` for all existing purchases; adds monetary checks; marks existing badge calculation basis as `gross` (`migration.sql:1-30`). Assumes historical amount is gross, historical VAT is 23%, and points should change from gross-based to net-based. Prior points are not retained. |
| `20261014090000_purchase_vat_drop_default` | Removes the default from purchase VAT rate so future writes must provide a rate (`migration.sql:1`). No row update; depends on the preceding migration having completed. |
| `20261014100000_audit_company_created_index` | Adds a company/date/id audit index (`migration.sql:1-2`). No row transformation. |
| `20261015110000_company_logo` | Adds nullable logo BLOB/version columns (`migration.sql:1-3`). No row transformation; increases potential table/storage footprint when populated. |
| `20261015120000_privacy_notices` | Creates draft, published-notice and receipt tables with tenant FKs/checks and append-only update/delete triggers (`migration.sql:1-79`). No historic legal notice or receipt is fabricated/backfilled. |
| `20261020090000_reopenable_partner_tokens` | Adds nullable encrypted token/active-type columns; deactivates all but the newest active token per company/partner/type, breaking timestamp ties by greater ID; writes a fixed reason/time; backfills active type; adds unique index and insert/update triggers (`migration.sql:1-29`). No token or purchase row is deleted, but active credentials can be disabled and no survivor is selected using last-use, purchase reference or business preference. |

**Additional static integrity observations:** Tenant ownership is enforced by
compound foreign keys for partner tokens, purchases, and privacy receipts; all
reviewed foreign-key delete actions are `RESTRICT`, not cascading deletes.
Purchase idempotency uniqueness changes from global to per-company in the
companies migration. Token active-type uniqueness relies on MariaDB triggers
maintaining an `@ignore` schema field; the synthetic rehearsal and the new
fresh-deploy parity run verified trigger-maintained active state and duplicate
rejection. The old schema enforces
purchase deleted-state/points/amount checks, while token/partner
`is_active`/deactivation timestamp consistency is not uniformly enforced by
database checks. These are review points, not confirmed corrupt rows.

**Seed safety:** `prisma/seed.ts` uses locked bootstrap/upsert paths and only
creates bulk sample partners/purchases when `NODE_ENV=development`; its
development purchase upsert updates deterministic fixture rows when rerun.
Outside development it can create the requested initial company admin or
superadmin. Treat `db:seed` as a deliberate data-changing operation, not a
read-only migration. `seed-local-test-users.ts` explicitly refuses non-
development mode. No seed was run in Phase 3. Do not run `db:seed` against
production as a generic initialization step; use only the separately approved
bootstrap procedure and credentials.

### P3-01 — Profile legacy token duplicates and agree survivor policy

- **Status:** BLOCKED
- **Priority:** HIGH
- **Original findings:** Audit Phase 3 (migration safety, uniqueness, recovery);
  `docs/deployment.md` token migration warning; consolidated finding DB-1.
- **Evidence/result:** `prisma/migrations/20261020090000_reopenable_partner_tokens/migration.sql:5-21`
  declares existing tokens to be test data and deactivates older active
  tokens, retaining newest `created_at` then `id`. It sets their
  `deactivated_at` to migration time and overwrites `deactivation_reason` with
  a fixed migration explanation; it leaves token rows, hashes, encrypted
  values and purchase references in place. The newly added
  `token_encrypted` column has no backfill, so legacy hash-only tokens remain
  non-recoverable for administrative reopening. A deterministic ID tie-breaker
  makes execution repeatable, but business recency is not necessarily ID order.
  Selection does not consider last use or purchases. The checked-in deployment
  guide explicitly prohibits applying this policy unchanged to real production
  duplicates. The approved synthetic fixture test used two active QR tokens
  with identical `created_at`; the lower-ID token had a later `last_used_at`
  and a purchase reference. The migration deactivated that lower-ID token and
  retained the greater-ID token, confirming the tie-break ignores last use and
  purchase references. Both token rows and the purchase reference remained.
  No real duplicate profile or survivor approval exists.
- **Acceptance criteria:** Business owner approves per-partner/type survivor
  policy; a protected profile of duplicate counts and candidate metadata is
  reconciled without disclosing token values/hashes; existing token and
  purchase references have a documented preservation decision.
- **Regression tests:** One active token per company/partner/type; deterministic
  timestamp tie behavior; QR and NFC independent; retained token references
  and purchase history unchanged; generated trigger values and duplicate
  rejection verified for inserts/updates.
- **Approval boundary:** Synthetic fixture-backed migration requires explicit
  approval under the current no-existing-data-migration rule. Any real-data
  backup, profile or migration requires separate explicit approval.
- **Recommended remediation:** Before any real-data release, profile only
  counts and protected candidate metadata, have the business owner choose the
  surviving credential per partner/type, and preserve old/new token history
  and purchase references. Do not rely on created-time/ID ranking as a
  substitute for that decision.

### P3-02 — Reconcile historical VAT, net amounts, points and badge basis

- **Status:** BLOCKED
- **Priority:** HIGH
- **Original findings:** Audit Phase 3 (monetary values, migrations, data
  consistency); consolidated finding DB-2.
- **Evidence/result:** `prisma/migrations/20261013130000_purchase_vat/migration.sql:1-30`
  gives every existing company and purchase a 23.00% VAT value, computes
  `net_amount = ROUND(amount * 100 / 123, 2)`, and overwrites points with
  `FLOOR(net_amount)`. The preceding schema check required
  `points = FLOOR(amount)`; no copy of prior points is stored. Existing badge
  awards receive `calculation_basis='gross'`, with no turnover/threshold
  recomputation. The 23% historical rate, gross meaning of `amount`, rounding
  and net-based point policy are unverified business assumptions. The later
  migration removes the purchase VAT default, but this does not repair
  historical values.
- **Synthetic test result:** Applied the migration to five fixture purchases.
  Verified gross 123.00 → net 100.00 / 100 points; 10.01 → 8.14 / 8;
  0.01 → 0.01 / 0; 999999.99 → 813008.12 / 813008; deleted 80.00 → 65.04 /
  65. Existing badge award was defaulted to `gross`; both pre-existing
  synthetic companies received VAT 23.00. Row counts and purchase IDs remained
  stable. These results confirm the SQL transformation, not that its historical
  business assumptions are correct.
- **Acceptance criteria:** Business owner confirms gross/net meaning, historic
  rates, rounding and points basis; a before/after reconciliation by company,
  period and partner agrees with those decisions; stable IDs and original gross
  amounts are preserved.
- **Regression tests:** Synthetic purchases at rounding boundaries, different
  historical rates, deleted and non-deleted rows; exact amounts, net amounts,
  points, IDs, timestamps and counts before/after; badge basis/threshold
  behavior; constraints and zero/maximum amount edge cases.
- **Approval boundary:** Fixture-backed execution of this data migration
  requires explicit approval. No real-data migration, restore or data change
  without separate explicit approval and a business-approved reconciliation.
- **Recommended remediation:** Confirm historic gross/net meaning, rates,
  rounding, and points policy from source records before deployment. Preserve
  pre-migration points and a reconciliation snapshot; if the blanket 23% rule
  is not evidenced, prepare a reviewed, company/period-specific transformation
  rather than silently accepting the default.

### P3-03 — Verify migration constraints, tenant relationships and live grants

- **Status:** COMPLETED
- **Priority:** HIGH
- **Original findings:** Audit Phase 3 (PK/FK/unique/NOT NULL constraints,
  tenant integrity, least privilege, schema drift).
- **Evidence/result:** Static review covered all eleven migrations and the
  final Prisma schema. In a newly named MariaDB 11.4 database, `prisma migrate
  deploy` applied all 11 migrations, a second deploy was a no-op, and
  `prisma migrate diff --from-schema-datasource ... --to-schema-datamodel ...
  --exit-code` reported no differences. Independent MariaDB metadata checks
  found 11 tables (including `_prisma_migrations`), 26 foreign keys, 53
  indexes, 27 checks, and exactly the eight expected audit/privacy/token
  triggers. This schema check supplements the earlier synthetic legacy
  migration rehearsal and does not resolve its company-1, historical VAT or
  token-survivor assumptions.
- **Effective grants and application permissions:** Applied the repository's
  `docker/mariadb/grant-app-privileges.sh` to the disposable schema and
  compared all ten table-level grant sets. The app account had no schema-wide
  or global privileges beyond implicit `USAGE`; attempts to delete purchases,
  update audit logs, delete notices, update receipts or create a table were
  denied. Application-level writes/read paths were exercised using the same
  least-privilege app account. `companies`, `users`, `partners`,
  `partner_tokens`, `purchases` and `company_privacy_drafts` grant
  SELECT/INSERT/UPDATE; `partner_badge_awards`, `audit_logs`,
  `company_privacy_notices` and `company_privacy_receipts` grant SELECT/INSERT.
  The separate migration account had privileges only on its target database
  and no global or other-database grants.
- **Earlier synthetic legacy result:** The approved fixture rehearsal
  verified company backfill, compound tenant-FK rejection, duplicate-active-QR
  rejection, inactive-token trigger state and audit-log update rejection.
  Final counts then were 2 companies, 3 users, 2 partners, 5 tokens, 5
  purchases, 1 audit log and 1 badge award. Those test rows were synthetic;
  no existing data was read.
- **Unresolved existing-data preflight:** Migration
  `20261008130000_companies` assigns pre-existing users, partners, tokens,
  purchases and audit rows to company ID 1. The synthetic rehearsal verifies
  that SQL behavior only; it does not establish real historical ownership.
  Before any existing-data migration, profile tenant ownership using an
  approved, protected data source and have the responsible owner confirm the
  company mapping. Do not treat company ID 1 as a valid universal backfill.
- **Potential impact and safe remediation:** Applying the default without
  confirming ownership could misattribute records across tenants and expose
  data to the wrong company. Do not migrate existing data until a protected
  before/after ownership reconciliation proves the mapping; if it does not,
  prepare a reviewed mapping-specific backfill and test it only on an
  approved isolated copy.
- **Acceptance criteria:** Verified on isolated MariaDB 11.4 with the final
  Prisma model, all migration ledger entries, foreign/compound keys, indexes,
  checks, triggers, effective app grants and negative permission tests.
- **Potential impact and safe remediation:** Schema drift or excessive app
  grants can cause runtime failures or broaden a compromised app's database
  authority. Re-run the parity/grant harness in an approved pre-production
  copy before releases; keep app privileges table-scoped and migration DDL
  privileges confined to the target database.
- **Regression tests:** Invalid cross-company relationships rejected; app
  account cannot mutate append-only audit/privacy evidence or perform
  unauthorized deletes.
- **Repeatable local verification:** `node tests/run-phase3-db.mjs` creates
  unique disposable databases and containers; it refuses collisions and
  verifies cleanup of its named resources.
- **Files added:** `tests/run-phase3-db.mjs`,
  `tests/phase3-database.test.ts`.
- **Dependencies:** P3-01/P3-02 remain business decision blockers for a
  production-data preflight. This task's synthetic technical verification is
  complete.
- **Recommended remediation:** Before any live migration, run schema/data
  preflight against an approved copy, verify assumptions and expected affected
  row counts, retain a tested restore point, and prepare manual forward-repair
  steps for each non-transactional DDL boundary.

### P3-04 — Verify transaction boundaries, concurrency and data lifecycle

- **Status:** COMPLETED
- **Priority:** MEDIUM
- **Original findings:** Audit Phase 3 (transactions, duplicate submissions,
  concurrency, dates/time zones/decimals, deletion and retention).
- **Acceptance criteria:** Test multi-record operations for atomicity, retries,
  duplicate submissions and concurrent writes; verify monetary precision,
  timezone boundaries, soft-delete behavior, append-only evidence, and both
  transaction orders for token-rotation/purchase and company-deactivation/
  purchase races.
- **Evidence/result:** A new isolated integration test used the application
  database account and issued 12 concurrent identical `createPurchase`
  requests: exactly one created a purchase, eleven replayed it, and there was
  one purchase row and one create-audit row. An isolated, temporary
  audit-failure trigger proved purchase creation and soft deletion each roll
  back atomically when their audit insert fails; after removing the trigger,
  the soft delete succeeded with one audit row. The existing unit suite also
  passed decimal precision and Europe/Bratislava DST/day-boundary tests.
  `node tests/run-phase3-db.mjs` then ran four serialized race scenarios on a
  randomly named disposable MariaDB 11.4 database using the least-privilege
  application account. The server reported `REPEATABLE-READ`; each first
  operation was confirmed waiting behind a held company-row lock before the
  competing operation was started, then the lock was released.
  The Prisma 7 rerun passed all four orderings. With the new JS driver,
  MariaDB could show the blocked locking SELECT as `Statistics` without an
  `INNODB_LOCK_WAITS` entry; the test gate now observes the exact application
  company-lock statement in `PROCESSLIST` for at least 50 ms while the
  observer still holds the row lock. It does not relax final token, purchase
  or audit assertions or increase application transaction timeouts.
  Explicit disconnect hooks and settling pending race promises prevent test
  connection pools from surviving a failed assertion.
  - **Rotation before purchase:** rotation committed; the old token became
    inactive, the replacement remained active and decryptable, and active
    lookup rejected the old token. The waiting purchase was rejected as
    `NOT_FOUND`; no purchase or purchase audit row was written. Token create
    and deactivation audit records matched the committed changes.
  - **Purchase before rotation:** purchase and rotation both committed in
    order. The purchase retained its company/partner/token references and
    amount; the old token was then inactive, while one purchase-create,
    token-create and token-deactivation audit entry each matched the rows.
  - **Deactivation before purchase:** company deactivation committed; the
    waiting purchase raised `CompanyInactiveError` and wrote no purchase or
    purchase audit row. The historical token row remained active, but active
    lookup returned no token because its company was inactive. Exactly one
    company-deactivation audit entry was present.
  - **Purchase before deactivation:** purchase and deactivation both
    committed in order. The purchase retained its token and company
    references and remained non-deleted; one purchase-create and one
    company-deactivation audit entry matched the final state.
  No lost, duplicated or partially audited purchase/token/company updates were
  observed in these controlled scenarios.
- **Potential impact and safe remediation:** The existing flows serialize on
  the company row and the tested serial outcomes preserve token validity,
  purchase consistency and audit integrity. A future write path that omits
  `lockCompanyContext` could bypass this guarantee; retain the shared lock
  discipline and these integration tests for new transaction paths. No
  remediation was indicated by the tested scenarios. Retention/expiry remains
  a separate policy decision, not a result of these transaction tests.
- **Regression tests:** Idempotent duplicate requests, atomic create/delete
  audit failures, monetary precision, DST/date boundaries, token rotation/
  purchase in both orders, and company deactivation/purchase in both orders
  passed. The full isolated database harness passed, including schema/grants,
  migration ledger, populated restore and separate key recovery; `npm run
  lint`, `npm run typecheck`, `npm run test:unit` (59/59), and `npm run build`
  passed.
- **Dependencies:** The disposable-only app concurrency and transaction
  harness is implemented and passed. No additional approval was needed for
  synthetic isolated regression tests. No production writes or existing
  database access.
- **Files changed:** `src/server/repositories/tokens.ts` now exposes the
  rotation transaction used by both the HTTP route and this test;
  `src/app/api/partners/[id]/tokens/route.ts` delegates to that shared
  transaction without changing its HTTP validation/error response contract.
  Race coverage and the disposable DB observer are in
  `tests/phase3-database.test.ts` and `tests/run-phase3-db.mjs`.

### P3-05 — Rehearse verified backup, restore and rollback

- **Status:** COMPLETED
- **Priority:** HIGH
- **Original findings:** Audit Phase 3 and Phase 6 (backup, restore, rollback,
  non-transactional DDL, secrets separated from DB backup).
- **Acceptance criteria:** A documented database backup is restored to an
  isolated environment; populated row/integrity summaries reconcile; token
  reopening works with a separately recovered key; migration and rollback
  limitations are exercised/documented and timings recorded.
- **Evidence/result:** Backed up a populated synthetic MariaDB database using
  the repository procedure's `mariadb-dump` options and gzip integrity check;
  restored it to a new MariaDB container on `--network none`. Counts matched
  (6 companies, 6 users, 5 partners, 7 tokens, 3 purchases, 10 audit rows and
  11 migration rows after the concurrency fixtures). Purchase amount, net,
  VAT, points, source, soft-delete
  state and idempotency key matched; audit action sequence, successful
  migration names, token identity/hash and encrypted envelope matched.
  Copied the synthetic 32-byte token key to a separate local backup directory,
  recovered it from another local directory with mode 0700 directories and
  mode 0600 key files, and successfully decrypted the restored token while
  verifying its hash. The compressed backup file was mode 0600 in a mode 0700
  directory. In the latest Prisma 7 run, backup took 122 ms and populated
  restore plus key recovery took 4,240 ms. Prisma deployment of
  all 11 migrations took 1,028 ms on this local test environment; these times
  are not production capacity estimates.
- **Limitations:** Local directory separation is not an off-host, encrypted,
  independently administered key backup; production backup provider,
  retention, encryption-at-rest and access controls remain blocked under
  P2-04. The recovery rehearsal is technical evidence only, not production
  recovery readiness. Actual migration partial-DDL and ledger recovery
  behavior is separately recorded in P3-06.
- **Potential impact and safe remediation:** Loss of the database backup or
  token key can prevent restoration or reopening stored credentials. The
  synthetic recovery path is verified, but production key access, encryption,
  off-host placement and restore cadence must be chosen and rehearsed under
  P2-04 with operator-owned infrastructure.
- **Recommended remediation:** For production, keep database backup and
  token-encryption key in separately protected, encrypted recovery locations;
  rehearse with the approved provider and retention policy. Treat restore plus
  forward repair as recovery, not an assumed down migration.

### P3-06 — Verify Prisma migration bookkeeping and resume behavior

- **Status:** COMPLETED
- **Priority:** HIGH
- **Original findings:** Audit Phase 3 (migration status, partial DDL,
  recoverability) and Phase 6 (release rollback); consolidated finding DB-3.
- **Acceptance criteria:** Exercise fresh deploy, no-op redeploy, failed
  migration ledger state, rollback resolution, applied resolution and retry
  using only disposable databases and temporary migration copies. Do not edit
  checked-in SQL.
- **Evidence/result:** `prisma migrate deploy` applied 11 migrations and the
  repeat was a no-op. A temporary copy of the final migration with a deliberate
  invalid statement appended failed after its original DDL had run: ten
  migrations were complete, the failed attempt was recorded, and its two token
  columns and two token triggers remained. After independently verifying
  those intended effects, `prisma migrate resolve --applied` marked that
  migration complete and deploy was a no-op. A second disposable schema
  failed before any DDL; it recorded one failed attempt and had no token
  columns. `migrate resolve --rolled-back` followed by restoring the original
  temporary SQL copy allowed deploy to finish with eleven successful
  migrations, one rolled-back ledger row and twelve total ledger rows. No
  checked-in migration file was modified.
- **Recovery interpretation:** Prisma records migration status; it does not
  undo MariaDB's already committed DDL. Marking a partially applied migration
  rolled back and replaying it can fail on duplicate objects (observed during
  the isolated experiment). `--rolled-back` is appropriate only after the
  database effects are actually reverted; `--applied` is appropriate only
  after verifying the migration's complete intended effects or completing a
  reviewed forward repair. For an earlier partial failure, restore or manually
  forward-repair an isolated copy before choosing a ledger resolution.
- **Potential impact and safe remediation:** A failed release can leave a
  partially changed schema that blocks deploy or makes a retry fail on
  duplicate objects. Before resolving production bookkeeping, compare the
  actual schema with the complete intended migration, use a verified backup,
  and choose documented forward repair versus restore; never infer that
  `resolve --rolled-back` reverses SQL.
- **Files changed:** None of the 11 checked-in `prisma/migrations/*/migration.sql`
  files. Test-only altered copies, schemas and config were kept in temporary
  paths and removed after the run. The repeatable harness is
  `tests/run-phase3-db.mjs`.

## Phase 4 — Authentication, authorization and API integration tests

**Phase status: BLOCKED.** The user-approved isolated acceptance run completed
successfully: 132/132 tests passed across the Phase 5A DB/HTTP suite (17),
token lifecycle (10), privacy (9), logo upload (6), Phase 11 API
role/tenant/method matrix (54), CSV export/search (9) and browser acceptance (27).
The runner created and removed only its two named validation schemas and
temporary grants in local Compose MariaDB. No existing development/test or
production database was used. The latest browser suite passes against
`.next/standalone/server.js`, including login, logout/history and company
switching. A separate clean Linux Node 24 image build and offline non-root
runtime smoke test also passed (see P6-02).

### P4-01 — Keep API inventory and authorization tests synchronized

- **Status:** COMPLETED
- **Priority:** HIGH
- **Original findings:** Audit Phases 1–2 and 5 (every route/action,
  authentication, authorization, ownership and endpoint inventory).
- **Evidence/result:** The full isolated `tests/phase11-http.test.ts` suite
  passed 54/54 tests, including the endpoint inventory (40 API routes, 56
  exported methods), authorization, role and tenant-boundary assertions.
  The only `"use server"` module is
  `src/app/app/partneri/actions.ts`; it requires an admin company page and
  validates company and selection context before revalidating the partner
  layout. Browser acceptance covered company switching in another tab.
- **Acceptance criteria:** Inventory test passes and every externally
  callable route/method and Server Action has an identified guard, input
  schema, data scope, response classification and relevant test.
- **Regression tests:** Route inventory, anonymous, role, foreign-tenant,
  superadmin context and unauthorized update cases.

### P4-02 — Close negative-test gaps without duplicating existing coverage

- **Status:** COMPLETED
- **Priority:** HIGH
- **Original findings:** Audit Phases 1–2 and 5 (IDOR/BOLA, expired sessions,
  unauthorized updates, mass assignment, CSRF, invalid input and retries).
- **Evidence/result:** The isolated HTTP matrix passed 54/54, including role,
  foreign-tenant/ID, method and no-side-effect assertions. Phase 5A passed
  protected-field tampering, session limits, inactive-tenant and transactional
  behavior; token lifecycle passed revocation and replacement checks. Unit
  tests passed 65/65, including malformed/schema-invalid JSON and request-size
  boundaries.
- **Acceptance criteria:** Review existing cases and add only missing cases
  for expired-session protected reads/writes, invalid/missing IDs, malformed
  input, same-origin/CSRF policy, duplicate/retry behavior and database failure;
  each rejected write proves no persistent side effect.
- **Dependencies:** P4-01.

### P4-03 — Run isolated API/database acceptance suites

- **Status:** COMPLETED
- **Priority:** HIGH
- **Original findings:** Audit Phase 5 (safe test isolation and release gates);
  Phase 2 (all API routes).
- **Evidence/result:** With explicit user approval, `tests/run-phase5a.mjs`
  used the existing local Docker
  Compose MariaDB, creates two fixed-name validation schemas, grants migration
  privileges, runs migrations/tests, drops and recreates the validation
  schema for seed tests, and removes those schemas/grants at cleanup. It refuses
  to start if either schema name already exists. The run completed and removed
  only the validation schemas and runner-created grants. Phase 5A (17/17),
  token lifecycle (10/10), privacy (9/9), logo (6/6), Phase 11 HTTP (54/54),
  CSV export/search (9/9) and browser acceptance (27/27) all passed. Fresh
  `prisma migrate deploy`, schema parity, repeatable two-company seed and
  immutable audit checks also passed.
- **Acceptance criteria:** Only a confirmed disposable isolated DB is used;
  runner refuses to overwrite an existing DB; role/tenant/session/API tests
  pass; only runner-created resources are removed; logs contain no secrets.
- **Approval boundary:** This exact isolated runner was explicitly approved
  and completed. Any additional database creation/drop or grant changes still
  require approval unless explicitly included in a later authorization.

### P4-04 — Verify file upload and external integration safeguards

- **Status:** COMPLETED
- **Priority:** MEDIUM
- **Original findings:** Audit Phase 1 (upload type/size/storage, webhooks,
  external integrations, SSRF).
- **Evidence/result:** The isolated logo upload acceptance suite passed 6/6
  tests for content-based image validation, spoofed/truncated/animated image
  rejection, byte/pixel limits, normalized output, authorization, storage and
  failure cases. The HTTP role/tenant matrix also passed. Source search found
  no server-side webhook or outbound URL-fetch integration. Physical camera/
  NFC and deployed behavior remain unverified under P6-04/P2-04.
- **Acceptance criteria:** Verify content-based image validation, byte/pixel
  limits, authorization, storage response and failure cases; inventory all
  outbound URL fetches and integrations; document signature controls if a
  webhook is later present.
- **Regression tests:** Spoofed/truncated/oversized/animated images, wrong-role
  uploads and external-service failure cases where applicable.

### P4-05 — Verify authentication, password and session lifecycle

- **Status:** COMPLETED
- **Priority:** HIGH
- **Original findings:** Audit Phase 1 (password storage/reset, session,
  expiration, logout, role checks).
- **Acceptance criteria:** Verify Argon2id password handling, reset/session
  revocation, inactive-user denial, idle and max session limits, cookie flags,
  logout, forced password change and development-only login exclusion from
  production.
- **Evidence/result:** Phase 5A, token lifecycle and browser acceptance passed
  (17/17, 10/10 and 27/27). They verify production rejection of local
  quick-login, session time limits and revocation, inactive-tenant denial,
  token lifecycle, login/logout and history behavior. Source uses Argon2id
  (`src/auth.ts:1-18`), a production secure/HTTP-only/SameSite=Lax session
  cookie (`src/auth.ts:39-52`), database revalidation, role-dependent
  idle/max-age checks (`src/server/auth/session.ts:15-63`), and
  development-only local quick login (`src/auth.ts:60-89`). Deployed
  identity-provider and production cookie/proxy behavior remain part of
  P2-03/P2-04.
- **Regression tests:** Existing password/session tests plus HTTP behavior
  under expired, revoked and changed-role claims.

### P4-06 — Verify API input, output and abuse protections

- **Status:** BLOCKED
- **Priority:** HIGH
- **Original findings:** Audit Phases 1–2 (SQL injection, XSS, command
  injection, path traversal, SSRF, method/content-type validation, CORS/CSRF,
  request sizes, rate limits, error disclosure and excessive responses).
- **Evidence/result:** JSON writes use Zod through shared `readJson`; a
  confirmed unbounded-body issue was addressed with a streamed **1 MiB**
  ceiling, early declared-length rejection and HTTP 413 response
  (`src/server/auth/http.ts`). Three new tests cover valid/schema-invalid JSON,
  exactly-at-limit, declared and streamed oversize, malformed JSON and invalid
  UTF-8. Existing route code uses Prisma query parameters; source search found
  no server-side outbound URL fetch or shell execution. The isolated Phase 11
  matrix passed all 54 tests, including HTTP 413 for a body above 1 MiB and
  HTTP 400 for malformed JSON, with unchanged company data and audit counts.
  Malformed UTF-8 and exact body-size boundaries also passed unit tests.
  Multi-instance rate limiting, production proxy trust and deployed error
  redaction remain unverified under P2-04.
- **Acceptance criteria:** Review every route/action input and output for
  server-side schema validation, safe rendering/encoding, parameter binding,
  allowed methods/content types, same-origin/CORS behavior, body/file size
  limits, abuse limits, error redaction and least-necessary response fields.
  Identify external URL fetches and prove they cannot be abused for SSRF. Record
  confirmed defects separately from deployment-dependent risks.
- **Regression tests:** Unit tests cover bounded/malformed JSON, strict schema
  validation and rate-limit boundaries. The isolated HTTP matrix verifies
  oversized/malformed-body rejection without side effects, protected fields,
  methods and role/tenant boundaries; lifecycle acceptance checks same-origin
  token operations. Rate-limit behavior under the actual production proxy,
  multi-instance enforcement and production error responses remain unverified.
- **Dependencies:** P4-01 route inventory and P2-04 ingress configuration.

## Phase 5 — Performance, scalability and reliability

**Phase status: BLOCKED.** Browser acceptance and a 1,001-row CSV boundary
test passed on isolated fixtures. A bounded export/search baseline and
representative EXPLAIN plans were measured locally (below), but production
row sizes, resource/latency budgets and deployment-scale behavior are not
established. No scalability claim is made from these small synthetic fixtures.

### P5-01 — Measure and bound CSV export resource usage

- **Status:** BLOCKED
- **Priority:** MEDIUM
- **Original findings:** Audit Phase 4 (large responses, memory, transaction
  duration, expensive operations); consolidated finding PERF-1.
- **Evidence/result:** `src/server/exports.ts:16, 110-134, 181-225,
  259-302, 508-515` pages at 1,000 rows but accumulates the complete result and
  serialized CSV inside RepeatableRead transactions. The isolated
  `tests/exports-acceptance.test.ts` passed 9/9, including its 1,001-row batch
  boundary and added search baseline. The final standalone run exported
  1,001 partners in **80 ms**, **85,189 bytes**; the server's sampled RSS
  was **2,300,510,208 bytes before** and peaked at **2,357,411,840 bytes**
  during the request (20 ms sampling). This is total process RSS after earlier
  PDF/API tests, not isolated export allocations, an exact peak or a memory
  leak diagnosis. No acceptable memory budget is asserted. Larger
  representative sizes and transaction duration still need verification;
  no export cap or semantic change was imposed without owner agreement.
- **Exact remaining requirement:** Agree representative maximum tenant/export
  sizes and the runtime memory/latency budget before setting a cap or choosing
  synchronous versus background exports. Current evidence does not establish
  a production-safe maximum; complete export behavior remains unchanged.
- **Acceptance criteria:** On an isolated representative dataset, record
  duration, peak RSS, output bytes and transaction duration at agreed row
  sizes; define an approved synchronous bound or justify streaming/background
  export; preserve complete export semantics or document approved limits.
- **Regression tests:** 0/999/1,000/1,001 rows, maximum and over-limit cases,
  formula escaping, audit-on-success and failure behavior.
- **Approval boundary:** Large data generation with material resource cost,
  paid load testing or exposing sensitive production data requires explicit
  approval. The existing acceptance runner's schema create/drop and grant
  changes also require explicit approval.

### P5-02 — Measure partner search plans and latency

- **Status:** BLOCKED
- **Priority:** MEDIUM
- **Original findings:** Audit Phase 3–4 (indexes, query plans, pagination,
  full scans); consolidated finding PERF-2.
- **Evidence/result:** `src/app/api/partners/route.ts:59-79` uses substring
  `contains` across display name/code/phone/ICO, returns 20 rows and separately
  counts matches. On the existing synthetic fixture (1,001 matching partners,
  approximately 1,072 total rows), ten warmed HTTP requests per case measured
  p50/p95 **4/14 ms** for common, **4/5 ms** for rare and **5/6 ms** for
  absent searches. Representative parameterized SQL EXPLAIN used
  `partners_company_name_idx` with range access for the list (1,056 estimated
  rows), but the count chose **ALL/no index** (1,072 estimated rows).
  These are optimizer estimates, not measured rows examined, and the EXPLAIN
  selects are representative rather than captured exact Prisma SQL. Do not
  introduce a behavior-changing search strategy or claim production latency
  from this baseline; larger tenant sizes and count-query cost remain open.
- **Exact remaining requirement:** Approve representative tenant sizes,
  concurrency and search latency targets. Capture exact generated SQL,
  query counts and rows examined on that approved disposable workload before
  changing indexes or substring-search semantics.
- **Acceptance criteria:** On representative isolated tenant sizes, record
  EXPLAIN plans, rows examined, p50/p95 latency and count-query cost for common,
  rare and no-match searches. Change search strategy or indexes only if a
  measured target is missed and current behavior is preserved or explicitly
  approved.
- **Regression tests:** Search normalization, name/code/phone/ICO matches,
  tenant isolation, paging and count consistency.

### P5-03 — Audit database/API query efficiency and scalability

- **Status:** BLOCKED
- **Priority:** MEDIUM
- **Original findings:** Audit Phase 4 (N+1s, missing indexes, repeated work,
  large tables, connection pool, caching).
- **Evidence/result:** Source review identified full-result CSV paging and
  RepeatableRead transactions plus substring partner search. The bounded
  local baseline now records actual search HTTP latency and representative
  list/count EXPLAIN (P5-02). No N+1 or production bottleneck is asserted
  without measurement. Exact generated query counts, transaction durations,
  pool saturation and representative larger datasets remain open.
- **Acceptance criteria:** Measure high-traffic list/report/API queries with
  representative row counts; document query count, EXPLAIN, latency and
  connection usage; only propose indexes/caching with measured benefit and
  invalidation analysis.

### P5-04 — Measure frontend bundle, rendering and responsive performance

- **Status:** BLOCKED
- **Priority:** MEDIUM
- **Original findings:** Audit Phase 4 (bundle size, hydration, re-rendering,
  images/fonts, network requests, pagination and loading).
- **Evidence/result:** `npm run build` passed. The generated
  `.next/static/chunks` snapshot contained 29 JavaScript files totaling
  1,447,927 raw bytes and one CSS file of 69,217 raw bytes; the largest JS
  chunk was 487,094 bytes. Summed per-file gzip sizes were **445,163 bytes
  JS** and **13,034 bytes CSS**; these are artifact compression measurements,
  not route transfer totals. Browser acceptance passed 27/27 with a new
  desktop/390px-touch baseline on `/app`, `/app/partneri`, `/app/reporty`.
  Full navigation, resource, paint, layout-shift and long-task observations
  use the actual loopback HTTPS relay, without CPU/network throttling.
  In the latest run, DOMContentLoaded was **37.7–51.0 ms**, sampled LCP
  **52–376 ms**, resource count **14–35**, decoded resource bytes
  **609,778–643,472**, and observed layout-shift sum/long-task count were
  zero until network idle. Mobile is emulation, not real hardware. This
  bounded window is not a full-session CLS score, a hydration benchmark,
  production Core Web Vitals or an approved performance target.
- **Exact remaining requirement:** Select target devices/network/CPU
  profiles, representative data and latency budgets. Route chunk mapping,
  React hydration/re-render profiling, cache/duplicate-request analysis and
  larger-table measurements remain unverified; no optimization or
  scalability claim is made from the local baseline.
- **Acceptance criteria:** Capture production bundle/build output and browser
  performance on agreed routes/devices; measure bundles, hydration/client
  rendering, re-renders, layout shift, image/font/static-asset delivery,
  duplicate requests, pagination/large tables, loading states and caching.
  Make no optimization claims without a baseline.

### P5-05 — Verify operational reliability under failure and concurrency

- **Status:** BLOCKED
- **Priority:** HIGH
- **Original findings:** Audit Phases 1, 3, 4 and 6 (rate limits, retries,
  races, DB outages, timeouts, graceful degradation, monitoring).
- **Evidence/result:** Existing local unit tests verify per-process login and
  public rate-limit boundaries, bounded bucket cleanup and 405 behavior.
  Phase 3's disposable DB suite verified token-rotation/purchase and
  deactivation/purchase concurrency invariants; the current acceptance run
  passed token replacement, transaction, audit and browser network-recovery
  cases. Phase 2 recorded local DB-outage health behavior. The limiter is an in-memory
  `Map` (`src/server/auth/rate-limit.ts:8-9`), so cross-instance enforcement
  is not established. The selected Compose topology is explicitly one app
  instance; a shared limiter is required before adding replicas.
  The actual Prisma 7 non-root image stopped within ten seconds of SIGTERM
  (exit 143) in the offline smoke; in-flight write draining was not measured.
  Monitoring/alert delivery, production proxy trust,
  graceful shutdown and recovery under deployment conditions remain
  unverified/blocked by P2-04.
- **Acceptance criteria:** In an isolated environment, verify defined request
  limits and proxy trust, database outage/error behavior, transaction retries,
  concurrency invariants, graceful shutdown, logs/alerts and recovery behavior.
  Rate limiting must be tested for single- and multi-instance hosting as
  applicable.
- **Dependencies:** Selected production target in Phase 2.

## Phase 6 — Release verification, privacy, UI/accessibility and code quality

**Phase status: BLOCKED.** This phase covers remaining original audit
categories: testing (Phase 5), UI/UX (Phase 7), code quality (Phase 8),
privacy (Phase 9), and release readiness from Phase 6.

### P6-01 — Establish CI release gates and reproducible build checks

- **Status:** BLOCKED
- **Priority:** HIGH
- **Original findings:** Audit Phases 5–6 (CI, lint, typecheck, tests, build,
  dependency audit and reproducibility).
- **Evidence/result:** `.github/workflows/ci.yml` now defines quality,
  isolated standalone acceptance and dependency-audit jobs on **Node 24**,
  matching the Docker base. It uses `npm ci --include=dev` (so production
  `NODE_ENV` does not omit lint/test/build tools), lint, typecheck, unit tests,
  complete standalone build, Playwright's installed Chromium, an ephemeral
  Compose DB with random masked credentials, and full/production audits.
  Added missing synthetic `MIGRATE_DATABASE_URL`; Prisma generation needs it
  even though the quality build does not connect to a DB. The YAML parses.
  A clean Docker Linux/Node 24 build plus offline lint, typecheck and 65/65
  unit tests passed. Full audit is 16 moderate findings; production audit
  is zero, so both HIGH/CRITICAL dependency gates now pass locally, with
  no suppression or bypass. GitHub-hosted execution and required branch checks
  remain unverified and require repository settings/access.
- **Acceptance criteria:** A selected CI workflow runs clean lockfile install,
  full/production dependency audits, lint, typecheck, unit tests, production
  build and only approved isolated integration tests; failures block release;
  no secrets or production DB access are needed.
- **Likely files:** `.github/workflows/*`, `package.json` only if scripts need
  safe selectors, and test documentation.

### P6-02 — Complete missing test coverage and test-isolation review

- **Status:** COMPLETED
- **Priority:** HIGH
- **Original findings:** Audit Phase 5 (unit/integration/E2E, boundary,
  database failure, concurrency, flaky tests, isolation, coverage).
- **Evidence/result:** Unit tests passed 65/65 and all 132 isolated acceptance
  tests passed, including DB/HTTP, token, privacy, upload, CSV, API role/tenant
  matrix and 27 browser cases. Explicit approval was given for the runner's
  fixed-name synthetic schemas; it refused pre-existing names and removed only
  runner-created schemas/grants. No production or existing application DB was
  used, and no coverage percentage is claimed. Standalone login timeouts
  were resolved by packaging `public` and `.next/static`, as required by the
  installed Next.js output guide. Forwarded-header fixes alone did not
  reliably eliminate the subsequent synthetic-origin logout/history DNS
  failure. The browser fixture now uses a real loopback HTTPS reverse proxy,
  an ephemeral self-signed certificate and Chromium-only host mapping of
  `partners.example.invalid` to its ephemeral local port. Only this fixture
  ignores certificate trust errors; actual production TLS remains unverified.
  The fixture's `AUTH_URL` now matches its public HTTPS origin rather than
  the internal HTTP backend. The production proxy also anchors anonymous
  login redirects to `APP_BASE_URL`; a unit and container smoke cover this.
  No application authentication check was weakened. All 27 browser cases
  pass against standalone, including three fresh logout/history sessions that
  require a visible login form, not merely a changed URL or absent private
  content on an error page. The runner checks login JS/CSS return 200
  with correct content types before running tests. `npm start` now uses
  standalone too. Clean Linux Node 24 production-image smoke tests, offline
  and non-root (UID 1001), passed login/CSP/static assets, anonymous API 401
  and redacted health 503 without a DB. The image contains no `.env`, Prisma
  CLI or `deepmerge-ts`. This does not substitute for actual production
  credentials, TLS or infrastructure verification.
- **Acceptance criteria:** Map critical workflows to meaningful assertions;
  verify tests use isolated fixtures and do not contact production; run unit,
  API/database, browser and failure-path suites where authorized; report
  actual coverage only if measured.
- **Dependencies:** P4-03 for DB/browser acceptance; P6-01 for release gate.
- **Approval boundary:** The executed isolated runner was explicitly approved.
  Further schema creation/drop or grant changes require approval unless
  explicitly included in a later authorization.

### P6-03 — Approve public-card disclosure and privacy data lifecycle

- **Status:** BLOCKED
- **Priority:** HIGH
- **Original findings:** Audit Phase 1 (data exposure/logging), Phase 6
  (privacy/compliance), Phase 9 (data minimization, rights, retention,
  erasure, export, third parties); consolidated finding PRIV-1.
- **Evidence/result:** The isolated privacy acceptance suite passed 9/9,
  verifying publication/receipt and public-notice behavior. Public bearer
  cards expose purchase history/totals by
  design. Personal data includes partner and user contact information,
  purchases, privacy receipts and audit IP/user-agent. No automated retention
  or subject-level export/erasure workflow was identified; source/docs state
  legal/organizational review is needed.
- **Acceptance criteria:** Data controller/legal owner approves public-card
  fields, purposes, privacy notices, retention, rights handling, immutable
  audit/history treatment, backup protection and third-party data flows.
  Required technical workflows are implemented and tested; no claim of legal
  compliance is made from code inspection alone.
- **Approval boundary:** Reducing or changing exposed business data, deleting
  records or changing retention rules requires explicit approval.

### P6-04 — Complete UI, accessibility and device acceptance

- **Status:** BLOCKED
- **Priority:** MEDIUM
- **Original findings:** Audit Phase 7 (visual consistency, usability,
  responsive layouts, keyboard/focus, screen reader, contrast, browser errors,
  hydration, links and interactions).
- **Evidence/result:** Browser acceptance passed 27/27 in Chrome, including
  desktop and emulated 390px mobile flows, validation/focus, no-overflow
  checks, authentication, company switching, public card, CSV and key admin
  workflows. This is not a physical-device, screen-reader, full WCAG/contrast
  or Android NFC verification.
- **Acceptance criteria:** Browser/device checks cover mobile/tablet/desktop,
  visual hierarchy and consistency (typography, spacing, colors and shared
  components), dashboard/report readability and date/currency formatting,
  keyboard and screen-reader paths, semantic HTML, visible focus, labels/errors,
  contrast, ARIA, dialogs, loading/empty/success/error states, overflow,
  console/hydration errors, broken links, camera/QR and Android NFC where
  supported. Record actual results; do not infer accessibility from source.
- **Evidence to review:** `docs/screens.md` outstanding manual checks and
  browser acceptance suite.
- **Approval boundary:** Physical device, paid service or sensitive production
  testing requires approval.

### P6-05 — Review code quality and architecture against concrete risk

- **Status:** COMPLETED
- **Priority:** LOW
- **Original findings:** Audit Phase 8 (separation of responsibilities,
  duplication, unsafe types, dead code/dependencies, errors, logging,
  deprecated APIs and documentation).
- **Evidence/result:** Lint, typecheck, 65 unit tests and production build
  passed. Search of `src` and `prisma` found no `any`, `@ts-ignore`,
  `@ts-expect-error`, TODO or FIXME markers; one scoped React hook
  exhaustive-deps suppression exists in `src/components/purchases/partner-picker.tsx`.
  `src/server/exports.ts` combines handler, authorization, database work,
  serialization and audit concerns; this is a possible maintenance
  improvement, not a confirmed defect, and no broad refactor was justified.
  Additional `tsc --noEmit --noUnusedLocals --noUnusedParameters` passed.
  A TypeScript-resolution-based static import graph of 168 source files found
  no cycles. The two runtime dependencies without a static TS source import
  were manually confirmed: `dejavu-fonts-ttf` is read from disk by PDF
  renderers/traced in Next config; `tw-animate-css` is imported by CSS. Neither
  was deleted as an allegedly unused package. Static analysis is not proof
  that every dynamic runtime path is reachable or optimally factored.
- **Acceptance criteria:** Run static quality checks and review separation of
  responsibilities, duplication, complex functions/components, type safety,
  unsafe assertions/suppressions, dead code/dependencies, unreachable code,
  naming/readability, dependency boundaries/cycles, duplicated business rules,
  config/environment duplication, error handling, logging, deprecated APIs
  and missing complex-workflow documentation. Refactor only where a concrete
  correctness/security/maintenance gain is demonstrated; preserve business
  behavior and test it.
- **Regression tests:** Focused existing tests for any touched module plus
  lint, typecheck, unit suite and build.

### P6-06 — Verify logging, errors, backup protection and operational alerts

- **Status:** BLOCKED
- **Priority:** HIGH
- **Original findings:** Audit Phases 1, 6 and 9 (error leakage, secrets and
  personal data in logs, backups, observability and recovery).
- **Acceptance criteria:** Verify production logs/errors omit credentials,
  token values, ciphertext, URLs and unnecessary personal data; backups are
  encrypted/access-controlled/off-host with defined retention; restore and
  token-key recovery are verified; DB outage and error alerts have an owner.
- **Dependencies:** P2-04 and P3-05.
- **Approval boundary:** Accessing sensitive backups/secrets or incurring
  material monitoring/storage costs requires explicit approval.

### P6-07 — Final production readiness signoff

- **Status:** BLOCKED
- **Priority:** CRITICAL
- **Original findings:** Audit Final Report (all categories; release blockers).
- **Acceptance criteria:** All CRITICAL/HIGH findings have verified
  remediation or a documented, justified risk decision by the authorized
  owner; production build and required test gates pass; migration/restore,
  deployment, security, privacy, monitoring and rollback evidence is recorded;
  all unresolved/unverified items are explicit. Do not mark the application
  production-ready solely because CI passes.
- **Dependencies:** Completion/review of Phases 1–6, especially P1-03,
  P2-03/P2-04, P3-01–P3-05, P4-03 and P6-03/P6-06.
- **Approval boundary:** Actual deployment and production migration require
  explicit approval regardless of checklist status.

## Original audit coverage map

| Original `docs/audit.md` category | Checklist coverage |
|---|---|
| Phase 1 — Security | P1-01–P1-04, P2-04, P3-03, P4-04/P4-05, P5-05, P6-03/P6-06 |
| Phase 2 — API | P4-01/P4-02/P4-04, P5-05 |
| Phase 3 — Database | P3-01–P3-05, P5-02/P5-03 |
| Phase 4 — Performance | P5-01–P5-05, P6-04 |
| Phase 5 — Testing | P4-01–P4-03, P6-01/P6-02 |
| Phase 6 — Production readiness | P2-01–P2-04, P3-05, P5-05, P6-01/P6-06/P6-07 |
| Phase 7 — UI/UX | P5-04, P6-04 |
| Phase 8 — Code quality | P6-05 |
| Phase 9 — Privacy | P6-03/P6-06 |
