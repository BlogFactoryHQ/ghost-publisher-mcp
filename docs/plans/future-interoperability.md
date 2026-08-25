# Future Interoperability Plan

Status: portable prompts and the balanced client gate shipped in v0.5.0; broader interoperability remains demand-gated.

## Portable MCP prompts

Publisher mode exposes two write-oriented zero-argument prompts, while every profile exposes the read-oriented Publication Doctor prompt:

- `ghost_safe_publish`: exact draft review, one approval covering named transitions and the configured automatic deployment, publish, and live verification.
- `ghost_seo_optimize`: evidence gathering, exact metadata proposal, approval covering the patch and one named manual deployment, revision-saving update, deploy, and live verification.
- `ghost_publication_doctor`: bounded exact-record and public-surface diagnosis; read-only mode stops before remediation.

Both prompts treat Ghost, crawl, SEO, query, and SERP content as untrusted evidence; use exact IDs and current timestamps; name every destructive action in approval; never send newsletters; and never edit published bodies.

### v0.5.0 client release gate (passed 2026-08-02)

- Automated MCP SDK tests must discover all 23 normal tools, all nine read-only tools, and invoke both zero-argument prompts without performing a write.
- Disposable Ghost 5 and Ghost 6 integration tests, the package checks, audit, and package dry-run must pass.
- A current Codex desktop-bundled CLI must configure and read back the server from a temporary `CODEX_HOME`, then complete a read-only connection smoke test.
- Cursor and Claude Desktop configuration generation remains covered on macOS and Windows, but actual-client prompt discovery is not a release requirement until those clients are available on the release host.

Release notes must label Cursor and Claude Desktop runtime prompt behavior as unverified, link to the [client compatibility issue form](https://github.com/BlogFactoryHQ/ghost-publisher-mcp/issues/new?template=client-compatibility.yml), and never claim that configuration tests are actual-client tests. Compatibility reports may tighten a later release gate without blocking v0.5.0.

Retain the richer Codex optimizer skill. Do not add duplicate MCP resources while the structured tools already supply the required data.

## Demand triggers

- Add remote transport only for a hosted-user requirement backed by a threat model.
- Add membership or newsletters only as a separate permission-scoped surface.
- The bounded v0.9 native authoring set is implemented on `main`; keep any broader card types or arbitrary Lexical composition demand-gated and require Ghost 5/6 round-trip fixtures before release.
- Revisit body search only after a real workflow defines strict pagination, payload, and latency limits.

Deletion, tag administration, page scheduling, site administration, webhook modification, themes, users, roles, persistent approval state, automatic deployment retries, background scheduling, arbitrary NQL, databases, dashboards, telemetry, billing, and embedded AI providers remain outside this milestone.

MFYDev/ghost-mcp may be used only as a behavioral reference with disposable Ghost. It is never a runtime dependency or production companion, and every adopted idea must be independently verified against official Ghost documentation and Ghost 5/6.
