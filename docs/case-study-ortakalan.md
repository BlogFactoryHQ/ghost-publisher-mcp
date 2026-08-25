# Case study: publishing Ortak Alan with Ghost Publisher MCP

## Context

[Ortak Alan](https://ortakalan.io) is a live publication running Ghost `6.42`. The Ghost Publisher MCP maintainer uses the package in the publication's AI-assisted editorial workflow. This is a maintainer-operated case study, not an independent customer endorsement.

The workflow needed a local connection to Ghost with a deliberately narrow editing surface: create drafts, correct SEO metadata, upload visuals, preview exact changes, publish only after approval, trigger the configured static-site deployment once, and verify the rendered result.

## Editorial workflow at scale

The maintainer uses Ghost Publisher in the daily Ortak Alan publishing workflow. Research and editorial decisions stay with the operator and AI client; Ghost Publisher performs the bounded Ghost steps: draft creation, SEO metadata changes, image upload, approved publishing, deployment, and public live checks.

The public [Ortak Alan archive](https://ortakalan.io/search/) showed 336 pieces of content on 2026-08-20. The operator reports a current cadence of five to six posts per day through this workflow.

Before this setup, preparing one post by hand—research handoff, Ghost draft creation, image upload, SEO fields, publishing, deployment, and checks—took roughly 30 minutes. The operator now completes a reviewed batch of five to six posts in minutes, while retaining draft-first creation, explicit approval for writes, and public-result verification.

## What was verified

On 2026-08-16 the active Codex configuration was upgraded from `ghost-publisher-mcp@0.4.1` to the exact `0.8.0` package through the setup command. The key stayed in the private user configuration and the captured plan was redacted.

The published npm package then initialized through the actual ChatGPT desktop `26.810.41047` runtime and its bundled Codex CLI `0.148.0-alpha.9`. A read-only `check_connection` call reached the configured Ortak Alan host and reported Ghost `6.42`. The release workflow separately passed the full integration suite against disposable Ghost 5 and Ghost 6 containers.

No live post, Page, image, schedule, deployment, or other production content was changed for this verification.

## Search visibility

These Search Console snapshots are operational outcome evidence, not proof that Ghost Publisher alone caused the growth. Editorial choices, topic demand, indexing, and Google ranking systems also affect the results.

- Over the three months ending 2026-08-17, Ortak Alan recorded 652 Google Search clicks and 65,000 impressions, with a 1% CTR and an average position of 9.4.
- In the 28-day Search Console overview captured on 2026-08-20, the site recorded 500 clicks, up 294%, and 51,900 impressions, up 369%, against the comparison period.
- The same overview identified growth in individual pages, including the 2026 moon-calendar page (103 clicks, up 1,371%), an Odyssey article (56 clicks from zero in the comparison period), and an Odyssey reading guide (24 clicks, up 380%).

The useful case-study claim is therefore operational: the MCP made the complete Ghost publishing path repeatable enough to sustain a five-to-six-post daily cadence with checks built in. The search numbers show that this publishing period coincided with rapid organic visibility growth; they are not a causal attribution model.

## Operator note

> Ortak Alan’da her şey elle yapılırken bir yazının araştırmadan görsele, SEO alanlarından yayına ve son kontrole kadar olan kısmı yaklaşık yarım saati buluyordu. Şimdi Ghost Publisher ile taslağı oluşturuyor, SEO metadata’sını düzeltiyor, görseli yüklüyor, yayımlıyor, deploy ediyor ve canlı sonucu kontrol ediyoruz. Her gün beş-altı yazıyı dakikalar içinde çıkarabilmemizin nedeni daha çok kontrolsüz otomasyon değil; yayın öncesi kontrolü ve yayın sonrası doğrulamayı aynı akışın içine koymuş olmamız.

## Result

- At the 2026-08-16 verification, the operator configuration was pinned to `ghost-publisher-mcp@0.8.0`.
- The installed application runtime discovered the MCP server and completed a real read-only request to the production Ghost instance.
- The release is published on [npm](https://www.npmjs.com/package/ghost-publisher-mcp), the [official MCP Registry](https://registry.modelcontextprotocol.io/v0.1/servers/io.github.BoraGkc%2Fghost-publisher/versions/0.8.0), and [GitHub Releases](https://github.com/BoraGkc/ghost-publisher-mcp/releases/tag/v0.8.0).
- The package retains its permission profiles, revision checks, approval gates, and no-automatic-retry boundary.
- The daily production flow covers draft creation, metadata updates, image upload, approved publishing, one deployment, and live verification.

## Evidence

![v0.8.0 GitHub Release](assets/release-v0.8.0.png)

![Successful Ghost 5 and Ghost 6 release workflow](assets/release-workflow.png)

The repository also includes a [60-second setup tour](https://github.com/BoraGkc/ghost-publisher-mcp/releases/download/v0.8.0/setup-demo-60s.mp4) and a reproducible [safe publishing demo](safe-publish-demo.md).

The search-performance snapshots used above were captured from the operator's Google Search Console on 2026-08-20. They are retained outside this repository because they contain third-party product UI.

## Limitations

Cursor and Claude Desktop configuration generation is covered by automated tests, but neither application runtime was installed on the verification Mac. They remain runtime-unverified until the applications are available. This is a maintainer-reported operational case study, not an external user study or causal SEO experiment. It makes no claim that the MCP is safer than every alternative.
