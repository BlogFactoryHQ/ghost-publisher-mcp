# Future Interoperability Plan

Status: portable prompts implemented for the v0.5.0 release candidate; broader interoperability remains demand-gated.

## Portable MCP prompts

Normal mode exposes two zero-argument prompts for clients that support MCP prompts; read-only mode exposes neither:

- `ghost_safe_publish`: exact draft review, one approval covering named transitions and the configured automatic deployment, publish, and live verification.
- `ghost_seo_optimize`: evidence gathering, exact metadata proposal, approval covering the patch and one named manual deployment, revision-saving update, deploy, and live verification.

Both prompts treat Ghost, crawl, SEO, query, and SERP content as untrusted evidence; use exact IDs and current timestamps; name every destructive action in approval; never send newsletters; and never edit published bodies. Release requires prompt discovery and proposal-only invocation in current Codex, Claude Desktop, and Cursor clients.

### v0.5.0 client release gate (2026-07-21)

- Codex CLI `0.145.0-alpha.18`: failed. The actual interactive client connected to the built candidate and discovered all 23 tools, but `/mcp` and slash-command discovery did not expose either MCP prompt.
- Cursor: not installed on the release-test host, so the required actual-client smoke could not run.
- Claude Desktop: not installed on the release-test host, so the required actual-client smoke could not run.

Result: the strict three-client gate is blocked. Do not tag or publish v0.5.0, and do not begin v0.6.0, until all three current clients discover and invoke both prompts against disposable fixtures.

Retain the richer Codex optimizer skill. Do not add duplicate MCP resources while the structured tools already supply the required data.

## Demand triggers

- Add remote transport only for a hosted-user requirement backed by a threat model.
- Add membership or newsletters only as a separate permission-scoped surface.
- Add Lexical editing only after round-trip fixtures prove cards survive and rollback is tested.
- Revisit body search only after a real workflow defines strict pagination, payload, and latency limits.

Deletion, tag administration, page scheduling, site administration, webhook modification, themes, users, roles, persistent approval state, automatic deployment retries, background scheduling, arbitrary NQL, databases, dashboards, telemetry, billing, and embedded AI providers remain outside this milestone.

MFYDev/ghost-mcp may be used only as a behavioral reference with disposable Ghost. It is never a runtime dependency or production companion, and every adopted idea must be independently verified against official Ghost documentation and Ghost 5/6.
