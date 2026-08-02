# Ghost Publisher MCP Roadmap

This file is the authoritative Now/Next/Later index. Detailed milestone plans own implementation contracts and acceptance criteria; the README owns setup and released behavior.

## Status

| Horizon | Milestone | Status | Plan |
| --- | --- | --- | --- |
| Current | v0.7.0 editorial workflow | Structure-safe editing, mechanical audit, IANA schedule planning, and packaged batch skill in release validation | [0.7 Editorial workflow](docs/plans/0.7-editorial-workflow.md) |
| Shipped | v0.6.0 trust controls | Published and verified on npm and the MCP Registry on 2026-08-02 | [0.6 Trust controls](docs/plans/0.6-trust-controls.md) |
| Shipped | v0.5.0 setup and portable MCP prompts | Published and verified on npm and the MCP Registry on 2026-08-02 | [Future interoperability](docs/plans/future-interoperability.md) |
| Shipped | v0.4.1 release correction | Corrected npm documentation and published-package MCP smoke coverage | [0.4 Pages](docs/plans/0.4-pages.md) |
| Shipped | v0.2.0 release hardening and SEO workflow | Included in the consolidated v0.4.0 release | [0.2 release](docs/plans/0.2-release.md), [SEO workflow](docs/plans/0.2-seo-workflow.md) |
| Shipped | v0.2.1 cross-client onboarding | Included in the consolidated v0.4.0 release | [0.2.1 onboarding](docs/plans/0.2.1-onboarding.md) |
| Shipped | v0.3.0 editorial core | Included in the consolidated v0.4.0 release | [0.3 editorial](docs/plans/0.3-editorial.md) |
| Shipped | v0.4.0 safe Pages vertical | Published and verified on 2026-07-21 | [0.4 Pages](docs/plans/0.4-pages.md) |
| Demand-gated | Broader interoperability | No committed release beyond portable prompts | [Future interoperability](docs/plans/future-interoperability.md) |

The npm package and official MCP Registry serve `0.6.0`; source prepares v0.7.0 editorial workflows. Codex setup/readback was smoke-tested with a desktop-bundled CLI. Cursor and Claude configuration generation is automated, while actual-client behavior remains explicitly unverified.

## Gap register

| Priority | Gap | Closure | Status |
| --- | --- | --- | --- |
| P0 | The immutable v0.4.0 npm README retained prerelease wording | Publish corrected documentation as the next patch rather than overwriting v0.4.0 | Closed in v0.4.1 |
| P0 | `0.2.0` was not published separately | Ship the completed milestone contracts together in the next immutable release | Closed in v0.4.0 |
| P0 | Roadmap and implementation branches were unmerged | Merge PR [#8](https://github.com/BoraGkc/ghost-publisher-mcp/pull/8) and PR [#7](https://github.com/BoraGkc/ghost-publisher-mcp/pull/7) | Closed in v0.4.0 |
| P0 | Deployment behavior contradicted documentation | Publish/unpublish deploy once after complete success; published metadata updates deploy only through a separate approved call; never retry writes | Released in v0.4.0 |
| P1 | Approval was instructions-only | Require caller-attested literal confirmation at the schema boundary | Released in v0.4.0 |
| P1 | No read-only mode | Validate `GHOST_READ_ONLY`; hide all write tools when enabled | Released in v0.4.0 |
| P1 | No scheduling or author assignment | Add bounded author and scheduling tools | Released in v0.4.0 |
| P1 | Setup was client-specific and manual | Add one interactive local installer for Codex, Cursor, and Claude Desktop | Released in v0.4.0 |
| P1 | Current client releases need ongoing smoke coverage | Last manual smoke: Codex CLI `0.145.0-alpha.18`, Cursor `3.12.17`, and Claude Desktop `1.22209.3` on 2026-07-21; repeat after client updates | Monitor |
| P1 | Draft body updates can lose Ghost structure | Block rich-body replacement and permit only proven structure-safe Lexical operations | Replacement guard released in v0.6.0; bounded operations in v0.7.0 validation |
| P2 | Patch semantics were incomplete | Add nullable draft fields and published feature-image replacement | Released in v0.4.0 |
| P2 | Discovery was narrow | Add bounded author/date/order filters, not arbitrary NQL | Released in v0.4.0 |
| P2 | Pages required Ghost Admin handoff | Add a separate guarded Pages workflow for Ghost-rendered and headless sites | Released in v0.4.0; monitor usage |
| P0 | Generic update tools could bypass a visible diff | Replace them with HMAC-bound preview/apply and exact scopes | Released in v0.6.0 |
| P1 | Adding a source section could destroy rich cards | Add one HTML-card node and prove original children survive Ghost 5/6 round trips | Implemented for v0.7.0; release validation pending |
| P1 | Local schedule plans were not timezone-bound | Add proposal-only IANA conversion plus an HMAC-bound exact UTC plan | Implemented for v0.7.0; release validation pending |
| P1 | Optimizer workflow is Codex-specific | Add portable MCP prompts while retaining the richer Codex skill | Released in v0.5.0 |

## Delivery order

1. v0.4.0 consolidated release and v0.4.1 documentation correction: complete.
2. v0.5.0 balanced Codex/client configuration gate: complete.
3. v0.6.0 trust controls: complete.
4. Validate and publish v0.7.0 structure-safe editorial and scheduling workflows.
5. Correct release defects with the next patch version; never overwrite published versions.

## Non-goals

Post/page deletion, tag administration, page scheduling, members, tiers, offers, newsletters, newsletter sending, themes, webhook modification, users, roles, site administration, remote HTTP transport, OAuth, server-issued approval tokens, persistent approval state, automatic deployment retries, background scheduling, arbitrary NQL, full-body local search, databases, dashboards, telemetry, billing, and embedded AI providers are out of scope.

They require separate demand evidence and threat review. Remote transport needs a hosted-user requirement and threat model; membership/newsletters require a separate permission-scoped product surface; broader arbitrary Lexical editing requires additional round-trip fixtures and tested rollback.

MFYDev/ghost-mcp may be inspected only as a development reference against disposable Ghost. It is not a dependency, fork base, proxy, or production companion. Every adopted behavior must be independently bounded, verified against official Ghost documentation, and covered on Ghost 5 and 6.
