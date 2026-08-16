import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import type { Config } from '../src/config.js';
import { GhostPublisher } from '../src/publisher.js';
import { createServer } from '../src/server.js';

const id = 'a'.repeat(24);
const updatedAt = '2026-01-01T00:00:00.000Z';
const config: Config = {
  ghostUrl: 'https://ghost.example.com',
  ghostAdminApiKey: `${'a'.repeat(24)}:${'b'.repeat(64)}`,
  ghostApiVersion: 'v5.0',
  permissionProfile: 'publisher',
  readOnly: false,
  uploadRoots: [],
};

function post(status: 'draft' | 'published' | 'scheduled' = 'published') {
  return {
    id,
    title: 'Published post',
    slug: 'published-post',
    status,
    updated_at: updatedAt,
    tags: [],
    html: '<p>Body</p>',
    lexical: '{"root":{"type":"root","children":[]}}',
  };
}

async function connect(publisher: GhostPublisher) {
  const server = createServer(publisher);
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, server };
}

describe('MCP contract', () => {
  it('keeps the package, Registry metadata, and initialized server version identical', async () => {
    const packageMetadata = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    const registryMetadata = JSON.parse(await readFile(new URL('../server.json', import.meta.url), 'utf8'));
    const publisher = new GhostPublisher(
      { ...config, permissionProfile: 'read-only', readOnly: true },
      { ghost: { site: { read: async () => ({}) } } },
    );
    const { client, server } = await connect(publisher);

    expect(registryMetadata.version).toBe(packageMetadata.version);
    expect(registryMetadata.packages[0].version).toBe(packageMetadata.version);
    expect(client.getServerVersion()?.version).toBe(packageMetadata.version);

    await client.close();
    await server.close();
  });

  it('advertises the publisher profile, requires literal destructive confirmation, and redacts errors', async () => {
    const edit = vi.fn(async () => {
      throw new Error(`Ghost rejected ${config.ghostAdminApiKey}`);
    });
    const publisher = new GhostPublisher(config, {
      ghost: {
        site: { read: async () => ({ title: 'Test Ghost', url: 'https://ghost.example.com' }) },
        posts: { read: async () => post(), edit },
      },
    });
    const { client, server } = await connect(publisher);

    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name).sort()).toEqual(
      [
        'check_connection',
        'list_posts',
        'get_post',
        'list_tags',
        'list_authors',
        'list_pages',
        'get_page',
        'preview_changes',
        'audit_content',
        'plan_schedule',
        'create_drafts',
        'create_page_drafts',
        'apply_change_set',
        'upload_image',
        'publish_posts',
        'unpublish_posts',
        'publish_pages',
        'unpublish_pages',
        'schedule_posts',
        'unschedule_posts',
        'trigger_deploy',
        'check_live_posts',
        'check_live_pages',
        'check_site_health',
      ].sort(),
    );
    expect(tools.tools.map((tool) => tool.name)).not.toContain('generate_image');
    expect(tools.tools.map((tool) => tool.name)).toContain('publish_posts');
    expect(tools.tools.map((tool) => tool.name)).toContain('publish_pages');
    expect(tools.tools.find((tool) => tool.name === 'apply_change_set')?.annotations).toMatchObject({
      destructiveHint: true,
    });
    for (const name of [
      'apply_change_set',
      'publish_posts',
      'unpublish_posts',
      'schedule_posts',
      'unschedule_posts',
      'publish_pages',
      'unpublish_pages',
      'trigger_deploy',
    ]) {
      const schema = JSON.stringify(tools.tools.find((tool) => tool.name === name)?.inputSchema);
      expect(schema).toContain('user_confirmed');
      expect(schema).toContain('true');
    }
    const applySchema = tools.tools.find((tool) => tool.name === 'apply_change_set')?.inputSchema;
    expect(JSON.stringify(applySchema)).toContain('preview_hash');
    expect(JSON.stringify(applySchema)).toContain('scopes');
    expect(JSON.stringify(applySchema)).toContain('append_section');
    expect(JSON.stringify(applySchema)).toContain('replace_exact_text');
    expect(JSON.stringify(tools.tools.find((tool) => tool.name === 'schedule_posts')?.inputSchema)).toContain(
      'plan_hash',
    );
    expect(tools.tools.map((tool) => tool.name)).not.toContain('update_draft');
    const draftCreateSchema = JSON.stringify(tools.tools.find((tool) => tool.name === 'create_drafts')?.inputSchema);
    for (const capability of ['list', 'quote', 'codeblock', 'image', 'bookmark', 'bold', 'italic', 'code', 'link']) {
      expect(draftCreateSchema).toContain(capability);
    }
    const pageCreateSchema = tools.tools.find((tool) => tool.name === 'create_page_drafts')?.inputSchema;
    expect(JSON.stringify(pageCreateSchema)).toContain('blocks');
    expect(JSON.stringify(pageCreateSchema)).not.toContain('tags');
    expect(JSON.stringify(pageCreateSchema)).not.toContain('authors');
    expect(JSON.stringify(pageCreateSchema)).not.toContain('featured');
    const healthTool = tools.tools.find((tool) => tool.name === 'check_site_health');
    expect(healthTool?.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    expect(Object.keys((healthTool?.inputSchema as { properties: Record<string, unknown> }).properties).sort()).toEqual([
      'pages',
      'posts',
    ]);
    expect(JSON.stringify(healthTool?.inputSchema)).not.toMatch(/caller_url|hostname|method|crawl/i);

    const arbitraryUrl = await client.callTool({
      name: 'check_site_health',
      arguments: { url: 'https://attacker.example.com' },
    });
    expect(arbitraryUrl.isError).toBe(true);

    const result = await client.callTool({ name: 'check_connection', arguments: {} });
    expect(result.structuredContent).toMatchObject({
      site: { title: 'Test Ghost' },
      configuration: { permission_profile: 'publisher', read_only: false, deploy_hook_configured: false },
    });

    const loaded = await client.callTool({ name: 'get_post', arguments: { id_or_slug: 'published-post' } });
    expect(loaded.structuredContent).toMatchObject({
      post: {
        title: 'Published post',
        custom_excerpt: null,
        feature_image: null,
        meta_title: null,
        meta_description: null,
        canonical_url: null,
        og_title: null,
        twitter_title: null,
      },
    });

    const change = {
      target: { type: 'post', id, updated_at: updatedAt },
      operation: { type: 'update_fields', patch: { meta_title: 'Valid patch with a simulated Ghost failure' } },
    };
    const preview = await client.callTool({ name: 'preview_changes', arguments: { changes: [change] } });
    const previewHash = (preview.structuredContent as { preview_hash: string }).preview_hash;
    for (const user_confirmed of [undefined, false, 'true']) {
      const rejected = await client.callTool({
        name: 'apply_change_set',
        arguments: {
          changes: [change],
          preview_hash: previewHash,
          scopes: { metadata: true },
          ...(user_confirmed === undefined ? {} : { user_confirmed }),
        },
      });
      expect(rejected.isError).toBe(true);
    }
    expect(edit).not.toHaveBeenCalled();

    const failedUpdate = await client.callTool({
      name: 'apply_change_set',
      arguments: {
        changes: [change],
        preview_hash: previewHash,
        scopes: { metadata: true },
        user_confirmed: true,
      },
    });
    expect(failedUpdate.isError).toBe(true);
    expect(edit).toHaveBeenCalledOnce();
    expect(JSON.stringify(failedUpdate.structuredContent)).toContain('[REDACTED]');
    expect(failedUpdate.structuredContent).toMatchObject({
      failed: [
        expect.objectContaining({
          status: 'failed',
          write_attempted: true,
          revision_requested: true,
          before_snapshot: expect.objectContaining({ id }),
        }),
      ],
    });
    expect(JSON.stringify(failedUpdate)).not.toContain(config.ghostAdminApiKey);

    const publishAccepted = await client.callTool({
      name: 'publish_posts',
      arguments: { posts: [{ id, updated_at: updatedAt }], user_confirmed: true },
    });
    expect(JSON.stringify(publishAccepted.content)).not.toContain('Invalid arguments');
    const unpublishAccepted = await client.callTool({
      name: 'unpublish_posts',
      arguments: { posts: [{ id, updated_at: updatedAt }], user_confirmed: true },
    });
    expect(JSON.stringify(unpublishAccepted.content)).not.toContain('Invalid arguments');
    const deployAccepted = await client.callTool({
      name: 'trigger_deploy',
      arguments: { user_confirmed: true },
    });
    expect(JSON.stringify(deployAccepted.content)).not.toContain('Invalid arguments');
    const scheduleAccepted = await client.callTool({
      name: 'schedule_posts',
      arguments: {
        posts: [{ id, updated_at: updatedAt, published_at: '2099-01-01T00:00:00.000Z' }],
        plan_hash: 'a'.repeat(43),
        user_confirmed: true,
      },
    });
    expect(JSON.stringify(scheduleAccepted.content)).not.toContain('Invalid arguments');
    const unscheduleAccepted = await client.callTool({
      name: 'unschedule_posts',
      arguments: { posts: [{ id, updated_at: updatedAt }], user_confirmed: true },
    });
    expect(JSON.stringify(unscheduleAccepted.content)).not.toContain('Invalid arguments');

    await client.close();
    await server.close();
  });

  it('advertises exactly thirteen tools in read-only mode', async () => {
    const publisher = new GhostPublisher(
      { ...config, permissionProfile: 'read-only', readOnly: true },
      { ghost: { site: { read: async () => ({}) }, posts: {}, tags: {} } },
    );
    const { client, server } = await connect(publisher);

    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name).sort()).toEqual(
      [
        'check_connection',
        'list_posts',
        'get_post',
        'list_tags',
        'list_authors',
        'check_live_posts',
        'list_pages',
        'get_page',
        'preview_changes',
        'audit_content',
        'plan_schedule',
        'check_live_pages',
        'check_site_health',
      ].sort(),
    );

    expect(client.getServerCapabilities()?.prompts).toBeDefined();
    expect((await client.listPrompts()).prompts).toEqual([
      expect.objectContaining({ name: 'ghost_publication_doctor', arguments: undefined }),
    ]);

    await client.close();
    await server.close();
  });

  it.each([
    [
      'draft-editor',
      ['apply_change_set', 'create_drafts', 'create_page_drafts', 'upload_image'],
    ],
    [
      'scheduler',
      ['apply_change_set', 'create_drafts', 'create_page_drafts', 'schedule_posts', 'unschedule_posts', 'upload_image'],
    ],
  ] as const)('enforces the exact %s capability surface', async (permissionProfile, writes) => {
    const publisher = new GhostPublisher(
      { ...config, permissionProfile },
      { ghost: { site: { read: async () => ({}) } } },
    );
    const { client, server } = await connect(publisher);
    const tools = await client.listTools();
    const always = [
      'check_connection',
      'list_posts',
      'get_post',
      'list_tags',
      'list_authors',
      'list_pages',
      'get_page',
      'preview_changes',
      'audit_content',
      'plan_schedule',
      'check_live_posts',
      'check_live_pages',
      'check_site_health',
    ];
    expect(tools.tools.map((tool) => tool.name).sort()).toEqual([...always, ...writes].sort());
    expect(client.getServerCapabilities()?.prompts).toBeDefined();
    expect((await client.listPrompts()).prompts).toEqual([
      expect.objectContaining({ name: 'ghost_publication_doctor', arguments: undefined }),
    ]);
    await client.close();
    await server.close();
  });

  it('exposes proposal-only mechanical audit and timezone schedule planning', async () => {
    const edit = vi.fn();
    const publisher = new GhostPublisher(
      { ...config, permissionProfile: 'read-only', readOnly: true },
      { ghost: { posts: { read: vi.fn(async () => post('draft')), edit } } },
    );
    const { client, server } = await connect(publisher);
    const target = { type: 'post', id, updated_at: updatedAt };

    const audit = await client.callTool({ name: 'audit_content', arguments: { targets: [target] } });
    expect(audit.isError).not.toBe(true);
    expect(JSON.stringify(audit.structuredContent)).not.toMatch(/quality|truth|score/i);
    const plan = await client.callTool({
      name: 'plan_schedule',
      arguments: {
        posts: [{ id, updated_at: updatedAt }],
        start_local: '2026-08-03T10:00:00',
        timezone: 'Europe/Istanbul',
        interval_hours: 24,
      },
    });
    expect(plan.structuredContent).toMatchObject({
      newsletter: false,
      headless_visibility: 'unverified',
      posts: [{ local_time: '2026-08-03T10:00:00', published_at: '2026-08-03T07:00:00Z' }],
    });
    expect(edit).not.toHaveBeenCalled();
    await client.close();
    await server.close();
  });

  it('advertises three zero-argument prompts with portable safety workflows in normal mode', async () => {
    const publisher = new GhostPublisher(config, {
      ghost: { site: { read: async () => ({}) } },
    });
    const { client, server } = await connect(publisher);

    expect(client.getServerCapabilities()?.prompts).toBeDefined();
    const prompts = await client.listPrompts();
    expect(prompts.prompts).toEqual([
      expect.objectContaining({ name: 'ghost_safe_publish', arguments: undefined }),
      expect.objectContaining({ name: 'ghost_seo_optimize', arguments: undefined }),
      expect.objectContaining({ name: 'ghost_publication_doctor', arguments: undefined }),
    ]);

    const safePublish = await client.getPrompt({ name: 'ghost_safe_publish' });
    expect(safePublish.messages).toHaveLength(1);
    expect(safePublish.messages[0]?.role).toBe('user');
    expect(JSON.stringify(safePublish.messages[0]?.content)).toContain('never both');
    expect(JSON.stringify(safePublish.messages[0]?.content)).toContain('Stop for explicit approval');
    expect(JSON.stringify(safePublish.messages[0]?.content)).toContain('Never call trigger_deploy');
    expect(JSON.stringify(safePublish.messages[0]?.content)).toContain('live_check_configured: true');
    expect(JSON.stringify(safePublish.messages[0]?.content)).toContain('without repeating any write');
    expect(JSON.stringify(safePublish.messages[0]?.content)).toContain('at most three attempts over two minutes');

    const seoOptimize = await client.getPrompt({ name: 'ghost_seo_optimize' });
    expect(seoOptimize.messages).toHaveLength(1);
    expect(seoOptimize.messages[0]?.role).toBe('user');
    expect(JSON.stringify(seoOptimize.messages[0]?.content)).toContain('untrusted evidence');
    expect(JSON.stringify(seoOptimize.messages[0]?.content)).toContain('Stop for explicit approval');
    expect(JSON.stringify(seoOptimize.messages[0]?.content)).toContain('Never propose replace_body');
    expect(JSON.stringify(seoOptimize.messages[0]?.content)).toContain('read-only heuristic proposal');
    expect(JSON.stringify(seoOptimize.messages[0]?.content)).toContain('50-page audit without Lighthouse');
    expect(JSON.stringify(seoOptimize.messages[0]?.content)).toContain('at most 10 queries');
    expect(JSON.stringify(seoOptimize.messages[0]?.content)).toContain('at most three ambiguous SERPs');
    expect(JSON.stringify(seoOptimize.messages[0]?.content)).toContain('Never call save_keywords');
    expect(JSON.stringify(seoOptimize.messages[0]?.content)).toContain('canonical host or path change');
    expect(JSON.stringify(seoOptimize.messages[0]?.content)).toContain('tags, authors, featured, status');
    expect(JSON.stringify(seoOptimize.messages[0]?.content)).toContain('preview_changes');
    expect(JSON.stringify(seoOptimize.messages[0]?.content)).toContain('apply_change_set');
    expect(JSON.stringify(seoOptimize.messages[0]?.content)).toContain('before snapshot');
    expect(JSON.stringify(seoOptimize.messages[0]?.content)).toContain('captured HTML and Lexical body');
    expect(JSON.stringify(seoOptimize.messages[0]?.content)).toContain('live_check_configured: true');
    expect(JSON.stringify(seoOptimize.messages[0]?.content)).toContain('trigger_deploy exactly once');

    const doctor = await client.getPrompt({ name: 'ghost_publication_doctor' });
    const doctorText = JSON.stringify(doctor.messages[0]?.content);
    expect(doctorText).toContain('untrusted evidence');
    expect(doctorText).toContain('at most five');
    expect(doctorText).toContain('check_site_health');
    expect(doctorText).toContain('stop before remediation');
    expect(doctorText).toContain('preview_changes');
    expect(doctorText).toContain('apply_change_set');
    expect(doctorText).toContain('Never publish');

    await client.close();
    await server.close();
  });

  it('rejects absent or false confirmation on every destructive tool before side effects', async () => {
    const read = vi.fn(async () => post('draft'));
    const edit = vi.fn(async () => post('published'));
    const request = vi.fn(async () => new Response('', { status: 202 }));
    const publisher = new GhostPublisher(
      { ...config, deployHookUrl: 'https://deploy.example.com/private?token=hidden' },
      { ghost: { posts: { read, edit } }, fetch: request },
    );
    const { client, server } = await connect(publisher);
    const calls = [
      {
        name: 'apply_change_set',
        arguments: {
          changes: [
            {
              target: { type: 'post', id, updated_at: updatedAt },
              operation: { type: 'update_fields', patch: { meta_title: 'No write' } },
            },
          ],
          preview_hash: 'a'.repeat(43),
          scopes: { metadata: true },
        },
      },
      { name: 'publish_posts', arguments: { posts: [{ id, updated_at: updatedAt }] } },
      { name: 'unpublish_posts', arguments: { posts: [{ id, updated_at: updatedAt }] } },
      {
        name: 'schedule_posts',
        arguments: {
          posts: [{ id, updated_at: updatedAt, published_at: '2099-01-01T00:00:00.000Z' }],
          plan_hash: 'a'.repeat(43),
        },
      },
      { name: 'unschedule_posts', arguments: { posts: [{ id, updated_at: updatedAt }] } },
      { name: 'publish_pages', arguments: { pages: [{ id, updated_at: updatedAt }] } },
      { name: 'unpublish_pages', arguments: { pages: [{ id, updated_at: updatedAt }] } },
      { name: 'trigger_deploy', arguments: {} },
    ];

    for (const call of calls) {
      for (const confirmation of [undefined, false]) {
        const result = await client.callTool({
          name: call.name,
          arguments: { ...call.arguments, ...(confirmation === undefined ? {} : { user_confirmed: confirmation }) },
        });
        expect(result.isError).toBe(true);
        expect(JSON.stringify(result.content)).toContain('Invalid arguments');
      }
    }
    expect(read).not.toHaveBeenCalled();
    expect(edit).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();

    await client.close();
    await server.close();
  });

  it('rejects caller-provided live URLs before network access', async () => {
    const read = vi.fn(async () => ({ ...post('draft'), tags: undefined }));
    const edit = vi.fn(async (input: Record<string, unknown>) => ({ ...post('draft'), ...input }));
    const request = vi.fn();
    const publisher = new GhostPublisher(config, {
      ghost: { pages: { read, edit } },
      fetch: request,
    });
    const { client, server } = await connect(publisher);

    const rejectedUrl = await client.callTool({
      name: 'check_live_pages',
      arguments: {
        pages: [{ id, updated_at: updatedAt, url: 'https://attacker.example/private' }],
      },
    });

    expect(rejectedUrl.isError).toBe(true);
    expect(JSON.stringify(rejectedUrl.content)).toContain('Invalid arguments');
    expect(read).not.toHaveBeenCalled();
    expect(edit).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();

    await client.close();
    await server.close();
  });

  it('accepts exact Ghost 5 legacy author IDs and rejects empty, duplicate, or malformed author arrays', async () => {
    const add = vi.fn(async (input: Record<string, unknown>) => ({ ...post('draft'), ...input }));
    const publisher = new GhostPublisher(config, {
      ghost: {
        posts: {
          read: vi.fn(async () => Promise.reject(new Error('404 not found'))),
          add,
        },
      },
    });
    const { client, server } = await connect(publisher);

    for (const authors of [[], ['1', '1'], ['not-an-author-id']]) {
      const rejected = await client.callTool({
        name: 'create_drafts',
        arguments: { posts: [{ title: 'Draft', markdown: '# Draft', authors }] },
      });
      expect(rejected.isError).toBe(true);
      expect(JSON.stringify(rejected.content)).toContain('Invalid arguments');
    }
    expect(add).not.toHaveBeenCalled();

    const accepted = await client.callTool({
      name: 'create_drafts',
      arguments: { posts: [{ title: 'Draft', markdown: '# Draft', authors: ['1'] }] },
    });
    expect(accepted.isError).not.toBe(true);
    expect(add.mock.calls[0]?.[0]).toMatchObject({ authors: [{ id: '1' }] });

    await client.close();
    await server.close();
  });

  it('requires exactly one safe body format for draft creation', async () => {
    const add = vi.fn(async (input: Record<string, unknown>) => ({ ...post('draft'), ...input }));
    const publisher = new GhostPublisher(config, {
      ghost: {
        posts: {
          read: vi.fn(async () => Promise.reject(new Error('404 not found'))),
          add,
        },
      },
    });
    const { client, server } = await connect(publisher);

    for (const draft of [
      { title: 'Missing' },
      { title: 'Duplicate', markdown: 'Body', blocks: [{ type: 'paragraph', text: 'Body' }] },
      { title: 'Unsafe', blocks: [{ type: 'button', text: 'Run', url: 'javascript:alert(1)' }] },
      { title: 'Unsafe inline', blocks: [{ type: 'paragraph', text: [{ text: 'Run', link: 'javascript:alert(1)' }] }] },
      { title: 'Credential link', blocks: [{ type: 'bookmark', url: 'https://user:pass@example.com', title: 'No' }] },
    ]) {
      const rejected = await client.callTool({ name: 'create_drafts', arguments: { posts: [draft] } });
      expect(rejected.isError).toBe(true);
      expect(JSON.stringify(rejected.content)).toContain('Invalid arguments');
    }
    expect(add).not.toHaveBeenCalled();

    const accepted = await client.callTool({
      name: 'create_drafts',
      arguments: { posts: [{ title: 'Native', blocks: [{ type: 'callout', text: 'Safe card' }] }] },
    });
    expect(accepted.isError).not.toBe(true);
    expect(JSON.parse(String(add.mock.calls[0]?.[0]?.lexical)).root.children[0]).toMatchObject({
      type: 'callout',
      calloutText: 'Safe card',
    });

    await client.close();
    await server.close();
  });

  it('returns structured deployment failures without hiding successful transitions', async () => {
    const request = vi.fn(async () => new Response('failed', { status: 503 }));
    const edit = vi.fn(async ({ status }: { status: string }) => post(status as 'draft' | 'published'));
    const publisher = new GhostPublisher(
      { ...config, deployHookUrl: 'https://deploy.example.com/build?secret=hidden' },
      { ghost: { posts: { read: async () => post('draft'), edit } }, fetch: request },
    );
    const { client, server } = await connect(publisher);

    const result = await client.callTool({
      name: 'publish_posts',
      arguments: { posts: [{ id, updated_at: updatedAt }], user_confirmed: true },
    });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      succeeded: [expect.objectContaining({ id, status: 'published' })],
      failed: [],
      partial_failure: false,
      deploy: {
        accepted: false,
        host: 'deploy.example.com',
        status: 503,
        error: 'Deploy hook returned HTTP 503',
      },
    });
    expect(request).toHaveBeenCalledOnce();
    expect(JSON.stringify(result)).not.toContain('secret=hidden');

    await client.close();
    await server.close();
  });
});
