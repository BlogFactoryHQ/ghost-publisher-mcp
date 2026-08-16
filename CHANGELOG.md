# Changelog

## 0.10.0 (2026-08-16)

- Extend `audit_content` with stable findings for invalid or empty content, heading structure, Hangul-at-block-start review, image alt evidence, toggle and duplicate-gallery review, bookmark/button/link integrity, Sources headings, and metadata presence or length.
- Add read-only `check_site_health` for separate Ghost and delivery homepages, sitemaps, up to five exact revision-bound posts/Pages, rendered titles and canonicals, static share prerequisites, Ghost 6 extension-bearing 404 evidence, and Ghost-returned feature images.
- Add `ghost_publication_doctor` to every permission profile; read-only runs stop after diagnosis, while draft-safe remediation continues only through the existing signed preview, exact approval, scopes, and readback path.
- Keep heuristics explicit: complex-script start, decorative-image intent, duplicate-gallery payloads, missing Sources headings, and metadata length ranges require human review and are not quality, accessibility, SEO, or Ghost-core repair claims.
- Bound public diagnostics to server-derived URLs, GET without redirects or retries, 15-second timeouts, 2 MB bodies, 20 deduplicated requests, and four concurrent requests; no crawling or caller-selected network destination is added.
- Gate release on disposable Ghost 5/6 diagnostics and Chromium, Firefox, and WebKit healthy/missing-Portal share fixtures.

## 0.9.0 (2026-08-16)

- Add draft-only native lists, quotes, code blocks, uploaded-image cards, and bookmarks to the existing post and Page creation tools.
- Add inline bold, italic, code, and HTTP(S) links to native prose without adding a general API dispatcher or new tools.
- Require image-card URLs to come from the existing safe `upload_image` flow in the current server session; bookmark cards never fetch external metadata.
- Verify creation, readback, and preservation of every new node on disposable Ghost 5 and Ghost 6 instances.

## 0.8.0 (2026-08-16)

- Add draft-only native heading, paragraph, callout, and button blocks to the existing post and Page creation tools.
- Validate structured input at the MCP boundary, sanitize callout Markdown, and require HTTP(S) button URLs.
- Verify native Lexical readback and structure-preserving edits on disposable Ghost 5 and Ghost 6 instances.
- Clarify mechanical, source-review, and schedule risk reporting in the packaged editorial skill.

## 0.7.0 (2026-08-02)

- Add structure-safe editorial changes, mechanical content audits, signed IANA schedule plans, and the packaged batch workflow.

## 0.6.0 (2026-08-02)

- Add permission profiles and signed preview/apply change sets with optimistic locking and readback receipts.

## 0.5.0 (2026-08-02)

- Add zero-argument `ghost_safe_publish` and `ghost_seo_optimize` MCP prompts for portable, approval-gated workflows.
- Hide write-oriented prompts in read-only mode while preserving the existing 23 normal and 9 read-only tools.

## 0.4.1 (2026-07-21)

- Correct the npm README so installation guidance and release status match the published package.
- Record successful initialization, tool discovery, read-only connection, normal connection, and draft-creation smoke tests using the published package against disposable Ghost.

## 0.4.0 (2026-07-21)

- Add one-command, cross-client setup for Codex, Cursor, and Claude Desktop with exact version pinning, redacted previews, atomic JSON writes, and rollback.
- Add bounded author and post discovery, complete nullable metadata patches, post scheduling, and unscheduling without newsletter parameters.
- Add a safe Pages workflow covering draft creation, metadata updates, publishing, unpublishing, and live verification without deletion or scheduling.
- Harden configured URLs, deployment redirects, Ghost-returned Page URLs, live response sizes, symlinked client configurations, and Codex key handling.
- Split release packaging from OIDC publication and pin release actions to immutable commits.
- Add public author discovery and ordered author attribution for drafts.
- Add bounded author/date/order post filters and nullable metadata clearing.
- Add approval-gated scheduling and unscheduling for exact, version-checked drafts.
- Add the interactive `setup` command and non-interactive client configuration options.
- Add approval-gated, revision-saving updates for published posts with optimistic locking.
- Return complete SEO and social metadata from `get_post`.
- Keep published article bodies read-only; live optimization patches are metadata-only.
- Verify optional rendered meta title, description, and canonical URL in public checks.
- Add the versioned Ghost + OpenSEO optimizer agent skill and hybrid implementation plan.
- Require caller-attested literal `user_confirmed: true` for published updates, publish/unpublish batches, and manual deployment.
- Add strict `GHOST_READ_ONLY` mode.
- Require `body_replacement_confirmed: true` for complete Markdown draft-body replacement.
- Make deployment single-attempt, preserve completed post transitions on hook failure, and return structured errors without hook paths or query strings.
- Publish npm and official MCP Registry metadata from one tag-triggered OIDC workflow after Ghost 5/6 validation.

## 0.1.1

- Match the MCP Registry namespace to the canonical GitHub username casing.

## 0.1.0

- Initial local stdio MCP server with 11 publishing tools.
- Draft-first Markdown publishing with optimistic locking and batch preflight.
- Safe uploads for images generated by Codex or another MCP client, with no second image API key.
- Generic deploy hook and public live-post checks.
