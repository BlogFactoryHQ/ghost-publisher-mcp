# Publication Doctor

`ghost_publication_doctor` is a user-invoked, bounded diagnostic workflow. It reads exact Ghost records, runs deterministic content findings, and checks server-derived Ghost and configured delivery surfaces. It does not crawl, execute browser JavaScript, publish, deploy, edit themes or routes, or certify accessibility or SEO quality.

## Draft-readiness request

Copy this into an MCP client that supports prompts:

```text
Use ghost_publication_doctor to review the named Ghost draft and Page. Resolve their exact
IDs and updated_at values, run audit_content, and separate confirmed findings from heuristics.
Show any smallest draft-safe remediation through preview_changes, then stop for my explicit
approval. Do not publish, schedule, deploy, replace a rich body, or infer approval.
```

`audit_content` accepts 1–25 exact post/Page revisions. Its existing inventory fields remain available; each item also returns stable `findings` with a code, severity, certainty, bounded evidence, optional Ghost issue, and safe-fix availability. Only `confirmed` means the mechanical trigger was observed. `heuristic` always requires human review.

## Published-site request

```text
Use ghost_publication_doctor for these named published posts and Pages. Run check_site_health
for no more than five exact revisions. Report Ghost and delivery surfaces separately, including
homepage, sitemap, exact URL status, title marker, canonical, share prerequisites, and feature
image evidence. Treat SHARE_INTERACTION_UNVERIFIED as requiring a real browser check. Do not
crawl links, change published bodies, publish, deploy, edit routes/themes, or claim Ghost is fixed.
```

`check_site_health` accepts only `posts` and `pages`, each containing an exact Ghost `id` and `updated_at`; callers cannot provide a URL, host, path, header, method, or redirect policy. The combined target limit is five. Requests use server-derived URLs, GET only, no redirects or retries, a 15-second timeout, a 2 MB response limit, a 20-request ceiling after deduplication, and at most four concurrent requests.

## Act on the result

| Evidence | Next action |
| --- | --- |
| `confirmed` finding | For a draft, show the smallest eligible change through `preview_changes` and wait for explicit approval. For a published record, report the evidence and stop unless a separately approved published-metadata change is in scope. |
| `heuristic` finding | Review it manually; it is not proof of a defect. |
| `unavailable` finding | Run only the stated follow-up. `SHARE_INTERACTION_UNVERIFIED` requires a real browser check and does not mean sharing is broken. |

The Doctor never treats a successful HTTP response, a static share marker, or an absent finding as a quality, accessibility, SEO, or Ghost-core certification.

## Copy-ready support evidence

Review and redact this template before sharing it publicly:

```text
Ghost Publication Doctor reproduction

- Ghost version: 6.x
- Permission profile: read-only
- Target: post <24-character-id>, updated_at <ISO-8601>
- Ghost surface: https://ghost.example.com/example/ -> HTTP 404
- Delivery surface: https://www.example.com/posts/example -> HTTP 200
- Confirmed codes: TARGET_PUBLIC_HTTP, ROUTE_EXTENSION_404_GHOST6
- Heuristic codes: CARD_GALLERY_DUPLICATE_PAYLOAD
- Unavailable evidence: SHARE_INTERACTION_UNVERIFIED
- Browser follow-up: test the rendered share control and #/share path in a real browser
- Reproduction: exact revision re-read; Ghost and delivery URLs checked separately; no redirect followed
```

Do not include Admin keys, cookies, deployment-hook URLs, private hosts, response bodies, or unrelated content. A static Portal prerequisite warning does not prove the share interaction fails; a browser check is still required. Toggle findings remain manual screen-reader review items, and no diagnostic result is an accessibility certification, ranking forecast, or claim that Ghost core was repaired.
