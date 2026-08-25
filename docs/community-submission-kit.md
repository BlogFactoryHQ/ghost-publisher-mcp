# Community submission kit

Use this copy for a human-reviewed Ghost Forum post or MCP directory submission. Update the client compatibility sentence after any new runtime verification.

## Directory listing

**Name:** Ghost Publisher MCP

**Repository:** https://github.com/BlogFactoryHQ/ghost-publisher-mcp

**Package:** https://www.npmjs.com/package/ghost-publisher-mcp

**Summary:** A local-first MCP server for approval-gated Ghost editorial workflows: create drafts, correct metadata, upload images, publish approved batches, trigger one deployment, and verify rendered posts and Pages. It is used in Ortak Alan's five-to-six-post daily workflow.

**Install:** `npx -y ghost-publisher-mcp@latest setup --url https://your-ghost.example.com`

**Compatibility evidence:** Verified with ChatGPT desktop and bundled Codex against Ghost 6.42; release integration tests cover Ghost 5 and Ghost 6. Cursor and Claude Desktop configuration generation is automated, but their application runtimes were unavailable on the verification host.

**Production evidence:** Ortak Alan's public archive contained 336 pieces on 2026-08-20. The maintainer reports a five-to-six-post daily cadence; during this publishing period, Google Search Console recorded 652 clicks and 65,000 impressions over three months, then 500 clicks (+294%) and 51,900 impressions (+369%) in its latest captured 28-day view. This is correlation, not causal SEO attribution. Full case study: https://github.com/BlogFactoryHQ/ghost-publisher-mcp/blob/main/docs/case-study-ortakalan.md

## Community post

### Ghost Publisher MCP: approval-gated Ghost publishing from AI clients

Ghost Publisher MCP connects a local MCP client to Ghost without sending the Admin key to a hosted intermediary. It focuses on a bounded editorial path rather than exposing the full Ghost Admin API: read and audit content, create drafts from Markdown or a small native-block set, preview exact changes, require confirmation for writes, use Ghost revision checks, deploy once, and verify the public result.

It runs daily at Ortak Alan across a 336-piece public archive: draft creation, metadata correction, image upload, approved publishing, deployment, and live checks. The maintainer reports that a fully manual post path took roughly 30 minutes; the reviewed five-to-six-post daily batch now takes minutes. In the same publishing period, Google Search Console recorded 652 clicks and 65,000 impressions over three months, followed by a captured 28-day view of 500 clicks (+294%) and 51,900 impressions (+369%). These are operational results, not a claim that the MCP alone caused SEO growth.

At the 2026-08-16 verification, the maintainer-operated Ortak Alan setup was pinned to v0.8.0 and completed a real read-only connection through ChatGPT desktop/Codex to Ghost 6.42. The current package is v0.10.1, and its release workflow also passes against disposable Ghost 5 and Ghost 6 instances. No production content was changed for that verification, and Cursor/Claude Desktop runtimes remain unverified because those applications were unavailable on the test Mac.

Case study: https://github.com/BlogFactoryHQ/ghost-publisher-mcp/blob/main/docs/case-study-ortakalan.md

60-second setup tour: https://github.com/BlogFactoryHQ/ghost-publisher-mcp/releases/download/v0.8.0/setup-demo-60s.mp4

55-second publishing demo script: https://github.com/BlogFactoryHQ/ghost-publisher-mcp/blob/main/docs/publishing-demo-55s.md

Feedback and redacted compatibility reports are welcome. Never post a Ghost Admin key in an issue or forum reply.

## Community outreach rule

Do not post this as a broadcast. Use it only when a Ghost Forum, Discord, or GitHub issue asks for an AI-to-Ghost workflow that needs draft-first creation, explicit approval, or local credential handling. Lead with the answer to that question, name the relevant limitation, and include one link only when Ghost Publisher genuinely fits. Never ask for upvotes, reviews, stars, or reposts.

## Awesome MCP Servers submission

**Title:** Add Ghost Publisher MCP - approval-gated Ghost CMS publishing

**Body:**

- **Name:** Ghost Publisher MCP
- **Repository:** https://github.com/BlogFactoryHQ/ghost-publisher-mcp
- **npm:** https://www.npmjs.com/package/ghost-publisher-mcp
- **Official MCP Registry:** `io.github.BlogFactoryHQ/ghost-publisher`
- **Category:** Content management / publishing
- **Transport:** local stdio
- **License:** MIT
- **Install:** `npx -y ghost-publisher-mcp@latest setup --url https://your-ghost.example.com`
- **Description:** Local-first MCP server for bounded Ghost editorial workflows: read and audit content, create Markdown or native-block drafts, preview exact changes, schedule or publish approved batches, upload local images, trigger one deployment, and verify rendered posts and Pages. Permission profiles, Ghost revision checks, and explicit write confirmation are built in.
