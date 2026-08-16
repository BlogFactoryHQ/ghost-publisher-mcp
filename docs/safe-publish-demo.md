# Safe Publishing Demo

Use a disposable or explicitly authorized Ghost site. This walkthrough creates one draft, changes one metadata field after approval, publishes after separate approval, and verifies the public page. It never sends a newsletter.

## 1. Install the release

```bash
npx -y ghost-publisher-mcp@0.8.0 setup
```

The setup command configures the selected local client with `GHOST_URL`, `GHOST_ADMIN_API_KEY`, and `GHOST_PERMISSION_PROFILE=publisher`. Configure a public post URL template when the site is headless. Restart the client and call `check_connection`.

## 2. Create and inspect one native draft

Ask the client:

```text
Create one Ghost post draft titled "Safe publishing demo" with these ordered native blocks:
1. h2 heading: "A reviewable draft"
2. paragraph: "Nothing publishes before approval."
3. green callout with emoji ✅: "Ghost-native cards remain editable."
4. left-aligned button "Ghost documentation" linking to https://ghost.org/docs
Do not publish. After creation, read the exact draft back and report its ID, updated_at,
status, slug, and Lexical node types.
```

Expected evidence: status is `draft`; the ordered node types are `extended-heading`, `paragraph`, `callout`, and `button`.

## 3. Preview and approve one exact change

Ask:

```text
Preview changing only meta_title on that exact draft to "Safe Ghost publishing demo".
Show the before snapshot, changed fields, required scopes, warnings, and preview hash.
Do not apply yet.
```

After checking the preview, approve only that named patch and its exact scopes. The client should call `apply_change_set` once, then report the revision request and Ghost readback receipt.

## 4. Publish and verify

Ask for a fresh exact read. If its ID and `updated_at` match the reviewed draft, explicitly approve the draft-to-published transition and the one configured automatic deployment. The client should call `publish_posts` once and then `check_live_posts` until the configured public URL reports the expected title and metadata or the bounded verification window ends.

Success requires the exact route, HTTP success, expected title, configured metadata, deployment result when applicable, and `verified: true`. A Ghost status change alone is not public-delivery proof.

## Cleanup

Return the demo post to draft only with a separate explicit approval. Ghost Publisher intentionally has no delete tool; delete the disposable test post in Ghost Admin if removal is required.
