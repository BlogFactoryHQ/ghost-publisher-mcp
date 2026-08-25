# 55-second publishing demo

Record this against a disposable or explicitly authorized Ghost site. Do not show a Ghost Admin key, local configuration file, private URL, or real unpublished content.

| Time | Screen / narration |
| --- | --- |
| 0–5s | Title: “Write with AI. Publish safely to Ghost.” Show the local Ghost Publisher connection. |
| 5–16s | Paste a short Markdown post in the MCP client. Say: “Create it as a draft; do not publish.” Show the returned title, slug, and `draft` status. |
| 16–28s | Run `audit_content` or `ghost_publication_doctor` on that exact draft. Highlight one concrete finding, such as a missing meta description. |
| 28–40s | Show `preview_changes` for that named metadata patch. Pause on the before snapshot, required scope, and preview hash. Say: “The client shows the exact change before it writes.” |
| 40–49s | Approve the patch, then show the Ghost Admin editor with the post still marked Draft. Say: “Approval changes metadata; draft creation still does not publish.” |
| 49–55s | Open the post preview or configured public URL after a separately approved publish. Show the title and canonical check result. End: “Local key. Draft first. Verify the result.” |

Use one post, one finding, and one metadata patch. Do not speed through a general product tour; the proof is that writing, approval, and public verification are separate steps.
