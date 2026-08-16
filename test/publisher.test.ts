import { mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Config } from '../src/config.js';
import { GhostPublisher, slugify } from '../src/publisher.js';
import { AUDIT_FINDING_CODES } from '../src/types.js';

const temporary: string[] = [];
const key = `${'a'.repeat(24)}:${'b'.repeat(64)}`;
const baseConfig: Config = {
  ghostUrl: 'https://ghost.example.com',
  ghostAdminApiKey: key,
  ghostApiVersion: 'v5.0',
  permissionProfile: 'publisher',
  readOnly: false,
  uploadRoots: [],
};

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => import('node:fs/promises').then((fs) => fs.rm(directory, { recursive: true }))));
});

function post(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a'.repeat(24),
    title: 'Draft',
    slug: 'draft',
    status: 'draft',
    updated_at: '2026-01-01T00:00:00.000Z',
    tags: [],
    authors: [],
    html: '<p>Body</p>',
    lexical:
      '{"root":{"type":"root","children":[{"type":"paragraph","children":[{"type":"extended-text","text":"Body"}]}]}}',
    ...overrides,
  };
}

function page(overrides: Record<string, unknown> = {}) {
  return {
    id: 'd'.repeat(24),
    title: 'About',
    slug: 'about',
    status: 'draft',
    updated_at: '2026-01-01T00:00:00.000Z',
    url: 'https://ghost.example.com/about/',
    html: '<p>Body</p>',
    lexical:
      '{"root":{"type":"root","children":[{"type":"paragraph","children":[{"type":"extended-text","text":"Body"}]}]}}',
    ...overrides,
  };
}

describe('publishing service', () => {
  it('uses only bounded discovery filters and returns ordered public authors', async () => {
    const rows = Object.assign(
      [
        post({
          authors: [{ id: 'c'.repeat(24), name: 'Author', slug: 'author', email: 'private@example.com' }],
        }),
      ],
      { meta: { pagination: { page: 1 } } },
    );
    const browse = vi.fn(async () => rows);
    const publisher = new GhostPublisher(baseConfig, { ghost: { posts: { browse } } });

    const result = await publisher.listPosts({
      status: 'published',
      tag: 'News',
      search: "Editor's pick",
      author_id: 'c'.repeat(24),
      updated_after: '2026-01-01T00:00:00.000Z',
      updated_before: '2026-02-01T00:00:00.000Z',
      published_after: '2025-01-01T00:00:00.000Z',
      published_before: '2025-12-31T00:00:00.000Z',
      order: 'published_at_asc',
      limit: 15,
      page: 1,
    });

    expect(browse).toHaveBeenCalledWith({
      limit: 15,
      page: 1,
      order: 'published_at asc',
      include: 'tags,authors',
      filter:
        "status:published+tag:news+title:~'Editor\\'s pick'+authors.id:cccccccccccccccccccccccc+updated_at:>'2026-01-01T00:00:00.000Z'+updated_at:<'2026-02-01T00:00:00.000Z'+published_at:>'2025-01-01T00:00:00.000Z'+published_at:<'2025-12-31T00:00:00.000Z'",
    });
    expect(result.posts[0]?.authors).toEqual([{ id: 'c'.repeat(24), name: 'Author', slug: 'author' }]);
    expect(result.posts[0]?.authors[0]).not.toHaveProperty('email');
  });

  it('returns only bounded public author fields', async () => {
    const rows = Object.assign(
      [
        {
          id: 'c'.repeat(24),
          name: 'Author',
          slug: 'author',
          url: 'https://ghost.example.com/author/author',
          email: 'private@example.com',
          roles: [{ name: 'Administrator' }],
          count: { posts: 4 },
        },
      ],
      { meta: {} },
    );
    const browse = vi.fn(async () => rows);
    const publisher = new GhostPublisher(baseConfig, { ghost: { users: { browse } } });

    const result = await publisher.listAuthors({ search: 'Auth', limit: 50, page: 1 });

    expect(result.authors).toEqual([
      {
        id: 'c'.repeat(24),
        name: 'Author',
        slug: 'author',
        url: 'https://ghost.example.com/author/author',
        count: 4,
      },
    ]);
    expect(JSON.stringify(result)).not.toContain('private@example.com');
    expect(browse).toHaveBeenCalledWith({
      limit: 50,
      page: 1,
      order: 'name asc',
      include: 'count.posts',
      filter: "name:~'Auth'",
    });
  });

  it('creates safe HTML drafts and transliterates Turkish slugs', async () => {
    const add = vi.fn(async (data) => post(data));
    const ghost = {
      posts: { read: vi.fn(async () => Promise.reject(new Error('404 Not Found'))), add },
    };
    const publisher = new GhostPublisher(baseConfig, { ghost });

    const result = await publisher.createDrafts([
      { title: 'İçerik Şöleni', markdown: '# Başlık\n\n<script>alert(1)</script>' },
    ]);

    expect(slugify('İçerik Şöleni')).toBe('icerik-soleni');
    expect(result.succeeded).toHaveLength(1);
    expect(add.mock.calls[0]?.[0]).toMatchObject({ slug: 'icerik-soleni', status: 'draft' });
    expect(String(add.mock.calls[0]?.[0]?.html)).toContain('&lt;script&gt;');
  });

  it('creates native structured drafts without the HTML conversion path', async () => {
    const add = vi.fn(async (data) => post(data));
    const ghost = {
      posts: { read: vi.fn(async () => Promise.reject(new Error('404 Not Found'))), add },
    };
    const publisher = new GhostPublisher(baseConfig, { ghost });

    const result = await publisher.createDrafts([
      {
        title: 'Native cards',
        blocks: [
          { type: 'heading', text: 'Native heading', level: 2 },
          {
            type: 'paragraph',
            text: [
              { text: 'Plain ' },
              { text: 'bold', bold: true },
              { text: ' italic', italic: true },
              { text: ' code', code: true },
              { text: ' link', link: 'https://ghost.org/docs', bold: true },
            ],
          },
          {
            type: 'list',
            style: 'number',
            start: 2,
            items: ['First', [{ text: 'Second', italic: true }]],
          },
          { type: 'list', items: ['Bullet'] },
          { type: 'quote', text: [{ text: 'Quoted', bold: true }] },
          { type: 'codeblock', code: '<script></script>', language: 'javascript', caption: '**Example**' },
          {
            type: 'bookmark',
            url: 'https://ghost.org/docs',
            title: 'Ghost docs',
            description: 'Documentation',
            publisher: 'Ghost',
          },
          { type: 'callout', text: '**Safe** <script>alert(1)</script>', emoji: '✅', color: 'green' },
          { type: 'button', text: 'Read more', url: 'https://ghost.org/docs', alignment: 'left' },
        ],
      },
    ]);

    expect(result.succeeded).toHaveLength(1);
    expect(add.mock.calls[0]).toHaveLength(1);
    const document = JSON.parse(String(add.mock.calls[0]?.[0]?.lexical));
    expect(document.root.children).toMatchObject([
      { type: 'extended-heading', tag: 'h2', children: [{ type: 'extended-text', text: 'Native heading' }] },
      { type: 'paragraph' },
      { type: 'list', listType: 'number', start: 2, tag: 'ol' },
      { type: 'list', listType: 'bullet', start: 1, tag: 'ul' },
      { type: 'quote' },
      { type: 'codeblock', code: '<script></script>', language: 'javascript' },
      { type: 'bookmark', url: 'https://ghost.org/docs' },
      { type: 'callout', calloutEmoji: '✅', backgroundColor: 'green' },
      { type: 'button', buttonText: 'Read more', buttonUrl: 'https://ghost.org/docs', alignment: 'left' },
    ]);
    expect(document.root.children[1].children).toMatchObject([
      { type: 'extended-text', text: 'Plain ', format: 0 },
      { type: 'extended-text', text: 'bold', format: 1 },
      { type: 'extended-text', text: ' italic', format: 2 },
      { type: 'extended-text', text: ' code', format: 16 },
      { type: 'link', url: 'https://ghost.org/docs', children: [{ text: ' link', format: 1 }] },
    ]);
    expect(document.root.children[2].children).toMatchObject([
      { type: 'listitem', value: 2, children: [{ text: 'First', format: 0 }] },
      { type: 'listitem', value: 3, children: [{ text: 'Second', format: 2 }] },
    ]);
    expect(document.root.children[3].children).toMatchObject([
      { type: 'listitem', value: 1, children: [{ text: 'Bullet', format: 0 }] },
    ]);
    expect(document.root.children[4].children).toMatchObject([{ text: 'Quoted', format: 1 }]);
    expect(document.root.children[5].caption).toBe('<strong>Example</strong>');
    expect(document.root.children[6]).toMatchObject({
      metadata: { title: 'Ghost docs', description: 'Documentation', publisher: 'Ghost', icon: '', thumbnail: '' },
    });
    expect(document.root.children[7].calloutText).toContain('<strong>Safe</strong>');
    expect(document.root.children[7].calloutText).toContain('&lt;script&gt;');
    expect(document.root.children[7].calloutText).not.toContain('<script>');
  });

  it('rejects missing, duplicate, or unsafe structured draft bodies before Ghost access', async () => {
    const add = vi.fn();
    const read = vi.fn();
    const publisher = new GhostPublisher(baseConfig, { ghost: { posts: { read, add } } });

    await expect(publisher.createDrafts([{ title: 'Missing' }])).rejects.toThrow('exactly one');
    await expect(
      publisher.createDrafts([{ title: 'Duplicate', markdown: 'Body', blocks: [{ type: 'paragraph', text: 'Body' }] }]),
    ).rejects.toThrow('exactly one');
    await expect(
      publisher.createDrafts([
        { title: 'Unsafe URL', blocks: [{ type: 'button', text: 'Run', url: 'javascript:alert(1)' }] },
      ]),
    ).rejects.toThrow('HTTP or HTTPS');
    await expect(
      publisher.createDrafts([
        { title: 'Unsafe link', blocks: [{ type: 'paragraph', text: [{ text: 'Run', link: 'javascript:alert(1)' }] }] },
      ]),
    ).rejects.toThrow('HTTP or HTTPS');
    await expect(
      publisher.createDrafts([
        { title: 'External image', blocks: [{ type: 'image', src: 'https://example.com/image.png', alt: '' }] },
      ]),
    ).rejects.toThrow('must come from upload_image');
    expect(read).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });

  it('previews exact metadata scopes without writing and applies only the signed change set', async () => {
    let current = post();
    const edit = vi.fn(async (data: Record<string, unknown>) => {
      current = post({ ...current, ...data, updated_at: '2026-01-02T00:00:00.000Z' });
      return current;
    });
    const publisher = new GhostPublisher(baseConfig, {
      ghost: { posts: { read: vi.fn(async () => current), edit } },
    });
    const changes = [
      {
        target: { type: 'post' as const, id: 'a'.repeat(24), updated_at: '2026-01-01T00:00:00.000Z' },
        operation: { type: 'update_fields' as const, patch: { meta_title: 'Safer title' } },
      },
    ];

    const preview = await publisher.previewChanges(changes);
    expect(edit).not.toHaveBeenCalled();
    expect(preview.changes[0]).toMatchObject({
      changed_fields: ['meta_title'],
      required_scopes: ['metadata'],
      can_apply: true,
    });

    const result = await publisher.applyChangeSet(changes, preview.preview_hash, { metadata: true });
    expect(edit).toHaveBeenCalledWith(expect.objectContaining({ meta_title: 'Safer title' }), { save_revision: true });
    expect(result.succeeded[0]).toMatchObject({
      before_snapshot: expect.objectContaining({ lexical: post().lexical }),
      revision_requested: true,
      ghost_readback: true,
    });
  });

  it('rejects tampered hashes, extra scopes, and protected rich-card body replacement', async () => {
    const edit = vi.fn();
    const rich = post({
      lexical:
        '{"root":{"type":"root","children":[{"type":"image","src":"https://example.com/image.jpg"},{"type":"future-card"}]}}',
    });
    const publisher = new GhostPublisher(baseConfig, {
      ghost: { posts: { read: vi.fn(async () => rich), edit } },
    });
    const metadata = [
      {
        target: { type: 'post' as const, id: 'a'.repeat(24), updated_at: '2026-01-01T00:00:00.000Z' },
        operation: { type: 'update_fields' as const, patch: { meta_title: 'New' } },
      },
    ];
    const metadataPreview = await publisher.previewChanges(metadata);
    await expect(publisher.applyChangeSet(metadata, `${metadataPreview.preview_hash}x`, { metadata: true })).rejects.toThrow(
      'Preview hash does not match',
    );
    await expect(
      publisher.applyChangeSet(metadata, metadataPreview.preview_hash, { metadata: true, title: true }),
    ).rejects.toThrow('Approved scopes must exactly match');

    const body = [
      {
        target: metadata[0]!.target,
        operation: { type: 'replace_body' as const, markdown: '# Replacement' },
      },
    ];
    const bodyPreview = await publisher.previewChanges(body);
    expect(bodyPreview.changes[0]).toMatchObject({
      can_apply: false,
      protected_nodes: ['future-card', 'image'],
    });
    await expect(publisher.applyChangeSet(body, bodyPreview.preview_hash, { body: true })).rejects.toThrow(
      'cannot be applied',
    );
    expect(edit).not.toHaveBeenCalled();
  });

  it('allows a signed plain draft body replacement and saves a revision', async () => {
    let current = post();
    const edit = vi.fn(async (data: Record<string, unknown>) => {
      current = post({ ...current, ...data, updated_at: '2026-01-02T00:00:00.000Z' });
      return current;
    });
    const publisher = new GhostPublisher(baseConfig, {
      ghost: { posts: { read: vi.fn(async () => current), edit } },
    });
    const changes = [
      {
        target: { type: 'post' as const, id: 'a'.repeat(24), updated_at: '2026-01-01T00:00:00.000Z' },
        operation: { type: 'replace_body' as const, markdown: '# Replacement' },
      },
    ];
    const preview = await publisher.previewChanges(changes);
    const result = await publisher.applyChangeSet(changes, preview.preview_hash, { body: true });

    expect(edit).toHaveBeenCalledWith(expect.objectContaining({ html: '<h1>Replacement</h1>\n' }), {
      source: 'html',
      save_revision: true,
    });
    expect(result.succeeded).toHaveLength(1);
  });

  it.each(['append_section', 'prepend_section'] as const)(
    'adds one safe HTML card with %s while preserving every original rich child',
    async (type) => {
      const lexical = JSON.stringify({
        root: {
          type: 'root',
          version: 1,
          children: [
            { type: 'image', version: 1, src: 'https://example.com/image.jpg' },
            {
              type: 'paragraph',
              version: 1,
              children: [{ type: 'extended-text', version: 1, text: 'Body', format: 1, style: '' }],
            },
          ],
        },
      });
      let current = post({ lexical });
      const edit = vi.fn(async (data: Record<string, unknown>) => {
        current = post({ ...current, ...data, updated_at: '2026-01-02T00:00:00.000Z' });
        return current;
      });
      const publisher = new GhostPublisher(baseConfig, {
        ghost: { posts: { read: vi.fn(async () => current), edit } },
      });
      const changes = [
        {
          target: { type: 'post' as const, id: current.id, updated_at: current.updated_at },
          operation: { type, markdown: '## Kaynaklar\n\n<script>blocked</script>' },
        },
      ];

      const preview = await publisher.previewChanges(changes);
      expect(preview.changes[0]).toMatchObject({
        can_apply: true,
        protected_nodes: ['image'],
        removed_nodes: [],
        required_scopes: ['body'],
      });
      const beforeChildren = JSON.parse(lexical).root.children;
      const result = await publisher.applyChangeSet(changes, preview.preview_hash, { body: true });
      const sentLexical = JSON.parse(String(edit.mock.calls[0]?.[0]?.lexical));
      const preserved = type === 'append_section' ? sentLexical.root.children.slice(0, -1) : sentLexical.root.children.slice(1);
      const htmlCard = type === 'append_section' ? sentLexical.root.children.at(-1) : sentLexical.root.children[0];
      expect(preserved).toEqual(beforeChildren);
      expect(htmlCard).toMatchObject({ type: 'html', version: 1 });
      expect(htmlCard.html).toContain('&lt;script&gt;');
      expect(result.succeeded).toHaveLength(1);
    },
  );

  it('replaces one exact text node and preserves its format and style', async () => {
    const lexical = JSON.stringify({
      root: {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [{ type: 'extended-text', text: 'Exact text', format: 5, style: 'color: red' }],
          },
        ],
      },
    });
    let current = post({ lexical });
    const edit = vi.fn(async (data: Record<string, unknown>) => {
      current = post({ ...current, ...data, updated_at: '2026-01-02T00:00:00.000Z' });
      return current;
    });
    const publisher = new GhostPublisher(baseConfig, {
      ghost: { posts: { read: vi.fn(async () => current), edit } },
    });
    const changes = [
      {
        target: { type: 'post' as const, id: current.id, updated_at: current.updated_at },
        operation: { type: 'replace_exact_text' as const, find: 'Exact text', replace: 'Safer text' },
      },
    ];
    const preview = await publisher.previewChanges(changes);
    const result = await publisher.applyChangeSet(changes, preview.preview_hash, { body: true });
    const textNode = JSON.parse(String(edit.mock.calls[0]?.[0]?.lexical)).root.children[0].children[0];
    expect(textNode).toEqual({ type: 'extended-text', text: 'Safer text', format: 5, style: 'color: red' });
    expect(result.succeeded).toHaveLength(1);

    const duplicateDocument = JSON.parse(lexical);
    duplicateDocument.root.children[0].children.push({ type: 'extended-text', text: 'Exact text' });
    const duplicate = post({ lexical: JSON.stringify(duplicateDocument) });
    const blocked = new GhostPublisher(baseConfig, {
      ghost: { posts: { read: vi.fn(async () => duplicate), edit: vi.fn() } },
    });
    const blockedPreview = await blocked.previewChanges([
      { ...changes[0]!, target: { ...changes[0]!.target, updated_at: duplicate.updated_at } },
    ]);
    expect(blockedPreview.changes[0]).toMatchObject({ can_apply: false });
    expect(blockedPreview.changes[0]?.warnings.join(' ')).toContain('found 2');
  });

  it('audits mechanical signals without a quality or truth score', async () => {
    const lexical = JSON.stringify({
      root: {
        type: 'root',
        children: [
          { type: 'extended-heading', tag: 'h2', children: [{ type: 'extended-text', text: 'Kaynaklar' }] },
          {
            type: 'extended-link',
            url: 'https://example.com/source',
            children: [{ type: 'extended-text', text: 'Source' }],
          },
        ],
      },
    });
    const current = post({ lexical, feature_image: 'https://example.com/image.jpg', feature_image_alt: null });
    const publisher = new GhostPublisher(baseConfig, {
      ghost: { posts: { read: vi.fn(async () => current) } },
    });
    const result = await publisher.auditContent([
      { type: 'post', id: current.id, updated_at: current.updated_at },
    ]);

    expect(result.audits[0]).toMatchObject({
      lexical_parseable: true,
      feature_image_missing_alt: true,
      sources_section_found: true,
      links_and_citations: [{ type: 'extended-link', url: 'https://example.com/source', text: 'Source' }],
    });
    expect(JSON.stringify(result)).not.toMatch(/quality|truth|score/i);
  });

  it('emits every staged audit finding deterministically and leaves a clean document clean', async () => {
    const gallery = {
      type: 'gallery',
      images: [{ src: 'https://images.example.com/one.jpg', width: 800, height: 600, alt: 'One' }],
    };
    const problematic = post({
      id: 'b'.repeat(24),
      feature_image: 'https://images.example.com/feature.jpg',
      feature_image_alt: null,
      meta_title: 'Short',
      meta_description: 'Brief',
      canonical_url: null,
      lexical: JSON.stringify({
        root: {
          type: 'root',
          children: [
            { type: 'extended-heading', tag: 'h2', children: [{ type: 'extended-text', text: 'Intro' }] },
            { type: 'extended-heading', tag: 'h4', children: [] },
            { type: 'paragraph', children: [{ type: 'extended-text', text: '한국어 starts here' }] },
            { type: 'image', src: 'https://images.example.com/missing.jpg' },
            { type: 'image', src: 'https://images.example.com/decorative.jpg', alt: '', caption: 'Caption' },
            { type: 'toggle', children: [{ type: 'paragraph', children: [{ type: 'text', text: 'Toggle' }] }] },
            gallery,
            gallery,
            { type: 'bookmark', url: '', metadata: { title: '' } },
            { type: 'button', buttonText: '' },
            { type: 'extended-link', url: 'javascript:alert(1)', children: [] },
          ],
        },
      }),
    });
    const empty = post({ id: 'c'.repeat(24), lexical: '{"root":{"type":"root","children":[]}}' });
    const invalid = post({ id: 'd'.repeat(24), lexical: '{' });
    const clean = post({
      id: 'e'.repeat(24),
      feature_image: 'https://images.example.com/feature.jpg',
      feature_image_alt: 'Descriptive alternative',
      meta_title: 'A complete publication title for readers',
      meta_description: 'A complete and useful publication description that stays inside the documented review range for metadata.',
      canonical_url: 'https://ghost.example.com/clean/',
      lexical: JSON.stringify({
        root: {
          type: 'root',
          children: [
            { type: 'paragraph', children: [{ type: 'extended-text', text: 'Useful body' }] },
            { type: 'gallery', images: [{ src: 'one.jpg' }, { src: 'two.jpg' }] },
            { type: 'gallery', images: [{ src: 'two.jpg' }, { src: 'one.jpg' }] },
            { type: 'extended-heading', tag: 'h2', children: [{ type: 'extended-text', text: 'Sources' }] },
            { type: 'extended-link', url: 'https://example.com/source', children: [{ type: 'extended-text', text: 'Source' }] },
          ],
        },
      }),
    });
    const rows = new Map([problematic, empty, invalid, clean].map((row) => [row.id, row]));
    const publisher = new GhostPublisher(baseConfig, {
      ghost: { posts: { read: vi.fn(async ({ id }) => rows.get(id)) } },
    });
    const targets = [problematic, empty, invalid, clean].map((row) => ({
      type: 'post' as const,
      id: row.id,
      updated_at: row.updated_at,
    }));

    const first = await publisher.auditContent(targets);
    const second = await publisher.auditContent(targets);
    const codes = new Set(first.audits.flatMap((audit) => audit.findings.map((finding) => finding.code)));

    expect([...codes].sort()).toEqual([...AUDIT_FINDING_CODES].sort());
    expect(first).toEqual(second);
    expect(first.audits[3]?.findings).toEqual([]);
    for (const finding of first.audits.flatMap((audit) => audit.findings)) {
      expect(finding).toMatchObject({
        code: expect.any(String),
        severity: expect.stringMatching(/^(blocker|warning|info)$/),
        certainty: expect.stringMatching(/^(confirmed|heuristic)$/),
        message: expect.any(String),
        evidence: expect.any(Object),
        safe_fix: { available: expect.any(Boolean), reason: expect.any(String) },
      });
      expect(Object.prototype.hasOwnProperty.call(finding, 'ghost_issue')).toBe(true);
    }
  });

  it('plans Istanbul UTC timestamps and rejects ambiguous or missing local times', async () => {
    const current = post();
    const publisher = new GhostPublisher(baseConfig, {
      ghost: { posts: { read: vi.fn(async () => current) } },
    });
    const targets = [
      { id: current.id, updated_at: current.updated_at },
      { id: 'b'.repeat(24), updated_at: current.updated_at },
    ];
    const plan = await publisher.planSchedule(targets, '2026-08-03T10:00:00', 'Europe/Istanbul', 24);
    expect(plan).toMatchObject({
      timezone: 'Europe/Istanbul',
      interval_hours: 24,
      newsletter: false,
      headless_visibility: 'unverified',
    });
    expect(plan.posts.map((item) => item.published_at)).toEqual([
      '2026-08-03T07:00:00Z',
      '2026-08-04T07:00:00Z',
    ]);
    await expect(
      publisher.planSchedule([targets[0]!], '2026-11-01T01:30:00', 'America/New_York', 24),
    ).rejects.toThrow();
    await expect(
      publisher.planSchedule([targets[0]!], '2026-03-08T02:30:00', 'America/New_York', 24),
    ).rejects.toThrow();
    await expect(publisher.planSchedule([targets[0]!], '2026-08-03T10:00:00', 'Not/AZone', 24)).rejects.toThrow();
  });

  it('aborts a stale 20-post schedule with zero writes', async () => {
    let stale = false;
    const edit = vi.fn();
    const read = vi.fn(async ({ id }: { id: string }) =>
      post({ id, updated_at: stale && id === 'f'.repeat(24) ? '2026-01-02T00:00:00.000Z' : post().updated_at }),
    );
    const publisher = new GhostPublisher(baseConfig, { ghost: { posts: { read, edit } } });
    const targets = Array.from({ length: 20 }, (_, index) => ({
      id: index.toString(16).padStart(24, index === 15 ? 'f' : '0'),
      updated_at: post().updated_at,
    }));
    const plan = await publisher.planSchedule(targets, '2099-01-01T10:00:00', 'Europe/Istanbul', 24);
    stale = true;
    const result = await publisher.schedulePosts(
      plan.posts.map(({ id, updated_at, published_at }) => ({ id, updated_at, published_at })),
      plan.plan_hash,
    );

    expect(result.succeeded).toEqual([]);
    expect(result.failed).toHaveLength(20);
    expect(edit).not.toHaveBeenCalled();
  });

  it('requires separate scopes for every protected field class', async () => {
    const publisher = new GhostPublisher(baseConfig, {
      ghost: { posts: { read: vi.fn(async () => post()), edit: vi.fn() } },
    });
    const preview = await publisher.previewChanges([
      {
        target: { type: 'post', id: 'a'.repeat(24), updated_at: '2026-01-01T00:00:00.000Z' },
        operation: {
          type: 'update_fields',
          patch: {
            title: 'New title',
            slug: 'new-slug',
            tags: ['News'],
            feature_image_url: 'https://ghost.example.com/image.jpg',
            meta_title: 'Metadata',
          },
        },
      },
    ]);

    expect(preview.changes[0]?.required_scopes).toEqual([
      'feature_image',
      'metadata',
      'slug',
      'taxonomy',
      'title',
    ]);
  });

  it('binds preview hashes to the Ghost site and aborts a stale 20-item batch before writing', async () => {
    let stale = false;
    const edit = vi.fn();
    const read = vi.fn(async ({ id }: { id: string }) =>
      post({ id, updated_at: stale && id === 'f'.repeat(24) ? '2026-01-02T00:00:00.000Z' : post().updated_at }),
    );
    const publisher = new GhostPublisher(baseConfig, { ghost: { posts: { read, edit } } });
    const changes = Array.from({ length: 20 }, (_, index) => {
      const id = index.toString(16).padStart(24, index === 15 ? 'f' : '0');
      return {
        target: { type: 'post' as const, id, updated_at: post().updated_at },
        operation: { type: 'update_fields' as const, patch: { meta_title: `Title ${index}` } },
      };
    });
    const preview = await publisher.previewChanges(changes);
    const otherSite = new GhostPublisher(
      { ...baseConfig, ghostUrl: 'https://other.example.com' },
      { ghost: { posts: { read, edit } } },
    );
    await expect(otherSite.applyChangeSet(changes, preview.preview_hash, { metadata: true })).rejects.toThrow(
      'Preview hash does not match',
    );

    stale = true;
    await expect(publisher.applyChangeSet(changes, preview.preview_hash, { metadata: true })).rejects.toThrow(
      'changed since it was read',
    );
    expect(edit).not.toHaveBeenCalled();
  });

  it('enforces permission profiles inside the publishing service', async () => {
    const ghost = { posts: { read: vi.fn(async () => post()), edit: vi.fn(), add: vi.fn() } };
    const readOnly = new GhostPublisher(
      { ...baseConfig, permissionProfile: 'read-only', readOnly: true },
      { ghost },
    );
    const draftEditor = new GhostPublisher(
      { ...baseConfig, permissionProfile: 'draft-editor' },
      { ghost },
    );

    await expect(readOnly.createDrafts([{ title: 'No', markdown: 'No' }])).rejects.toThrow('read-only');
    await expect(
      draftEditor.schedulePosts(
        [{ id: post().id, updated_at: post().updated_at, published_at: '2099-01-01T00:00:00.000Z' }],
        'not-used',
      ),
    ).rejects.toThrow('scheduler permission profile');
    await expect(draftEditor.transitionPosts([{ id: post().id, updated_at: post().updated_at }], 'published')).rejects.toThrow(
      'publisher permission profile',
    );
    expect(ghost.posts.edit).not.toHaveBeenCalled();
    expect(ghost.posts.add).not.toHaveBeenCalled();
  });

  it('aborts a whole transition when preflight finds a stale post', async () => {
    const edit = vi.fn();
    const ghost = {
      posts: {
        read: vi
          .fn()
          .mockResolvedValueOnce(post())
          .mockResolvedValueOnce(post({ id: 'b'.repeat(24), updated_at: 'newer' })),
        edit,
      },
    };
    const publisher = new GhostPublisher(baseConfig, { ghost });
    const result = await publisher.transitionPosts(
      [
        { id: 'a'.repeat(24), updated_at: '2026-01-01T00:00:00.000Z' },
        { id: 'b'.repeat(24), updated_at: 'old' },
      ],
      'published',
    );

    expect(edit).not.toHaveBeenCalled();
    expect(result.succeeded).toEqual([]);
    expect(result.failed).toHaveLength(2);
  });


  it('rejects duplicate transition targets before calling Ghost', async () => {
    const read = vi.fn();
    const edit = vi.fn();
    const publisher = new GhostPublisher(baseConfig, { ghost: { posts: { read, edit } } });
    const target = { id: 'a'.repeat(24), updated_at: '2026-01-01T00:00:00.000Z' };

    await expect(publisher.transitionPosts([target, target], 'published')).rejects.toThrow(
      'Post IDs must be unique within the batch',
    );
    expect(read).not.toHaveBeenCalled();
    expect(edit).not.toHaveBeenCalled();
  });

  it('reports partial writes and does not deploy after a failed batch', async () => {
    const request = vi.fn();
    const ghost = {
      posts: {
        read: vi.fn(async ({ id }) => post({ id })),
        edit: vi
          .fn()
          .mockResolvedValueOnce(post({ status: 'published' }))
          .mockRejectedValueOnce(new Error('Ghost unavailable')),
      },
    };
    const publisher = new GhostPublisher(
      { ...baseConfig, deployHookUrl: 'https://deploy.example.com/private?token=secret' },
      { ghost, fetch: request, lookup: async () => [{ address: '93.184.216.34' }] },
    );
    const result = await publisher.transitionPosts(
      [
        { id: 'a'.repeat(24), updated_at: '2026-01-01T00:00:00.000Z' },
        { id: 'b'.repeat(24), updated_at: '2026-01-01T00:00:00.000Z' },
      ],
      'published',
    );

    expect(result.partial_failure).toBe(true);
    expect(result.succeeded).toHaveLength(1);
    expect(result.failed).toHaveLength(1);
    expect(request).not.toHaveBeenCalled();
  });

  it('schedules and unschedules exact posts without newsletters or deployment', async () => {
    const request = vi.fn();
    let current = post({ status: 'draft' });
    const read = vi.fn(async () => current);
    const edit = vi.fn(async (data) => {
      current = post({ ...current, ...data });
      return current;
    });
    const publisher = new GhostPublisher(
      { ...baseConfig, deployHookUrl: 'https://deploy.example.com/hook' },
      { ghost: { posts: { read, edit } }, fetch: request },
    );
    const target = { id: 'a'.repeat(24), updated_at: '2026-01-01T00:00:00.000Z' };

    const plan = await publisher.planSchedule([target], '2099-01-01T00:00:00', 'UTC', 24);
    await expect(
      publisher.schedulePosts(
        plan.posts.map(({ id, updated_at, published_at }) => ({ id, updated_at, published_at })),
        `${plan.plan_hash}x`,
      ),
    ).rejects.toThrow('Schedule plan hash does not match');
    expect(edit).not.toHaveBeenCalled();
    const scheduled = await publisher.schedulePosts(
      plan.posts.map(({ id, updated_at, published_at }) => ({ id, updated_at, published_at })),
      plan.plan_hash,
    );
    const unscheduled = await publisher.unschedulePosts([target]);

    expect(scheduled).toMatchObject({
      succeeded: [expect.objectContaining({ status: 'scheduled' })],
      newsletter: false,
      headless_visibility: 'unverified',
    });
    expect(unscheduled.succeeded[0]).toMatchObject({ status: 'draft' });
    expect(edit.mock.calls[0]).toEqual([
      { ...target, published_at: '2099-01-01T00:00:00Z', status: 'scheduled' },
    ]);
    expect(edit.mock.calls[1]).toEqual([{ ...target, status: 'draft' }]);
    expect(JSON.stringify(edit.mock.calls)).not.toContain('newsletter');
    expect(request).not.toHaveBeenCalled();
  });

  it('rejects past schedules and preflight failures before writing', async () => {
    const edit = vi.fn();
    const read = vi.fn(async () => post({ status: 'published' }));
    const publisher = new GhostPublisher(baseConfig, { ghost: { posts: { read, edit } } });
    const target = { id: 'a'.repeat(24), updated_at: '2026-01-01T00:00:00.000Z' };

    await expect(
      publisher.schedulePosts([{ ...target, published_at: '2020-01-01T00:00:00.000Z' }], 'past'),
    ).rejects.toThrow('must be in the future');
    const result = await publisher.schedulePosts(
      [{ ...target, published_at: '2099-01-01T00:00:00.000Z' }],
      'invalid',
    );

    expect(result.succeeded).toEqual([]);
    expect(result.failed).toHaveLength(1);
    expect(edit).not.toHaveBeenCalled();
  });

  it('deploys after a complete transition and checks the configured live URL', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 202 })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          '<html><head><title>SEO &amp; title</title><meta content="Rendered description" name="description"><link href="https://site.example.com/posts/live-post" rel="canonical"></head><body><h1>Live &amp; post</h1></body></html>',
      });
    const ghost = {
      posts: {
        read: vi.fn(async () => post()),
        edit: vi.fn(async () => post({ status: 'published' })),
      },
    };
    const publisher = new GhostPublisher(
      {
        ...baseConfig,
        deployHookUrl: 'https://deploy.example.com/hook',
        publicPostUrlTemplate: 'https://site.example.com/posts/{slug}',
      },
      { ghost, fetch: request, lookup: async () => [{ address: '93.184.216.34' }] },
    );

    const result = await publisher.transitionPosts(
      [{ id: 'a'.repeat(24), updated_at: '2026-01-01T00:00:00.000Z' }],
      'published',
    );
    expect(request).toHaveBeenCalledTimes(1);
    const checks = await publisher.checkLivePosts([
      {
        slug: 'live-post',
        title: 'Live & post',
        expected_meta_title: 'SEO & title',
        expected_meta_description: 'Rendered description',
        expected_canonical_url: 'https://site.example.com/posts/live-post',
      },
    ]);

    expect(result.deploy).toEqual({ accepted: true, host: 'deploy.example.com', status: 202 });
    expect(checks).toEqual([
      {
        slug: 'live-post',
        url: 'https://site.example.com/posts/live-post',
        status: 200,
        title_match: true,
        verified: true,
        meta_title_match: true,
        meta_description_match: true,
        canonical_url_match: true,
      },
    ]);
  });

  it('preserves successful transitions when the single deploy request is rejected', async () => {
    const request = vi.fn(async () => ({ ok: false, status: 503 } as Response));
    const publisher = new GhostPublisher(
      { ...baseConfig, deployHookUrl: 'https://deploy.example.com/hook' },
      {
        ghost: {
          posts: {
            read: vi.fn(async () => post()),
            edit: vi.fn(async () => post({ status: 'published' })),
          },
        },
        fetch: request,
      },
    );

    const result = await publisher.transitionPosts(
      [{ id: 'a'.repeat(24), updated_at: '2026-01-01T00:00:00.000Z' }],
      'published',
    );

    expect(result.succeeded).toHaveLength(1);
    expect(result.deploy).toEqual({
      accepted: false,
      host: 'deploy.example.com',
      status: 503,
      error: 'Deploy hook returned HTTP 503',
    });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('reports a redacted network deployment failure without retrying', async () => {
    const hook = 'https://deploy.example.com/private?token=secret';
    const request = vi.fn((...args: Parameters<typeof fetch>) => {
      void args;
      return Promise.reject(new Error(`request to ${hook} failed`));
    });
    const publisher = new GhostPublisher({ ...baseConfig, deployHookUrl: hook }, { ghost: {}, fetch: request });

    const deploy = await publisher.triggerDeploy();

    expect(deploy).toEqual({
      accepted: false,
      host: 'deploy.example.com',
      status: 0,
      error: 'request to [REDACTED] failed',
    });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]?.[0].toString()).toBe(hook);
    expect(request.mock.calls[0]?.[1]).toMatchObject({ redirect: 'error' });
  });

  it('uses the bounded Ghost Pages surface and always creates page drafts', async () => {
    const rows = Object.assign([page()], { meta: { pagination: { page: 1 } } });
    const browse = vi.fn(async () => rows);
    const read = vi.fn(async () => Promise.reject(new Error('404 not found')));
    const add = vi.fn(async (...args: [Record<string, unknown>, Record<string, unknown>?]) => page(args[0]));
    const remove = vi.fn();
    const publisher = new GhostPublisher(baseConfig, {
      ghost: { pages: { browse, read, add, delete: remove } },
    });

    const listed = await publisher.listPages({
      status: 'published',
      search: "Editor's page",
      updated_after: '2026-01-01T00:00:00.000Z',
      updated_before: '2026-02-01T00:00:00.000Z',
      order: 'updated_at_asc',
      limit: 15,
      page: 1,
    });
    const created = await publisher.createPageDrafts([
      { title: 'About', markdown: '# About', excerpt: 'Page excerpt' },
    ]);
    await publisher.createPageDrafts([
      { title: 'Native page', blocks: [{ type: 'callout', text: 'Page card' }] },
    ]);

    expect(browse).toHaveBeenCalledWith({
      limit: 15,
      page: 1,
      order: 'updated_at asc',
      filter:
        "status:published+title:~'Editor\\'s page'+updated_at:>'2026-01-01T00:00:00.000Z'+updated_at:<'2026-02-01T00:00:00.000Z'",
    });
    expect(listed.pages[0]).not.toHaveProperty('tags');
    expect(add.mock.calls[0]?.[0]).toMatchObject({ status: 'draft', html: '<h1>About</h1>\n' });
    expect(add.mock.calls[0]?.[1]).toEqual({ source: 'html' });
    expect(add.mock.calls[1]).toHaveLength(1);
    expect(JSON.parse(String(add.mock.calls[1]?.[0]?.lexical)).root.children[0]).toMatchObject({
      type: 'callout',
      calloutText: 'Page card',
    });
    expect(created.succeeded[0]).not.toHaveProperty('authors');
    expect(remove).not.toHaveBeenCalled();
  });

  it('rejects post-only fields in a page change preview', async () => {
    const edit = vi.fn();
    const publisher = new GhostPublisher(baseConfig, {
      ghost: { pages: { read: vi.fn(async () => page()), edit } },
    });
    const preview = await publisher.previewChanges([
      {
        target: { type: 'page', id: 'd'.repeat(24), updated_at: '2026-01-01T00:00:00.000Z' },
        operation: { type: 'update_fields', patch: { tags: ['Not allowed'] } },
      },
    ]);

    expect(preview.changes[0]).toMatchObject({ can_apply: false });
    expect(preview.changes[0]?.warnings.join(' ')).toContain('Pages do not accept');
    expect(edit).not.toHaveBeenCalled();
  });

  it('preflights page batches and deploys exactly once only after complete success', async () => {
    const request = vi.fn(async () => new Response('', { status: 202 }));
    const read = vi.fn(async ({ id }) => page({ id }));
    const edit = vi.fn(async (input) => page(input));
    const publisher = new GhostPublisher(
      { ...baseConfig, deployHookUrl: 'https://deploy.example.com/hook' },
      { ghost: { pages: { read, edit } }, fetch: request },
    );
    const targets = [
      { id: 'd'.repeat(24), updated_at: '2026-01-01T00:00:00.000Z' },
      { id: 'e'.repeat(24), updated_at: '2026-01-01T00:00:00.000Z' },
    ];

    const result = await publisher.transitionPages(targets, 'published');

    expect(read).toHaveBeenCalledTimes(2);
    expect(edit).toHaveBeenCalledTimes(2);
    expect(request).toHaveBeenCalledTimes(1);
    expect(result.deploy?.accepted).toBe(true);

    const staleEdit = vi.fn();
    const staleRequest = vi.fn();
    const stale = new GhostPublisher(
      { ...baseConfig, deployHookUrl: 'https://deploy.example.com/hook' },
      {
        ghost: { pages: { read: vi.fn(async ({ id }) => page({ id, updated_at: 'newer' })), edit: staleEdit } },
        fetch: staleRequest,
      },
    );
    const rejected = await stale.transitionPages(targets, 'published');
    expect(rejected.failed).toHaveLength(2);
    expect(staleEdit).not.toHaveBeenCalled();
    expect(staleRequest).not.toHaveBeenCalled();
  });

  it('reports exact partial page writes and skips deployment after the first remote failure', async () => {
    const request = vi.fn();
    const edit = vi
      .fn()
      .mockResolvedValueOnce(page({ status: 'published' }))
      .mockRejectedValueOnce(new Error('Ghost unavailable'));
    const publisher = new GhostPublisher(
      { ...baseConfig, deployHookUrl: 'https://deploy.example.com/hook' },
      {
        ghost: { pages: { read: vi.fn(async ({ id }) => page({ id })), edit } },
        fetch: request,
      },
    );
    const result = await publisher.transitionPages(
      [
        { id: 'd'.repeat(24), updated_at: '2026-01-01T00:00:00.000Z' },
        { id: 'e'.repeat(24), updated_at: '2026-01-01T00:00:00.000Z' },
      ],
      'published',
    );

    expect(result.partial_failure).toBe(true);
    expect(result.succeeded).toHaveLength(1);
    expect(result.failed).toEqual([{ id: 'e'.repeat(24), error: 'Ghost unavailable' }]);
    expect(request).not.toHaveBeenCalled();
  });

  it('checks only server-selected current page URLs and rejects stale pages without fetching', async () => {
    const html =
      '<html><head><title>About SEO</title><meta name="description" content="About description"><link rel="canonical" href="https://site.example.com/about"></head><body><h1>About</h1></body></html>';
    const request = vi.fn(async () => new Response(html, { status: 200 }));
    const current = page({
      status: 'published',
      url: 'https://ghost.example.com/about/',
      canonical_url: 'https://site.example.com/about',
      meta_title: 'About SEO',
      meta_description: 'About description',
    });
    const publisher = new GhostPublisher(
      { ...baseConfig, publicPageUrlTemplate: 'https://site.example.com/{slug}' },
      {
        ghost: { pages: { read: vi.fn(async () => current) } },
        fetch: request,
        lookup: async () => [{ address: '93.184.216.34' }],
      },
    );

    const checks = await publisher.checkLivePages([
      { id: current.id, updated_at: current.updated_at },
    ]);

    expect(request).toHaveBeenCalledWith(
      'https://site.example.com/about',
      expect.objectContaining({ redirect: 'error' }),
    );
    expect(checks[0]).toMatchObject({
      verified: true,
      title_match: true,
      canonical_url_match: true,
      meta_title_match: true,
      meta_description_match: true,
    });

    const staleRequest = vi.fn();
    const stale = new GhostPublisher(baseConfig, {
      ghost: { pages: { read: vi.fn(async () => current) } },
      fetch: staleRequest,
    });
    const staleChecks = await stale.checkLivePages([{ id: current.id, updated_at: 'stale' }]);
    expect(staleChecks[0]).toMatchObject({ verified: false, error: 'Page changed since it was read' });
    expect(staleRequest).not.toHaveBeenCalled();

    const ghostHtml =
      '<html><head><title>About</title><link rel="canonical" href="https://ghost.example.com/about/"></head><body><h1>About</h1></body></html>';
    const ghostRequest = vi.fn(async () => new Response(ghostHtml, { status: 200 }));
    const ghostRendered = new GhostPublisher(baseConfig, {
      ghost: {
        pages: {
          read: vi.fn(async () =>
            page({ status: 'published', meta_title: null, meta_description: null, canonical_url: null }),
          ),
        },
      },
      fetch: ghostRequest,
      lookup: async () => [{ address: '93.184.216.34' }],
    });
    const ghostChecks = await ghostRendered.checkLivePages([
      { id: current.id, updated_at: current.updated_at },
    ]);
    expect(ghostRequest).toHaveBeenCalledWith(
      'https://ghost.example.com/about/',
      expect.objectContaining({ redirect: 'error' }),
    );
    expect(ghostChecks[0]?.verified).toBe(true);
  });

  it('checks Ghost, delivery, and feature-image surfaces separately without writing', async () => {
    const current = post({
      status: 'published',
      title: 'Launch post',
      slug: 'launch',
      url: 'https://ghost.example.com/launch/',
      feature_image: 'https://images.example.com/launch.png',
      canonical_url: null,
    });
    const mutations = [vi.fn(), vi.fn(), vi.fn(), vi.fn()];
    const [edit, add, remove, upload] = mutations;
    const request = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      void init;
      const url = new URL(input.toString());
      if (url.hostname === 'images.example.com') {
        return new Response('', { status: 200, headers: { 'content-type': 'image/png', 'content-length': '1200' } });
      }
      if (url.pathname === '/sitemap.xml') {
        return new Response('<?xml version="1.0"?><urlset/>', { status: 200, headers: { 'content-type': 'application/xml' } });
      }
      if (url.pathname === '/launch/' || url.pathname === '/posts/launch') {
        const portal = url.hostname === 'ghost.example.com' ? '<script src="/public/portal.min.js"></script>' : '';
        return new Response(
          `<html><head><link rel="canonical" href="${url.toString()}"></head><body><h1>Launch post</h1><button data-ghost-share>Share</button>${portal}</body></html>`,
          { status: 200, headers: { 'content-type': 'text/html' } },
        );
      }
      return new Response('<html><body>Home</body></html>', { status: 200, headers: { 'content-type': 'text/html' } });
    });
    const publisher = new GhostPublisher(
      { ...baseConfig, publicPostUrlTemplate: 'https://delivery.example.com/posts/{slug}' },
      {
        ghost: {
          site: { read: vi.fn(async () => ({ title: 'Fixture', url: 'https://ghost.example.com/', version: '6.7.0' })) },
          posts: { read: vi.fn(async () => current), edit, add, delete: remove },
          images: { upload },
        },
        fetch: request,
        lookup: async () => [{ address: '93.184.216.34' }],
      },
    );

    const report = await publisher.checkSiteHealth({ posts: [{ id: current.id, updated_at: current.updated_at }] });
    const targetChecks = report.checks.filter((check) => check.code === 'TARGET_PUBLIC_HTTP');

    expect(targetChecks.map((check) => check.surface).sort()).toEqual(['delivery', 'ghost']);
    expect(report.checks).toContainEqual(expect.objectContaining({ code: 'SHARE_PORTAL_PREREQUISITE_MISSING', surface: 'delivery', result: 'warning' }));
    expect(report.checks).not.toContainEqual(expect.objectContaining({ code: 'SHARE_PORTAL_PREREQUISITE_MISSING', surface: 'ghost' }));
    expect(report.checks).toContainEqual(expect.objectContaining({ code: 'FEATURE_IMAGE_HTTP', surface: 'media', result: 'pass' }));
    expect(report.checks).toContainEqual(expect.objectContaining({ code: 'FEATURE_IMAGE_CONTENT_TYPE', result: 'pass' }));
    expect(report.summary.unavailable).toBe(2);
    expect(request).toHaveBeenCalledTimes(7);
    for (const call of request.mock.calls) expect(call[1]).toMatchObject({ method: 'GET', redirect: 'manual' });
    for (const mutation of mutations) expect(mutation).not.toHaveBeenCalled();
  });

  it('reports the controlled Ghost 6 extension-route fixture and never follows redirects', async () => {
    const current = post({
      status: 'published',
      title: 'Legacy route',
      slug: 'legacy.html',
      url: 'https://ghost.example.com/legacy.html',
    });
    const request = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      void init;
      const url = new URL(input.toString());
      if (url.pathname === '/legacy.html') {
        return new Response('', { status: 404, headers: { location: 'https://elsewhere.example.com/' } });
      }
      if (url.pathname === '/sitemap.xml') {
        return new Response('<urlset/>', { status: 200, headers: { 'content-type': 'text/xml' } });
      }
      return new Response('Home', { status: 200, headers: { 'content-type': 'text/html' } });
    });
    const publisher = new GhostPublisher(baseConfig, {
      ghost: {
        site: { read: vi.fn(async () => ({ title: 'Ghost 6', url: baseConfig.ghostUrl, version: '6.0.0' })) },
        posts: { read: vi.fn(async () => current) },
      },
      fetch: request,
      lookup: async () => [{ address: '93.184.216.34' }],
    });

    const report = await publisher.checkSiteHealth({ posts: [{ id: current.id, updated_at: current.updated_at }] });

    expect(report.checks).toContainEqual(expect.objectContaining({ code: 'ROUTE_EXTENSION_404_GHOST6', result: 'fail' }));
    expect(JSON.stringify(report)).not.toContain('elsewhere.example.com');
    expect(request.mock.calls.find(([url]) => String(url).endsWith('/legacy.html'))?.[1]).toMatchObject({ redirect: 'manual' });
  });

  it('enforces site-health target, request, DNS, size, and concurrency bounds', async () => {
    const rows = new Map(
      Array.from({ length: 5 }, (_, index) => {
        const id = String(index + 1).repeat(24);
        return [id, post({ id, status: 'published', slug: `post-${index}`, url: `https://ghost.example.com/post-${index}/`, feature_image: `https://images.example.com/${index}.png` })];
      }),
    );
    const targetRows = [...rows.values()];
    const ceilingRequest = vi.fn();
    const ceiling = new GhostPublisher(
      {
        ...baseConfig,
        publicPostUrlTemplate: 'https://delivery.example.com/posts/{slug}',
        publicPageUrlTemplate: 'https://pages.example.com/{slug}',
      },
      {
        ghost: {
          site: { read: vi.fn(async () => ({ title: 'Fixture', url: baseConfig.ghostUrl, version: '6.0.0' })) },
          posts: { read: vi.fn(async ({ id }) => rows.get(id)) },
        },
        fetch: ceilingRequest,
        lookup: async () => [{ address: '93.184.216.34' }],
      },
    );
    const five = targetRows.map((row) => ({ id: row.id, updated_at: row.updated_at }));
    await expect(ceiling.checkSiteHealth({ posts: five })).rejects.toThrow('twenty-request ceiling');
    await expect(ceiling.checkSiteHealth({ posts: [...five, five[0]!] })).rejects.toThrow('at most five');
    expect(ceilingRequest).not.toHaveBeenCalled();

    const privateRequest = vi.fn();
    const privatePublisher = new GhostPublisher(baseConfig, {
      ghost: { site: { read: vi.fn(async () => ({ title: 'Private', url: 'https://private.example.com' })) } },
      fetch: privateRequest,
      lookup: async () => [{ address: '10.0.0.8' }],
    });
    await expect(privatePublisher.checkSiteHealth({})).rejects.toThrow('private or loopback');
    expect(privateRequest).not.toHaveBeenCalled();

    const credentialPublisher = new GhostPublisher(baseConfig, {
      ghost: { site: { read: vi.fn(async () => ({ title: 'Credential', url: 'https://user:secret@public.example.com' })) } },
      fetch: vi.fn(),
      lookup: async () => [{ address: '93.184.216.34' }],
    });
    await expect(credentialPublisher.checkSiteHealth({})).rejects.toThrow('must not contain credentials');

    const redirectRequest = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      void init;
      return new Response('', { status: String(input).endsWith('/sitemap.xml') ? 200 : 302, headers: { location: 'https://redirect.example.com/private' } });
    });
    const redirectPublisher = new GhostPublisher(baseConfig, {
      ghost: { site: { read: vi.fn(async () => ({ title: 'Redirect', url: baseConfig.ghostUrl })) } },
      fetch: redirectRequest,
      lookup: async () => [{ address: '93.184.216.34' }],
    });
    const redirectReport = await redirectPublisher.checkSiteHealth({});
    expect(redirectReport.checks).toContainEqual(expect.objectContaining({ code: 'SITE_HOMEPAGE_HTTP', result: 'fail' }));
    expect(JSON.stringify(redirectReport)).not.toContain('redirect.example.com');
    for (const call of redirectRequest.mock.calls) expect(call[1]).toMatchObject({ redirect: 'manual' });

    const timeoutRequest = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      void input;
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      throw new DOMException('Timed out', 'TimeoutError');
    });
    const timeoutPublisher = new GhostPublisher(baseConfig, {
      ghost: { site: { read: vi.fn(async () => ({ title: 'Timeout', url: baseConfig.ghostUrl })) } },
      fetch: timeoutRequest,
      lookup: async () => [{ address: '93.184.216.34' }],
    });
    const timeoutReport = await timeoutPublisher.checkSiteHealth({});
    expect(timeoutReport.summary.unavailable).toBeGreaterThan(0);
    expect(timeoutRequest).toHaveBeenCalledTimes(2);

    const oversizedPublisher = new GhostPublisher(baseConfig, {
      ghost: { site: { read: vi.fn(async () => ({ title: 'Large', url: baseConfig.ghostUrl })) } },
      fetch: vi.fn(async () => new Response('', { status: 200, headers: { 'content-length': String(2 * 1024 * 1024 + 1) } })),
      lookup: async () => [{ address: '93.184.216.34' }],
    });
    await expect(oversizedPublisher.checkSiteHealth({})).rejects.toThrow('2 MB');

    let active = 0;
    let maximum = 0;
    const concurrent = new GhostPublisher(
      { ...baseConfig, publicPostUrlTemplate: 'https://delivery.example.com/posts/{slug}' },
      {
        ghost: {
          site: { read: vi.fn(async () => ({ title: 'Bounded', url: baseConfig.ghostUrl })) },
          posts: { read: vi.fn(async () => targetRows[0]) },
        },
        fetch: vi.fn(async (input: string | URL | Request) => {
          active += 1;
          maximum = Math.max(maximum, active);
          await new Promise((resolve) => setTimeout(resolve, 2));
          active -= 1;
          const xml = new URL(input.toString()).pathname === '/sitemap.xml';
          return new Response(xml ? '<urlset/>' : '<html><head></head><body>Body</body></html>', {
            status: 200,
            headers: { 'content-type': xml ? 'application/xml' : 'text/html' },
          });
        }),
        lookup: async () => [{ address: '93.184.216.34' }],
      },
    );
    await concurrent.checkSiteHealth({ posts: [five[0]!] });
    expect(maximum).toBeLessThanOrEqual(4);
  });

  it('rejects Ghost-returned private page URLs before fetching', async () => {
    const request = vi.fn();
    const direct = new GhostPublisher(baseConfig, {
      ghost: { pages: { read: vi.fn(async () => page({ status: 'published', url: 'https://127.0.0.1/private' })) } },
      fetch: request,
    });
    const directResult = await direct.checkLivePages([
      { id: 'd'.repeat(24), updated_at: '2026-01-01T00:00:00.000Z' },
    ]);
    expect(directResult[0]).toMatchObject({ verified: false, error: 'Public URL resolves to a private or loopback address' });

    const resolved = new GhostPublisher(baseConfig, {
      ghost: { pages: { read: vi.fn(async () => page({ status: 'published', url: 'https://internal.example/page' })) } },
      fetch: request,
      lookup: async () => [{ address: '10.0.0.8' }],
    });
    const resolvedResult = await resolved.checkLivePages([
      { id: 'd'.repeat(24), updated_at: '2026-01-01T00:00:00.000Z' },
    ]);
    expect(resolvedResult[0]).toMatchObject({ verified: false, error: 'Public URL resolves to a private or loopback address' });
    expect(request).not.toHaveBeenCalled();
  });

  it('caps live-check response bodies', async () => {
    const oversized = 'x'.repeat(2 * 1024 * 1024 + 1);
    const postRequest = vi.fn(async () => new Response(oversized, { status: 200 }));
    const postPublisher = new GhostPublisher(
      { ...baseConfig, publicPostUrlTemplate: 'https://site.example.com/{slug}' },
      { ghost: {}, fetch: postRequest, lookup: async () => [{ address: '93.184.216.34' }] },
    );
    const postResult = await postPublisher.checkLivePosts([{ slug: 'large', title: 'Large' }]);
    expect(postResult[0]).toMatchObject({ verified: false, error: 'Live response exceeds the 2 MB limit' });

    const pageRequest = vi.fn(async () =>
      new Response('', { status: 200, headers: { 'content-length': String(2 * 1024 * 1024 + 1) } }),
    );
    const pagePublisher = new GhostPublisher(
      { ...baseConfig, publicPageUrlTemplate: 'https://site.example.com/{slug}' },
      {
        ghost: { pages: { read: vi.fn(async () => page({ status: 'published' })) } },
        fetch: pageRequest,
        lookup: async () => [{ address: '93.184.216.34' }],
      },
    );
    const pageResult = await pagePublisher.checkLivePages([
      { id: 'd'.repeat(24), updated_at: '2026-01-01T00:00:00.000Z' },
    ]);
    expect(pageResult[0]).toMatchObject({ verified: false, error: 'Live response exceeds the 2 MB limit' });
  });

  it('allows image files only inside configured roots and blocks symlink escapes', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'ghost-publisher-root-'));
    const outside = await mkdtemp(path.join(tmpdir(), 'ghost-publisher-outside-'));
    temporary.push(root, outside);
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZJ3gAAAAASUVORK5CYII=',
      'base64',
    );
    const valid = path.join(root, 'valid.png');
    const secret = path.join(outside, 'secret.png');
    const escaped = path.join(root, 'escaped.png');
    await writeFile(valid, png);
    await writeFile(secret, png);
    await symlink(secret, escaped);
    const upload = vi.fn(async () => ({ url: 'https://ghost.example.com/content/images/valid.png' }));
    const add = vi.fn(async (input: Record<string, unknown>) => post(input));
    const publisher = new GhostPublisher(
      { ...baseConfig, uploadRoots: [root] },
      {
        ghost: {
          images: { upload },
          posts: { read: vi.fn(async () => Promise.reject(new Error('404 Not Found'))), add },
        },
      },
    );

    const uploaded = await publisher.uploadImage(valid);
    expect(uploaded).toMatchObject({ source: 'upload', mime_type: 'image/png' });
    await expect(
      publisher.createDrafts([
        {
          title: 'Image draft',
          blocks: [
            {
              type: 'image',
              src: uploaded.url,
              alt: 'One pixel',
              caption: '**Uploaded safely** <script>alert(1)</script>',
              width: 1,
              height: 1,
              card_width: 'wide',
              href: 'https://ghost.org',
            },
          ],
        },
      ]),
    ).resolves.toMatchObject({ succeeded: [expect.objectContaining({ status: 'draft' })] });
    expect(JSON.parse(String(add.mock.calls[0]?.[0]?.lexical)).root.children[0]).toMatchObject({
      type: 'image',
      src: uploaded.url,
      alt: 'One pixel',
      width: 1,
      height: 1,
      cardWidth: 'wide',
      href: 'https://ghost.org/',
    });
    expect(JSON.parse(String(add.mock.calls[0]?.[0]?.lexical)).root.children[0].caption).toContain('&lt;script&gt;');
    await expect(publisher.uploadImage(escaped)).rejects.toThrow('outside GHOST_UPLOAD_ROOTS');
  });

});
