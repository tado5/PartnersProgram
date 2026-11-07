<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## User manual maintenance

When adding or changing user-visible logic, permissions, settings, navigation
or workflows, update the in-app user manual in `src/lib/manual.ts` in the same
change. Review every affected role (superadmin, company admin and seller),
including shared guides and role-specific exceptions. Keep instructions,
button labels, prerequisites, results and warnings consistent with the actual
application; do not document planned features as available.

Update manual navigation and role-access tests when coverage or permissions
change. Include relevant browser coverage for changed workflows. A change to
user-facing behavior is not complete until its affected guides are updated,
or the handoff explicitly explains why no manual update is needed.
