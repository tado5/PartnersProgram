# Application Production Readiness Audit

## Purpose
Comprehensive audit of the application before production release.

## General Rules
- Inspect the actual repository before making assumptions.
- Do not modify any files during the audit phase.
- Do not fix issues without explicit approval.
- Support findings with evidence and file locations.
- Never claim a check passed unless it was actually performed.
- Distinguish confirmed vulnerabilities from potential risks.
- Do not expose secrets in audit reports.
- Do not run destructive commands or modify production data.

---

# Phase 1: Security Audit

Perform a comprehensive security audit of this entire web application before production release.

Tech stack: inspect the actual repository and identify the frameworks, backend, database, authentication system, deployment configuration, and external integrations before starting.

IMPORTANT RULES:

* Audit the existing implementation. Do not assume how the application works.
* Do not modify any files during this audit.
* Do not fix issues yet.
* Do not expose secrets or print actual credentials, tokens, or API keys in the report.
* Support every finding with file paths, relevant code locations, and a clear explanation.
* Distinguish confirmed vulnerabilities from potential risks that require further verification.

Audit the following areas:

1. Authentication and authorization

* Verify that protected pages, API routes, server actions, and backend operations enforce authentication where required.
* Verify authorization on the server, not only in the frontend.
* Check for insecure direct object references (IDOR/BOLA).
* Verify that users cannot access or modify another user’s data by changing IDs or request parameters.
* Inspect session management, cookie settings, token validation, expiration, and logout behavior.
* Check password storage and password-reset flows if applicable.
* Verify role-based and permission-based access control.

2. Input validation and injection

* Check for SQL injection and unsafe database queries.
* Check for XSS, including stored and reflected XSS.
* Check for command injection, path traversal, and unsafe file handling.
* Check server-side validation of all untrusted inputs.
* Check whether user-controlled data is safely rendered and processed.
* Inspect URL fetching and external resource handling for SSRF risks where applicable.

3. API and server security

* Check whether sensitive endpoints are publicly accessible.
* Check HTTP method and content-type validation.
* Check rate limiting and abuse protection for sensitive endpoints.
* Inspect CORS and CSRF protections where applicable.
* Check request size limits and resource-exhaustion risks.
* Verify that errors do not reveal stack traces, database details, secrets, or internal implementation information.
* Check for mass-assignment vulnerabilities and unauthorized field updates.

4. Database security and data integrity

* Verify least-privilege database access.
* Check parameterized queries and transaction boundaries.
* Check whether sensitive information is unnecessarily stored or returned.
* Inspect database migrations and initialization scripts for production risks.
* Check data ownership constraints and tenant isolation where applicable.
* Verify that deletion and update operations cannot affect unrelated records.

5. Secrets and configuration

* Inspect environment variable handling.
* Check for hardcoded credentials, tokens, API keys, and private configuration.
* Verify that secrets cannot be exposed through client-side bundles, public environment variables, logs, or API responses.
* Check debug mode and development-only endpoints.
* Review production security headers and HTTPS-related configuration.
* Check dependency vulnerabilities using the package manager’s supported audit tools where available.

6. File uploads and external integrations

* If uploads exist, inspect file type validation, size limits, storage permissions, and access controls.
* Check webhook signature validation if webhooks exist.
* Review external API authentication and handling of untrusted responses.

7. Privacy and sensitive data

* Check for excessive personal-data collection and exposure.
* Inspect logging for personal information, credentials, and sensitive payloads.
* Check whether API responses reveal unnecessary fields.
* Identify relevant data-retention and deletion risks.

8. Business logic security

* Identify workflows that can be bypassed by directly calling APIs.
* Check whether important state transitions and calculations are enforced on the server.
* Verify ownership and permission checks on every sensitive operation.
* Identify race conditions that could cause duplicate operations or inconsistent data.

OUTPUT FORMAT:

A. Executive summary and overall risk assessment.

B. Findings table containing:

* ID
* Severity: Critical / High / Medium / Low / Informational
* Category
* File and code location
* Evidence
* Impact
* Reproduction or verification steps, where safe
* Recommended remediation

C. List of areas that could not be verified.

D. Prioritized remediation plan.

E. Production release blockers.

F. Security tests that should be added.

Do not modify code. Finish the report and wait for my approval before implementing any fixes.

# Phase 2: API Audit

Audit all API routes, backend endpoints, server actions, and other externally callable operations in this application.

Do not modify code.

For every endpoint or operation, identify:

* HTTP method or invocation mechanism.
* Authentication requirements.
* Authorization and resource ownership checks.
* Input validation.
* Output data and potential sensitive-data exposure.
* Database operations and side effects.
* Error handling.
* Rate limiting requirements.
* Relevant tests.

Check specifically for:

* Unauthenticated access to protected operations.
* Missing object-level authorization.
* IDOR/BOLA vulnerabilities.
* Unauthorized updates to protected fields.
* Missing server-side validation.
* Mass assignment.
* SQL injection.
* Insecure file operations.
* CSRF risks where applicable.
* Missing rate limits on expensive or sensitive operations.
* Excessive API responses.
* Inconsistent error responses.
* Duplicate requests and unsafe retries.
* Race conditions and invalid state transitions.

Create an endpoint inventory and classify findings by severity.

For sensitive endpoints, recommend negative tests proving that unauthorized users cannot read or modify data.

Do not send destructive requests to production systems. Do not assume that frontend restrictions provide backend security.

Wait for approval before changing any files.

# Phase 3: Database Audit

Perform a comprehensive database audit of this application.

Inspect the database schema, migrations, ORM configuration, queries, transactions, and data-access layer.

Do not modify the database or application files.

Check:

1. Schema integrity

* Verify primary keys, foreign keys, unique constraints, and NOT NULL constraints.
* Identify missing constraints that allow invalid or duplicate data.
* Check relationships between entities.
* Inspect cascade delete and update behavior.
* Identify orphaned records and inconsistent relationships.

2. Query safety

* Verify that queries safely handle untrusted input.
* Check for SQL injection risks.
* Identify unsafe raw SQL and dynamically constructed queries.
* Verify correct parameter binding.

3. Transactions and concurrency

* Check operations that update multiple related records.
* Verify that transactions are used where atomicity is required.
* Identify race conditions and lost-update risks.
* Check duplicate-submission scenarios.
* Review locking and isolation requirements where relevant.

4. Performance and scalability

* Identify missing or redundant indexes.
* Inspect frequently executed queries.
* Check N+1 patterns and inefficient pagination.
* Identify expensive joins and unnecessary data retrieval.
* Recommend EXPLAIN-based verification for important queries.

5. Migrations and recovery

* Check whether migrations can be applied reliably to an existing database.
* Identify destructive migrations and data-loss risks.
* Check schema consistency between development, test, and production.
* Review seed scripts and whether they can overwrite existing data.
* Verify that database recovery and backup procedures are documented.

6. Data lifecycle

* Check deletion, retention, and update behavior.
* Verify uniqueness rules and data ownership.
* Identify inconsistent handling of dates, time zones, decimal values, and monetary amounts.
* Check whether sensitive information is unnecessarily stored.

OUTPUT:

* Findings ranked by severity.
* Relevant schema, migration, and query locations.
* Concrete evidence and potential impact.
* Recommended fixes.
* Database migration and recovery risks.
* Tests needed to verify data integrity.

Do not execute destructive SQL, modify production data, or apply migrations during this audit. Wait for approval before implementing changes.

# Phase 4: Performance Audit

Perform a comprehensive performance audit of this web application.

First inspect the repository to understand the actual architecture, framework, database, API design, and deployment setup.

Do not modify files during the audit.

Audit these areas:

1. Frontend performance

* Identify unnecessarily large JavaScript bundles and dependencies.
* Check for unnecessary client-side rendering and hydration.
* Identify components that re-render excessively.
* Check image optimization, font loading, and static asset delivery.
* Identify unnecessary network requests and duplicate API calls.
* Check pagination, filtering, search, and large table rendering.
* Check loading states and perceived performance.
* Identify opportunities for lazy loading and code splitting.

2. Backend and API performance

* Identify slow or inefficient API handlers.
* Check for sequential requests that could safely run in parallel.
* Check for repeated calculations and unnecessary processing.
* Identify missing pagination and request limits.
* Inspect caching opportunities and cache invalidation risks.
* Check whether expensive operations block normal requests.
* Identify potential memory leaks or unbounded resource usage.

3. Database performance

* Inspect queries and identify likely full-table scans.
* Check indexes against actual WHERE, JOIN, ORDER BY, and pagination patterns.
* Identify N+1 query patterns.
* Check for unnecessary queries and repeated database lookups.
* Review transaction duration and connection-pool configuration.
* Identify inefficient filtering or sorting performed in application code.
* Evaluate pagination strategies for large datasets.
* Recommend EXPLAIN or EXPLAIN ANALYZE where supported and appropriate.

4. Scalability

* Identify bottlenecks as the number of users and records grows.
* Check concurrency and race conditions.
* Inspect connection handling and background tasks.
* Identify memory, CPU, and database connection limits.
* Distinguish current bottlenecks from theoretical future risks.

5. Measurement and verification

* Run existing performance tests if available.
* Inspect existing build and bundle analysis capabilities.
* Recommend representative load tests without overwhelming production systems.
* Define measurable performance targets based on the application’s actual requirements.
* Do not invent benchmark results or claim performance improvements without measurements.

OUTPUT:

* Executive summary.
* Findings ranked by severity and expected impact.
* Exact file paths and relevant code locations.
* Evidence and measurement method.
* Recommended fixes.
* Suggested database indexes, with justification.
* Proposed performance test plan.
* Prioritized improvements offering the highest expected benefit.

Do not make any changes until I approve the findings.

# Phase 5: Testing Audit

Perform a comprehensive testing audit of the application before production release.

Inspect the existing test suites, test configuration, CI workflows, and critical application workflows.

Do not modify files during this audit.

Evaluate:

1. Unit tests

* Business logic and calculations.
* Validation rules.
* Utility functions.
* Permission checks.
* Error-handling branches.

2. Integration tests

* API endpoints.
* Database operations.
* Transactions.
* Authentication and authorization.
* External service failure handling.

3. End-to-end tests

* Main user journeys.
* Form submission and validation.
* Create, read, update, and delete workflows.
* Search, filtering, sorting, and pagination.
* Login, logout, and permission restrictions.
* Error states and recovery.

4. Negative and edge-case tests

* Empty or malformed input.
* Missing and invalid identifiers.
* Unauthorized access.
* Duplicate submissions.
* Concurrent updates.
* Large datasets.
* Expired sessions.
* Database and external API failures.

5. Test quality

* Identify flaky tests and excessive mocking.
* Verify that tests actually assert meaningful outcomes.
* Check that test data is isolated and cleaned up.
* Ensure tests cannot accidentally modify production data.
* Identify critical workflows without automated coverage.

6. Release verification

* Review linting, type checking, build validation, and CI checks.
* Determine which checks must pass before deployment.
* Recommend a practical regression suite.

OUTPUT:

* Existing test coverage and its limitations.
* Missing critical tests.
* Prioritized test plan.
* Exact files to create or modify in a later implementation phase.
* Recommended release-gating checks.

Do not invent coverage percentages. Use actual coverage reports if available. Do not modify files until approved.

# Phase 6: Production Readiness Audit

Perform a production-readiness audit of this entire application.

Inspect the actual repository, build scripts, environment configuration, deployment files, database setup, logging, and operational documentation.

Do not modify files or deploy anything.

Check:

1. Build and configuration

* Verify that a clean production build succeeds.
* Check environment variables and required configuration.
* Identify development-only settings and debug endpoints.
* Verify that secrets are not exposed to the client.
* Check dependency versions and known vulnerabilities.
* Review lockfiles and reproducibility of installation.

2. Deployment

* Inspect the production start command and runtime configuration.
* Check HTTPS enforcement and security headers.
* Review reverse-proxy and trusted-proxy configuration where applicable.
* Verify process restart behavior and graceful shutdown.
* Check health and readiness endpoints.
* Identify missing deployment and rollback procedures.

3. Database operations

* Review migration strategy.
* Verify that application startup does not unexpectedly reset or reseed production data.
* Check connection-pool configuration.
* Review backup and restore procedures.
* Identify risks associated with schema changes and application rollback.

4. Monitoring and reliability

* Check structured logging and log levels.
* Verify that sensitive data is not written to logs.
* Identify missing error monitoring and operational alerts.
* Check handling of database outages and external service failures.
* Review timeout, retry, and graceful-degradation behavior.

5. Recovery and maintenance

* Determine whether backups are documented and restorable.
* Check dependency-update practices.
* Review operational documentation.
* Identify single points of failure relevant to the actual deployment architecture.

6. Privacy and compliance

* Identify personal-data processing and unnecessary retention.
* Check privacy-related configuration and deletion workflows.
* Flag GDPR obligations that require legal or organizational verification rather than claiming compliance based on code inspection alone.

OUTPUT:

* Production readiness scorecard with evidence for each assessment.
* Release blockers.
* High-risk operational gaps.
* Required configuration changes.
* Backup and recovery recommendations.
* Final pre-deployment checklist.

Clearly distinguish verified facts from assumptions. Do not claim that the application is production-ready unless the relevant checks have actually been performed.

Wait for approval before making changes or deploying.

# Phase 7: UI/UX Audit

Perform a comprehensive UI/UX audit of this application.

Inspect the actual pages, reusable components, forms, tables, dashboards, navigation, and responsive layouts.

Do not redesign or modify files during this audit.

Evaluate:

1. Visual consistency

* Typography, spacing, colors, borders, shadows, and component consistency.
* Consistent use of design tokens and shared components.
* Alignment, hierarchy, readability, and visual clutter.

2. Usability

* Navigation clarity.
* Form labels, validation messages, and error recovery.
* Clear confirmation and feedback after user actions.
* Loading, empty, success, and failure states.
* Appropriate confirmation for destructive actions.
* Search, filtering, sorting, and pagination usability.

3. Responsive design

* Mobile, tablet, laptop, and large-screen layouts.
* Overflowing tables and containers.
* Navigation behavior on smaller screens.
* Touch target sizes and form usability.

4. Accessibility

* Semantic HTML.
* Keyboard navigation and visible focus states.
* Form labels and accessible error messages.
* Color contrast.
* Appropriate ARIA usage.
* Screen-reader support for interactive components.

5. Dashboard and reporting

* Information hierarchy.
* Data readability.
* Consistent date, currency, and number formatting.
* Clear differentiation between critical and informational states.
* Useful handling of empty or incomplete datasets.

6. Technical quality

* Browser console errors and warnings.
* Hydration problems if applicable.
* Duplicate or inconsistent components.
* Layout shifts and unnecessary rendering.
* Broken links and invalid interactions.

OUTPUT:

* Findings grouped by severity and user impact.
* Page or component locations.
* Recommended improvements.
* A prioritized redesign backlog.

Do not change the design or implementation until I approve the findings.

# Phase 8: Code Quality Audit

Perform a maintainability and code-quality audit of the entire repository.

Do not modify files.

Inspect:

* Project architecture and separation of responsibilities.
* Duplicated code and duplicated business logic.
* Oversized components and overly complex functions.
* Type safety and unsafe type assertions.
* Use of any, ignored compiler errors, and suppressed lint rules.
* Dead code, unused dependencies, and unreachable branches.
* Inconsistent error handling.
* Naming conventions and code readability.
* Dependency boundaries and circular dependencies.
* Business logic duplicated between frontend and backend.
* Configuration duplication and environment handling.
* Logging quality and observability.
* Missing documentation for complex workflows.
* Deprecated APIs and unnecessary abstractions.

Run existing lint, type-check, and build commands if safe and available.

Do not treat every stylistic preference as a defect. Prioritize issues by correctness, security, maintainability, and practical impact.

OUTPUT:

* Critical structural problems.
* High-value refactoring opportunities.
* Dead code and dependency findings supported by evidence.
* Suggested improvements ranked by expected benefit and risk.
* A minimal, incremental refactoring plan.

Do not perform a large rewrite. Wait for approval before changing code.

# Phase 9: Privacy Audit

Review this application for personal-data protection and privacy risks.

Do not modify code.

Identify:

* Categories of personal data stored or processed.
* Where personal data is collected, stored, transmitted, logged, and displayed.
* Whether API responses expose unnecessary personal information.
* Whether access controls adequately protect customer records.
* Whether personal data appears in URLs, logs, analytics, or error messages.
* Whether data deletion, correction, export, and retention workflows are implemented where required.
* Whether third-party integrations receive personal data.
* Whether database backups and uploaded files require additional protection.
* Whether the application provides appropriate privacy information and consent mechanisms where legally required.

Produce a technical findings report and a list of issues requiring legal or organizational review.

Do not claim GDPR compliance based on code inspection alone. Distinguish technical findings from legal obligations that require further verification.


---

# Final Report

The audit report must contain:

1. Executive summary.
2. Critical and high-severity findings.
3. Medium- and low-severity findings.
4. Findings grouped by audit category.
5. Duplicate findings and their relationships.
6. Production release blockers.
7. Recommended remediation order.
8. Missing tests and verification steps.
9. Items that could not be verified.
10. Final readiness assessment.