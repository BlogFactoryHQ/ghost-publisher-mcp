# Community submission kit

Use this copy for a human-reviewed Ghost Forum post or MCP directory submission. Update the client compatibility sentence after any new runtime verification.

## Directory listing

**Name:** Ghost Publisher MCP

**Repository:** https://github.com/BoraGkc/ghost-publisher-mcp

**Package:** https://www.npmjs.com/package/ghost-publisher-mcp

**Summary:** A local-first MCP server for approval-gated Ghost editorial workflows: inspect content, create drafts, preview exact changes, schedule or publish approved batches, upload local images, trigger one deployment, and verify rendered posts and Pages.

**Install:** `npx -y ghost-publisher-mcp@latest setup --url https://your-ghost.example.com`

**Compatibility evidence:** Verified with ChatGPT desktop and bundled Codex against Ghost 6.42; release integration tests cover Ghost 5 and Ghost 6. Cursor and Claude Desktop configuration generation is automated, but their application runtimes were unavailable on the verification host.

## Community post

### Ghost Publisher MCP v0.8.0: approval-gated Ghost publishing from AI clients

Ghost Publisher MCP connects a local MCP client to Ghost without sending the Admin key to a hosted intermediary. It focuses on a bounded editorial path rather than exposing the full Ghost Admin API: read and audit content, create drafts from Markdown or a small native-block set, preview exact changes, require confirmation for writes, use Ghost revision checks, deploy once, and verify the public result.

The maintainer-operated Ortak Alan setup is pinned to v0.8.0 and completed a real read-only connection through ChatGPT desktop/Codex to Ghost 6.42. The release workflow also passes against disposable Ghost 5 and Ghost 6 instances. No production content was changed for that verification, and Cursor/Claude Desktop runtimes remain unverified because those applications were unavailable on the test Mac.

Case study: https://github.com/BoraGkc/ghost-publisher-mcp/blob/main/docs/case-study-ortakalan.md

60-second setup tour: https://github.com/BoraGkc/ghost-publisher-mcp/releases/download/v0.8.0/setup-demo-60s.mp4

Feedback and redacted compatibility reports are welcome. Never post a Ghost Admin key in an issue or forum reply.

## Awesome MCP Servers submission

**Title:** Add Ghost Publisher MCP - approval-gated Ghost CMS publishing

**Body:**

- **Name:** Ghost Publisher MCP
- **Repository:** https://github.com/BoraGkc/ghost-publisher-mcp
- **npm:** https://www.npmjs.com/package/ghost-publisher-mcp
- **Official MCP Registry:** `io.github.BoraGkc/ghost-publisher`
- **Category:** Content management / publishing
- **Transport:** local stdio
- **License:** MIT
- **Install:** `npx -y ghost-publisher-mcp@latest setup --url https://your-ghost.example.com`
- **Description:** Local-first MCP server for bounded Ghost editorial workflows: read and audit content, create Markdown or native-block drafts, preview exact changes, schedule or publish approved batches, upload local images, trigger one deployment, and verify rendered posts and Pages. Permission profiles, Ghost revision checks, and explicit write confirmation are built in.
