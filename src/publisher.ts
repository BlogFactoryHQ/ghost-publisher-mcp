import { lookup } from 'node:dns/promises';
import { open, realpath } from 'node:fs/promises';
import { BlockList, isIP } from 'node:net';
import path from 'node:path';
import { Temporal } from '@js-temporal/polyfill';
import GhostAdminAPI from '@tryghost/admin-api';
import { fileTypeFromBuffer } from 'file-type';
import FormData from 'form-data';
import MarkdownIt from 'markdown-it';
import { canEditDraft, canPublish, canSchedule, redactSecrets, type Config } from './config.js';
import {
  canonicalJson,
  insertHtmlSection,
  lexicalHeadings,
  lexicalInventory,
  lexicalLinks,
  parseLexical,
  previewSignature,
  replaceUniqueText,
  sameSignature,
  signedPayload,
  scopeForField,
  snapshotHash,
  textCharacters,
} from './change-set.js';
import type {
  BatchResult,
  ChangePreview,
  ChangePreviewItem,
  ChangeRequest,
  ChangeScope,
  ContentSnapshot,
  DeployResult,
  DraftBlock,
  DraftFields,
  DraftInput,
  ImageAsset,
  PageInput,
  PageRef,
  PostRef,
} from './types.js';

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_LIVE_RESPONSE_BYTES = 2 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']);
const markdown = new MarkdownIt({ html: false, linkify: true, typographer: false });
const privateNetworks = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
] as const) {
  privateNetworks.addSubnet(address, prefix, 'ipv4');
}
for (const [address, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  privateNetworks.addSubnet(address, prefix, 'ipv6');
}

type Dependencies = {
  ghost?: any;
  fetch?: typeof fetch;
  lookup?: (hostname: string) => Promise<{ address: string }[]>;
};

type TransitionTarget = { id: string; updated_at: string };
type ScheduleTarget = TransitionTarget & { published_at: string };
type PostStatus = 'draft' | 'published' | 'scheduled';
type PostOrder = 'updated_at_desc' | 'updated_at_asc' | 'published_at_desc' | 'published_at_asc';

export function slugify(value: string): string {
  return value
    .toLocaleLowerCase('tr-TR')
    .replace(/[ç]/g, 'c')
    .replace(/[ğ]/g, 'g')
    .replace(/[ı]/g, 'i')
    .replace(/[ö]/g, 'o')
    .replace(/[ş]/g, 's')
    .replace(/[ü]/g, 'u')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 190);
}

function nql(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll("'", "\\'");
}

function errorMessage(error: unknown, config: Config): string {
  return redactSecrets(error instanceof Error ? error.message : String(error), config);
}

function isNotFound(error: unknown): boolean {
  const candidate = error as { response?: { status?: number; statusCode?: number }; message?: string };
  return (
    candidate.response?.status === 404 ||
    candidate.response?.statusCode === 404 ||
    /\b404\b|not found/i.test(candidate.message ?? '')
  );
}

function postRef(post: any): PostRef {
  return {
    id: String(post.id),
    title: String(post.title ?? ''),
    slug: String(post.slug ?? ''),
    status: String(post.status ?? ''),
    updated_at: String(post.updated_at ?? ''),
    tags: Array.isArray(post.tags) ? post.tags.map((tag: any) => String(tag.name)) : [],
    authors: Array.isArray(post.authors)
      ? post.authors.map((author: any) => ({
          id: String(author.id),
          name: String(author.name ?? ''),
          slug: String(author.slug ?? ''),
        }))
      : [],
    ...(post.url ? { url: String(post.url) } : {}),
    ...(post.published_at ? { published_at: String(post.published_at) } : {}),
    ...(post.custom_excerpt ? { custom_excerpt: String(post.custom_excerpt) } : {}),
  };
}

function pageRef(page: any): PageRef {
  return {
    id: String(page.id),
    title: String(page.title ?? ''),
    slug: String(page.slug ?? ''),
    status: String(page.status ?? ''),
    updated_at: String(page.updated_at ?? ''),
    ...(page.created_at ? { created_at: String(page.created_at) } : {}),
    ...(page.url ? { url: String(page.url) } : {}),
    ...(page.published_at ? { published_at: String(page.published_at) } : {}),
    ...(page.custom_excerpt ? { custom_excerpt: String(page.custom_excerpt) } : {}),
  };
}

function details<T extends PostRef | PageRef>(content: any, ref: T) {
  return {
    ...ref,
    html: String(content.html ?? ''),
    lexical: String(content.lexical ?? ''),
    feature_image: content.feature_image ? String(content.feature_image) : null,
    feature_image_alt: content.feature_image_alt == null ? null : String(content.feature_image_alt),
    feature_image_caption:
      content.feature_image_caption == null ? null : String(content.feature_image_caption),
    custom_excerpt: content.custom_excerpt == null ? null : String(content.custom_excerpt),
    meta_title: content.meta_title == null ? null : String(content.meta_title),
    meta_description: content.meta_description == null ? null : String(content.meta_description),
    canonical_url: content.canonical_url == null ? null : String(content.canonical_url),
    og_title: content.og_title == null ? null : String(content.og_title),
    og_description: content.og_description == null ? null : String(content.og_description),
    og_image: content.og_image == null ? null : String(content.og_image),
    twitter_title: content.twitter_title == null ? null : String(content.twitter_title),
    twitter_description:
      content.twitter_description == null ? null : String(content.twitter_description),
    twitter_image: content.twitter_image == null ? null : String(content.twitter_image),
  };
}

type GhostFieldInput = Partial<DraftFields> & {
  markdown?: string;
  blocks?: DraftBlock[];
};

function textNode(text: string) {
  return { type: 'extended-text', version: 1, detail: 0, format: 0, mode: 'normal', style: '', text };
}

function proseNode(type: 'paragraph' | 'extended-heading', text: string, tag?: 'h2' | 'h3') {
  return {
    type,
    version: 1,
    direction: 'ltr',
    format: '',
    indent: 0,
    ...(tag ? { tag } : {}),
    children: [textNode(text)],
  };
}

function blockUrl(value: string): string {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Button URL must use HTTP or HTTPS');
  return url.toString();
}

function draftLexical(blocks: DraftBlock[]): string {
  // ponytail: structured prose is plain text; add inline formatting or RTL detection only after a real pilot needs it.
  const children = blocks.map((block) => {
    if (block.type === 'paragraph') return proseNode('paragraph', block.text);
    if (block.type === 'heading') return proseNode('extended-heading', block.text, `h${block.level ?? 2}`);
    if (block.type === 'callout') {
      return {
        type: 'callout',
        version: 1,
        calloutText: markdown.renderInline(block.text),
        calloutEmoji: block.emoji ?? '💡',
        backgroundColor: block.color ?? 'blue',
      };
    }
    return {
      type: 'button',
      version: 1,
      buttonText: block.text,
      buttonUrl: blockUrl(block.url),
      alignment: block.alignment ?? 'center',
    };
  });
  return JSON.stringify({ root: { type: 'root', version: 1, direction: 'ltr', format: '', indent: 0, children } });
}

function validateDraftBodies(inputs: Array<{ markdown?: string; blocks?: DraftBlock[] }>): void {
  if (inputs.some((input) => (input.markdown === undefined) === (input.blocks === undefined))) {
    throw new Error('Every draft needs exactly one of markdown or blocks');
  }
  if (inputs.some((input) => input.blocks?.length === 0)) throw new Error('Draft blocks cannot be empty');
  for (const input of inputs) {
    if (input.blocks) draftLexical(input.blocks);
  }
}

function ghostFields(input: GhostFieldInput): Record<string, unknown> {
  return {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.slug !== undefined ? { slug: input.slug } : {}),
    ...(input.markdown !== undefined ? { html: markdown.render(input.markdown) } : {}),
    ...(input.blocks !== undefined ? { lexical: draftLexical(input.blocks) } : {}),
    ...(input.tags !== undefined ? { tags: input.tags.map((name) => ({ name })) } : {}),
    ...(input.authors !== undefined ? { authors: input.authors.map((id) => ({ id })) } : {}),
    ...(input.excerpt !== undefined ? { custom_excerpt: input.excerpt } : {}),
    ...(input.featured !== undefined ? { featured: input.featured } : {}),
    ...(input.feature_image_url !== undefined ? { feature_image: input.feature_image_url } : {}),
    ...(input.feature_image_alt !== undefined ? { feature_image_alt: input.feature_image_alt } : {}),
    ...(input.feature_image_caption !== undefined
      ? { feature_image_caption: input.feature_image_caption }
      : {}),
    ...(input.meta_title !== undefined ? { meta_title: input.meta_title } : {}),
    ...(input.meta_description !== undefined ? { meta_description: input.meta_description } : {}),
    ...(input.canonical_url !== undefined ? { canonical_url: input.canonical_url } : {}),
    ...(input.og_title !== undefined ? { og_title: input.og_title } : {}),
    ...(input.og_description !== undefined ? { og_description: input.og_description } : {}),
    ...(input.og_image !== undefined ? { og_image: input.og_image } : {}),
    ...(input.twitter_title !== undefined ? { twitter_title: input.twitter_title } : {}),
    ...(input.twitter_description !== undefined
      ? { twitter_description: input.twitter_description }
      : {}),
    ...(input.twitter_image !== undefined ? { twitter_image: input.twitter_image } : {}),
  };
}

function snapshotField(snapshot: ContentSnapshot, field: string): unknown {
  if (field === 'excerpt') return snapshot.custom_excerpt;
  if (field === 'feature_image_url') return snapshot.feature_image;
  if (field === 'authors') {
    return Array.isArray(snapshot.authors)
      ? snapshot.authors.map((author) => (author as { id?: unknown }).id)
      : [];
  }
  return snapshot[field];
}

function snapshotKey(field: string): string {
  if (field === 'excerpt') return 'custom_excerpt';
  if (field === 'feature_image_url') return 'feature_image';
  return field;
}

function equalValue(left: unknown, right: unknown): boolean {
  if (left === undefined || right === undefined) return left === right;
  return canonicalJson(left) === canonicalJson(right);
}

const PUBLISHED_FIELDS = new Set([
  'title',
  'excerpt',
  'feature_image_url',
  'feature_image_alt',
  'feature_image_caption',
  'meta_title',
  'meta_description',
  'canonical_url',
  'og_title',
  'og_description',
  'og_image',
  'twitter_title',
  'twitter_description',
  'twitter_image',
]);

function uniqueScopes(scopes: ChangeScope[]): ChangeScope[] {
  return [...new Set(scopes)].sort();
}

function ghostDraft(input: DraftInput & { slug: string }): Record<string, unknown> {
  return { ...ghostFields(input), status: 'draft' };
}

function safePublicUrl(value: string): string {
  const url = new URL(value);
  if (url.username || url.password) throw new Error('Public page URL must not contain credentials');
  const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    throw new Error('Public page URL must use HTTPS (HTTP is allowed only for localhost)');
  }
  return url.toString();
}

function hostname(value: string): string {
  return value.replace(/^\[|\]$/g, '').toLowerCase();
}

function localHostname(value: string): boolean {
  const host = hostname(value);
  return host === 'localhost' || host.endsWith('.localhost') || host === '::1' || host.startsWith('127.');
}

function privateAddress(value: string): boolean {
  const address = hostname(value);
  if (address.startsWith('::ffff:')) return true;
  const family = isIP(address);
  return family !== 0 && privateNetworks.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

async function liveResponseText(response: Response): Promise<string> {
  const declared = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > MAX_LIVE_RESPONSE_BYTES) {
    throw new Error('Live response exceeds the 2 MB limit');
  }
  if (!response.body || typeof response.body.getReader !== 'function') {
    const text = await response.text();
    if (Buffer.byteLength(text) > MAX_LIVE_RESPONSE_BYTES) {
      throw new Error('Live response exceeds the 2 MB limit');
    }
    return text;
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_LIVE_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error('Live response exceeds the 2 MB limit');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, bytes).toString('utf8');
}

export class GhostPublisher {
  private readonly ghost: any;
  private readonly request: typeof fetch;
  private readonly resolveHost: (hostname: string) => Promise<{ address: string }[]>;

  constructor(
    readonly config: Config,
    dependencies: Dependencies = {},
  ) {
    this.ghost =
      dependencies.ghost ??
      new GhostAdminAPI({
        url: config.ghostUrl,
        key: config.ghostAdminApiKey,
        version: config.ghostApiVersion,
      });
    this.request = dependencies.fetch ?? fetch;
    this.resolveHost =
      dependencies.lookup ??
      ((host) => lookup(host, { all: true, verbatim: true }));
  }

  private async ghostPageUrl(value: string): Promise<string> {
    const url = new URL(safePublicUrl(value));
    const allowLocal = localHostname(new URL(this.config.ghostUrl).hostname);
    if (allowLocal && localHostname(url.hostname)) return url.toString();
    if (localHostname(url.hostname) || privateAddress(url.hostname)) {
      throw new Error('Ghost returned a private or loopback public page URL');
    }
    if (!isIP(hostname(url.hostname))) {
      const addresses = await this.resolveHost(hostname(url.hostname));
      if (!addresses.length || addresses.some(({ address }) => privateAddress(address))) {
        throw new Error('Ghost returned a private or loopback public page URL');
      }
    }
    return url.toString();
  }

  async checkConnection() {
    const site = await this.ghost.site.read();
    return {
      title: String(site?.title ?? ''),
      url: String(site?.url ?? this.config.ghostUrl),
      version: site?.version ? String(site.version) : undefined,
    };
  }

  async listPosts(options: {
    status?: 'draft' | 'published' | 'scheduled' | 'all';
    tag?: string;
    search?: string;
    author_id?: string;
    updated_after?: string;
    updated_before?: string;
    published_after?: string;
    published_before?: string;
    order?: PostOrder;
    limit: number;
    page: number;
  }) {
    const filters: string[] = [];
    if (options.status && options.status !== 'all') filters.push(`status:${options.status}`);
    if (options.tag) filters.push(`tag:${slugify(options.tag)}`);
    if (options.search) filters.push(`title:~'${nql(options.search)}'`);
    if (options.author_id) filters.push(`authors.id:${options.author_id}`);
    if (options.updated_after) filters.push(`updated_at:>'${nql(options.updated_after)}'`);
    if (options.updated_before) filters.push(`updated_at:<'${nql(options.updated_before)}'`);
    if (options.published_after) filters.push(`published_at:>'${nql(options.published_after)}'`);
    if (options.published_before) filters.push(`published_at:<'${nql(options.published_before)}'`);
    const order = {
      updated_at_desc: 'updated_at desc',
      updated_at_asc: 'updated_at asc',
      published_at_desc: 'published_at desc',
      published_at_asc: 'published_at asc',
    }[options.order ?? 'updated_at_desc'];
    const rows = await this.ghost.posts.browse({
      limit: Math.min(options.limit, 50),
      page: options.page,
      order,
      include: 'tags,authors',
      ...(filters.length ? { filter: filters.join('+') } : {}),
    });
    return { posts: Array.from(rows, postRef), meta: rows.meta ?? {} };
  }

  async getPost(idOrSlug: string) {
    const byId = /^[a-f\d]{24}$/i.test(idOrSlug);
    const post = await this.ghost.posts.read(
      byId ? { id: idOrSlug } : { slug: idOrSlug },
      { formats: ['html', 'lexical'], include: 'tags,authors' },
    );
    return { ...details(post, postRef(post)), featured: Boolean(post.featured) };
  }

  async listTags(options: { search?: string; limit: number; page: number }) {
    const rows = await this.ghost.tags.browse({
      limit: Math.min(options.limit, 50),
      page: options.page,
      order: 'count.posts desc',
      include: 'count.posts',
      ...(options.search ? { filter: `name:~'${nql(options.search)}'` } : {}),
    });
    return {
      tags: Array.from(rows, (tag: any) => ({
        id: String(tag.id),
        name: String(tag.name),
        slug: String(tag.slug),
        count: Number(tag.count?.posts ?? 0),
      })),
      meta: rows.meta ?? {},
    };
  }

  async listAuthors(options: { search?: string; limit: number; page: number }) {
    const rows = await this.ghost.users.browse({
      limit: Math.min(options.limit, 50),
      page: options.page,
      order: 'name asc',
      include: 'count.posts',
      ...(options.search ? { filter: `name:~'${nql(options.search)}'` } : {}),
    });
    return {
      authors: Array.from(rows, (author: any) => ({
        id: String(author.id),
        name: String(author.name ?? ''),
        slug: String(author.slug ?? ''),
        ...(author.url ? { url: String(author.url) } : {}),
        count: Number(author.count?.posts ?? 0),
      })),
      meta: rows.meta ?? {},
    };
  }

  async listPages(options: {
    status?: 'draft' | 'published' | 'all';
    search?: string;
    updated_after?: string;
    updated_before?: string;
    published_after?: string;
    published_before?: string;
    order?: PostOrder;
    limit: number;
    page: number;
  }) {
    const filters: string[] = [];
    if (options.status && options.status !== 'all') filters.push(`status:${options.status}`);
    if (options.search) filters.push(`title:~'${nql(options.search)}'`);
    if (options.updated_after) filters.push(`updated_at:>'${nql(options.updated_after)}'`);
    if (options.updated_before) filters.push(`updated_at:<'${nql(options.updated_before)}'`);
    if (options.published_after) filters.push(`published_at:>'${nql(options.published_after)}'`);
    if (options.published_before) filters.push(`published_at:<'${nql(options.published_before)}'`);
    const order = {
      updated_at_desc: 'updated_at desc',
      updated_at_asc: 'updated_at asc',
      published_at_desc: 'published_at desc',
      published_at_asc: 'published_at asc',
    }[options.order ?? 'updated_at_desc'];
    const rows = await this.ghost.pages.browse({
      limit: Math.min(options.limit, 50),
      page: options.page,
      order,
      ...(filters.length ? { filter: filters.join('+') } : {}),
    });
    return { pages: Array.from(rows, pageRef), meta: rows.meta ?? {} };
  }

  async getPage(idOrSlug: string) {
    const byId = /^[a-f\d]{24}$/i.test(idOrSlug);
    const page = await this.ghost.pages.read(
      byId ? { id: idOrSlug } : { slug: idOrSlug },
      { formats: ['html', 'lexical'] },
    );
    return details(page, pageRef(page));
  }

  private async changeSnapshot(target: ChangeRequest['target']): Promise<ContentSnapshot> {
    const snapshot = (target.type === 'post' ? await this.getPost(target.id) : await this.getPage(target.id)) as ContentSnapshot;
    if (snapshot.updated_at !== target.updated_at) {
      throw new Error(`${target.type === 'post' ? 'Post' : 'Page'} changed since it was read`);
    }
    if (snapshot.status === 'scheduled') throw new Error('Scheduled content must be unscheduled before editing');
    return snapshot;
  }

  private previewItem(change: ChangeRequest, snapshot: ContentSnapshot): ChangePreviewItem {
    const warnings: string[] = [];
    let nodes: Record<string, number> = {};
    let protectedNodes: string[] = [];
    try {
      ({ nodes, protectedNodes } = lexicalInventory(snapshot.lexical));
    } catch {
      protectedNodes = ['invalid-lexical'];
      warnings.push('Lexical content could not be parsed');
    }

    const changedFields: string[] = [];
    const scopes: ChangeScope[] = [];
    let afterCharacters = textCharacters(snapshot.html);
    let afterNodes = { ...nodes };
    let removedNodes: string[] = [];
    let canApplyChange = snapshot.status === 'draft' || snapshot.status === 'published';

    if (change.operation.type === 'replace_body') {
      changedFields.push('body');
      scopes.push('body');
      afterCharacters = textCharacters(markdown.render(change.operation.markdown));
      if (snapshot.status !== 'draft') {
        canApplyChange = false;
        warnings.push('Body replacement accepts drafts only');
      }
      if (protectedNodes.length) {
        canApplyChange = false;
        warnings.push(`Body replacement is blocked by protected Lexical nodes: ${protectedNodes.join(', ')}`);
      }
      afterNodes = {};
      removedNodes = Object.keys(nodes).filter((node) => node !== 'root').sort();
    } else if (change.operation.type === 'append_section' || change.operation.type === 'prepend_section') {
      changedFields.push('body');
      scopes.push('body');
      if (snapshot.status !== 'draft') {
        canApplyChange = false;
        warnings.push('Structure-safe body changes accept drafts only');
      }
      try {
        const rendered = markdown.render(change.operation.markdown);
        const planned = insertHtmlSection(
          snapshot.lexical,
          rendered,
          change.operation.type === 'append_section' ? 'append' : 'prepend',
        );
        afterCharacters += textCharacters(rendered);
        afterNodes = lexicalInventory(planned).nodes;
      } catch (error) {
        canApplyChange = false;
        warnings.push(error instanceof Error ? error.message : String(error));
      }
    } else if (change.operation.type === 'replace_exact_text') {
      changedFields.push('body');
      scopes.push('body');
      if (snapshot.status !== 'draft') {
        canApplyChange = false;
        warnings.push('Structure-safe body changes accept drafts only');
      }
      try {
        const planned = replaceUniqueText(snapshot.lexical, change.operation.find, change.operation.replace);
        afterCharacters += change.operation.replace.length - change.operation.find.length;
        afterNodes = lexicalInventory(planned).nodes;
      } catch (error) {
        canApplyChange = false;
        warnings.push(error instanceof Error ? error.message : String(error));
      }
    } else {
      const patch = change.operation.patch;
      const fields = Object.keys(patch);
      if (!fields.length) {
        canApplyChange = false;
        warnings.push('No fields were provided');
      }
      if (change.target.type === 'page' && fields.some((field) => ['tags', 'authors', 'featured'].includes(field))) {
        canApplyChange = false;
        warnings.push('Pages do not accept tags, authors, or featured');
      }
      if (snapshot.status === 'published' && fields.some((field) => !PUBLISHED_FIELDS.has(field))) {
        canApplyChange = false;
        warnings.push('Published content accepts approved metadata fields only');
      }
      for (const field of fields) {
        const value = patch[field as keyof typeof patch];
        if (!equalValue(snapshotField(snapshot, field), value)) {
          changedFields.push(field);
          scopes.push(scopeForField(field));
        }
      }
      if (!changedFields.length) {
        canApplyChange = false;
        warnings.push('The patch would not change any values');
      }
    }

    return {
      target: change.target,
      before_snapshot: snapshot,
      snapshot_hash: snapshotHash(snapshot),
      changed_fields: changedFields.sort(),
      required_scopes: uniqueScopes(scopes),
      characters: { before: textCharacters(snapshot.html), after: afterCharacters },
      lexical_nodes: nodes,
      after_lexical_nodes: afterNodes,
      removed_nodes: removedNodes,
      protected_nodes: protectedNodes,
      warnings,
      can_apply: canApplyChange,
    };
  }

  async previewChanges(changes: ChangeRequest[]): Promise<ChangePreview> {
    if (!changes.length || changes.length > 25) throw new Error('Change sets require 1 to 25 targets');
    const keys = changes.map((change) => `${change.target.type}:${change.target.id}`);
    if (new Set(keys).size !== keys.length) throw new Error('Change targets must be unique within the batch');
    const snapshots = await Promise.all(changes.map((change) => this.changeSnapshot(change.target)));
    const items = changes.map((change, index) => this.previewItem(change, snapshots[index]!));
    return {
      changes: items,
      preview_hash: previewSignature(this.config.ghostAdminApiKey, this.config.ghostUrl, changes, items),
    };
  }

  async auditContent(targets: ChangeRequest['target'][]) {
    if (!targets.length || targets.length > 25) throw new Error('Audits require 1 to 25 targets');
    const keys = targets.map((target) => `${target.type}:${target.id}`);
    if (new Set(keys).size !== keys.length) throw new Error('Audit targets must be unique');
    const snapshots = await Promise.all(targets.map((target) => this.changeSnapshot(target)));
    return {
      audits: snapshots.map((snapshot, index) => {
        let lexicalParseable = true;
        let nodes: Record<string, number> = {};
        let protectedNodes: string[] = [];
        let links: ReturnType<typeof lexicalLinks> = [];
        let text: string[] = [];
        try {
          ({ nodes, protectedNodes } = lexicalInventory(snapshot.lexical));
          links = lexicalLinks(snapshot.lexical);
          text = lexicalHeadings(snapshot.lexical);
        } catch {
          lexicalParseable = false;
        }
        const missingMetadata = ['meta_title', 'meta_description', 'canonical_url'].filter(
          (field) => !snapshot[field],
        );
        return {
          target: targets[index]!,
          lexical_parseable: lexicalParseable,
          lexical_nodes: nodes,
          protected_nodes: protectedNodes,
          feature_image_missing_alt: Boolean(snapshot.feature_image && !snapshot.feature_image_alt),
          missing_metadata_fields: missingMetadata,
          lengths: {
            title: String(snapshot.title).length,
            meta_title: String(snapshot.meta_title ?? '').length,
            meta_description: String(snapshot.meta_description ?? '').length,
          },
          links_and_citations: links,
          sources_section_found: text.some((value) => /^(kaynaklar|sources)\s*:?$/i.test(value.trim())),
        };
      }),
    };
  }

  async applyChangeSet(
    changes: ChangeRequest[],
    previewHash: string,
    scopes: Partial<Record<ChangeScope, true>>,
  ) {
    if (!canEditDraft(this.config)) throw new Error('The read-only permission profile cannot apply changes');
    const preview = await this.previewChanges(changes);
    if (!sameSignature(preview.preview_hash, previewHash)) {
      throw new Error('Preview hash does not match the current content and exact change set');
    }
    if (preview.changes.some((item) => !item.can_apply)) {
      throw new Error('One or more changes cannot be applied; inspect the preview warnings');
    }
    if (preview.changes.some((item) => item.before_snapshot.status === 'published') && !canPublish(this.config)) {
      throw new Error('The publisher permission profile is required to edit published content');
    }
    const requiredScopes = uniqueScopes(preview.changes.flatMap((item) => item.required_scopes));
    const approvedScopes = Object.entries(scopes)
      .filter(([, approved]) => approved === true)
      .map(([scope]) => scope as ChangeScope)
      .sort();
    if (!equalValue(requiredScopes, approvedScopes)) {
      throw new Error(`Approved scopes must exactly match: ${requiredScopes.join(', ')}`);
    }

    const succeeded: Record<string, unknown>[] = [];
    const failed: Record<string, unknown>[] = [];
    for (let index = 0; index < changes.length; index += 1) {
      const change = changes[index]!;
      const before = preview.changes[index]!;
      try {
        const resource = change.target.type === 'post' ? this.ghost.posts : this.ghost.pages;
        let plannedLexical: string | undefined;
        if (change.operation.type === 'replace_body') {
          await resource.edit(
            {
              id: change.target.id,
              updated_at: change.target.updated_at,
              ...ghostFields({ markdown: change.operation.markdown }),
            },
            { source: 'html', save_revision: true },
          );
        } else if (change.operation.type === 'update_fields') {
          await resource.edit(
            {
              id: change.target.id,
              updated_at: change.target.updated_at,
              ...ghostFields(change.operation.patch),
            },
            { save_revision: true },
          );
        } else {
          plannedLexical =
            change.operation.type === 'replace_exact_text'
              ? replaceUniqueText(
                  before.before_snapshot.lexical,
                  change.operation.find,
                  change.operation.replace,
                )
              : insertHtmlSection(
                  before.before_snapshot.lexical,
                  markdown.render(change.operation.markdown),
                  change.operation.type === 'append_section' ? 'append' : 'prepend',
                );
          await resource.edit(
            { id: change.target.id, updated_at: change.target.updated_at, lexical: plannedLexical },
            { save_revision: true },
          );
        }
        const after = (change.target.type === 'post'
          ? await this.getPost(change.target.id)
          : await this.getPage(change.target.id)) as ContentSnapshot;
        const changedSnapshotFields =
          change.operation.type !== 'update_fields'
            ? new Set(['html', 'lexical'])
            : new Set(Object.keys(change.operation.patch).map(snapshotKey));
        if (change.operation.type === 'update_fields' && 'slug' in change.operation.patch) {
          changedSnapshotFields.add('url');
        }
        if (change.operation.type === 'update_fields') {
          for (const [field, expected] of Object.entries(change.operation.patch)) {
            if (!equalValue(snapshotField(after, field), expected)) {
              throw new Error(`Ghost readback did not preserve the requested ${field} value`);
            }
          }
        } else if (change.operation.type === 'replace_body') {
          if (textCharacters(after.html) !== textCharacters(markdown.render(change.operation.markdown))) {
            throw new Error('Ghost readback did not preserve the requested body');
          }
        } else if (change.operation.type === 'replace_exact_text') {
          if (!equalValue(JSON.parse(after.lexical), JSON.parse(plannedLexical!))) {
            throw new Error('Ghost readback did not preserve the exact text replacement');
          }
        } else {
          const originalChildren = parseLexical(before.before_snapshot.lexical).root.children;
          const afterChildren = parseLexical(after.lexical).root.children;
          const preservedChildren =
            change.operation.type === 'append_section' ? afterChildren.slice(0, -1) : afterChildren.slice(1);
          if (afterChildren.length !== originalChildren.length + 1 || !equalValue(preservedChildren, originalChildren)) {
            throw new Error('Ghost readback did not preserve the original Lexical children');
          }
        }
        const preservedFields = Object.keys(before.before_snapshot)
          .filter((field) => field !== 'updated_at' && !changedSnapshotFields.has(field))
          .sort();
        for (const field of preservedFields) {
          if (!equalValue(before.before_snapshot[field], after[field])) {
            throw new Error(`Ghost readback detected an unexpected ${field} change`);
          }
        }
        succeeded.push({
          target: change.target,
          before_snapshot: before.before_snapshot,
          before_hash: before.snapshot_hash,
          after_revision: {
            updated_at: after.updated_at,
            status: after.status,
            snapshot_hash: snapshotHash(after),
          },
          changed_fields: before.changed_fields,
          preserved_fields: preservedFields,
          approved_scopes: approvedScopes,
          ghost_readback: true,
          revision_requested: true,
          applied_at: new Date().toISOString(),
        });
      } catch (error) {
        failed.push({
          target: change.target,
          before_snapshot: before.before_snapshot,
          before_hash: before.snapshot_hash,
          changed_fields: before.changed_fields,
          preserved_fields: [],
          approved_scopes: approvedScopes,
          revision_requested: true,
          ghost_readback: false,
          status: 'failed',
          write_attempted: true,
          error: errorMessage(error, this.config),
        });
        for (let remainingIndex = index + 1; remainingIndex < changes.length; remainingIndex += 1) {
          const remaining = changes[remainingIndex]!;
          const remainingPreview = preview.changes[remainingIndex]!;
          failed.push({
            target: remaining.target,
            before_snapshot: remainingPreview.before_snapshot,
            before_hash: remainingPreview.snapshot_hash,
            changed_fields: remainingPreview.changed_fields,
            preserved_fields: Object.keys(remainingPreview.before_snapshot).sort(),
            approved_scopes: approvedScopes,
            revision_requested: false,
            ghost_readback: false,
            status: 'not_attempted',
            write_attempted: false,
            error: 'Not attempted after an earlier write failed',
          });
        }
        break;
      }
    }
    return {
      succeeded,
      failed,
      partial_failure: succeeded.length > 0 && failed.length > 0,
    };
  }

  private async postBySlug(slug: string): Promise<any | undefined> {
    try {
      return await this.ghost.posts.read({ slug }, { formats: 'html' });
    } catch (error) {
      if (isNotFound(error)) return undefined;
      throw error;
    }
  }

  private async pageBySlug(slug: string): Promise<any | undefined> {
    try {
      return await this.ghost.pages.read({ slug }, { formats: 'html' });
    } catch (error) {
      if (isNotFound(error)) return undefined;
      throw error;
    }
  }

  async createDrafts(inputs: DraftInput[]): Promise<BatchResult> {
    if (!canEditDraft(this.config)) throw new Error('The read-only permission profile cannot create drafts');
    validateDraftBodies(inputs);
    const prepared = inputs.map((input) => ({ ...input, slug: input.slug || slugify(input.title) }));
    if (prepared.some((input) => !input.slug)) throw new Error('Every draft needs a usable title or slug');
    if (new Set(prepared.map((input) => input.slug)).size !== prepared.length) {
      throw new Error('Draft slugs must be unique within the batch');
    }

    const existing = await Promise.all(prepared.map((input) => this.postBySlug(input.slug)));
    const conflicts = existing.filter(Boolean).map(postRef);
    if (conflicts.length) {
      throw new Error(`Slug already exists: ${conflicts.map((post) => post.slug).join(', ')}`);
    }

    const result: BatchResult = { succeeded: [], failed: [], partial_failure: false };
    for (const input of prepared) {
      try {
        const created = input.blocks
          ? await this.ghost.posts.add(ghostDraft(input))
          : await this.ghost.posts.add(ghostDraft(input), { source: 'html' });
        result.succeeded.push(postRef(created));
      } catch (error) {
        result.failed.push({ title: input.title, error: errorMessage(error, this.config) });
      }
    }
    result.partial_failure = result.succeeded.length > 0 && result.failed.length > 0;
    return result;
  }

  async createPageDrafts(inputs: PageInput[]): Promise<BatchResult<PageRef>> {
    if (!canEditDraft(this.config)) throw new Error('The read-only permission profile cannot create drafts');
    validateDraftBodies(inputs);
    const prepared = inputs.map((input) => ({ ...input, slug: input.slug || slugify(input.title) }));
    if (prepared.some((input) => !input.slug)) throw new Error('Every page needs a usable title or slug');
    if (new Set(prepared.map((input) => input.slug)).size !== prepared.length) {
      throw new Error('Page slugs must be unique within the batch');
    }
    const existing = await Promise.all(prepared.map((input) => this.pageBySlug(input.slug)));
    const conflicts = existing.filter(Boolean).map(pageRef);
    if (conflicts.length) {
      throw new Error(`Page slug already exists: ${conflicts.map((page) => page.slug).join(', ')}`);
    }

    const result: BatchResult<PageRef> = { succeeded: [], failed: [], partial_failure: false };
    for (const input of prepared) {
      try {
        const created = input.blocks
          ? await this.ghost.pages.add({ ...ghostFields(input), status: 'draft' })
          : await this.ghost.pages.add({ ...ghostFields(input), status: 'draft' }, { source: 'html' });
        result.succeeded.push(pageRef(created));
      } catch (error) {
        result.failed.push({ title: input.title, error: errorMessage(error, this.config) });
      }
    }
    result.partial_failure = result.succeeded.length > 0 && result.failed.length > 0;
    return result;
  }

  private async validateTransitions(
    targets: TransitionTarget[],
    expectedStatus: PostStatus,
  ): Promise<{ posts: any[]; errors: Map<string, string> }> {
    const errors = new Map<string, string>();
    const posts = await Promise.all(
      targets.map(async (target) => {
        try {
          const post = await this.ghost.posts.read({ id: target.id }, { include: 'tags,authors' });
          if (post.status !== expectedStatus) {
            errors.set(target.id, `Expected ${expectedStatus}, found ${String(post.status)}`);
          } else if (String(post.updated_at) !== target.updated_at) {
            errors.set(target.id, 'Post changed since it was read');
          }
          return post;
        } catch (error) {
          errors.set(target.id, errorMessage(error, this.config));
          return undefined;
        }
      }),
    );
    return { posts, errors };
  }

  private async editPostBatch<T extends TransitionTarget>(
    targets: T[],
    expectedStatus: PostStatus,
    edit: (target: T) => Record<string, unknown>,
    deploy: boolean,
  ): Promise<BatchResult> {
    if (new Set(targets.map((target) => target.id)).size !== targets.length) {
      throw new Error('Post IDs must be unique within the batch');
    }
    const preflight = await this.validateTransitions(targets, expectedStatus);
    if (preflight.errors.size) {
      return {
        succeeded: [],
        failed: targets.map((target) => ({
          id: target.id,
          error: preflight.errors.get(target.id) ?? 'Batch preflight aborted because another target failed',
        })),
        partial_failure: false,
      };
    }

    const result: BatchResult = { succeeded: [], failed: [], partial_failure: false };
    for (let index = 0; index < targets.length; index += 1) {
      const target = targets[index]!;
      try {
        result.succeeded.push(postRef(await this.ghost.posts.edit(edit(target))));
      } catch (error) {
        result.failed.push({ id: target.id, error: errorMessage(error, this.config) });
        for (const remaining of targets.slice(index + 1)) {
          result.failed.push({ id: remaining.id, error: 'Not attempted after an earlier write failed' });
        }
        break;
      }
    }
    result.partial_failure = result.succeeded.length > 0 && result.failed.length > 0;
    if (deploy && !result.failed.length && this.config.deployHookUrl) result.deploy = await this.triggerDeploy();
    return result;
  }

  async transitionPosts(
    targets: TransitionTarget[],
    status: 'draft' | 'published',
  ): Promise<BatchResult> {
    if (!canPublish(this.config)) throw new Error('The publisher permission profile is required');
    const expected = status === 'published' ? 'draft' : 'published';
    return this.editPostBatch(targets, expected, (target) => ({ ...target, status }), true);
  }

  private schedulePlanHash(targets: ScheduleTarget[]): string {
    return signedPayload(this.config.ghostAdminApiKey, {
      schema_version: 1,
      ghost_url: this.config.ghostUrl,
      posts: targets,
      newsletter: false,
    });
  }

  async planSchedule(
    posts: TransitionTarget[],
    startLocal: string,
    timezone: string,
    intervalHours: number,
  ) {
    if (!posts.length || posts.length > 25) throw new Error('Schedule plans require 1 to 25 posts');
    if (!Number.isInteger(intervalHours) || intervalHours < 1) {
      throw new Error('interval_hours must be a positive whole number');
    }
    if (new Set(posts.map((post) => post.id)).size !== posts.length) {
      throw new Error('Post IDs must be unique within the schedule plan');
    }
    const preflight = await this.validateTransitions(posts, 'draft');
    if (preflight.errors.size) {
      throw new Error(
        `Schedule plan preflight failed: ${posts
          .map((post) => `${post.id}: ${preflight.errors.get(post.id) ?? 'another target failed'}`)
          .join('; ')}`,
      );
    }
    const plain = Temporal.PlainDateTime.from(startLocal);
    const start = plain.toZonedDateTime(timezone, { disambiguation: 'reject' });
    const targets = posts.map((post, index) => {
      const instant = start.toInstant().add({ hours: intervalHours * index });
      return { ...post, published_at: instant.toString() };
    });
    return {
      timezone,
      interval_hours: intervalHours,
      newsletter: false,
      headless_visibility: this.config.publicPostUrlTemplate ? 'configured' : 'unverified',
      posts: targets.map((target, index) => ({
        order: index + 1,
        ...target,
        local_time: Temporal.Instant.from(target.published_at)
          .toZonedDateTimeISO(timezone)
          .toPlainDateTime()
          .toString({ smallestUnit: 'second' }),
      })),
      plan_hash: this.schedulePlanHash(targets),
    };
  }

  async schedulePosts(
    targets: ScheduleTarget[],
    planHash: string,
  ): Promise<BatchResult & { newsletter: false; headless_visibility: 'configured' | 'unverified' }> {
    if (!canSchedule(this.config)) throw new Error('The scheduler permission profile is required');
    if (!targets.length || targets.length > 25) throw new Error('Scheduling requires 1 to 25 posts');
    if (targets.some((target) => !Number.isFinite(Date.parse(target.published_at)))) {
      throw new Error('Scheduled publication timestamps must be valid');
    }
    if (targets.some((target) => Date.parse(target.published_at) <= Date.now())) {
      throw new Error('Scheduled publication timestamps must be in the future');
    }
    const preflight = await this.validateTransitions(targets, 'draft');
    if (preflight.errors.size) {
      return {
        succeeded: [],
        failed: targets.map((target) => ({
          id: target.id,
          error: preflight.errors.get(target.id) ?? 'Batch preflight aborted because another target failed',
        })),
        partial_failure: false,
        newsletter: false,
        headless_visibility: this.config.publicPostUrlTemplate ? 'configured' : 'unverified',
      };
    }
    if (!sameSignature(this.schedulePlanHash(targets), planHash)) {
      throw new Error('Schedule plan hash does not match the current site and exact post schedule');
    }
    const result = await this.editPostBatch(
      targets,
      'draft',
      (target) => ({ ...target, status: 'scheduled' }),
      false,
    );
    return {
      ...result,
      newsletter: false,
      headless_visibility: this.config.publicPostUrlTemplate ? 'configured' : 'unverified',
    };
  }

  async unschedulePosts(targets: TransitionTarget[]): Promise<BatchResult> {
    if (!canSchedule(this.config)) throw new Error('The scheduler permission profile is required');
    return this.editPostBatch(targets, 'scheduled', (target) => ({ ...target, status: 'draft' }), false);
  }

  private async validatePageTransitions(
    targets: TransitionTarget[],
    expectedStatus: 'draft' | 'published',
  ): Promise<Map<string, string>> {
    const errors = new Map<string, string>();
    await Promise.all(
      targets.map(async (target) => {
        try {
          const page = await this.ghost.pages.read({ id: target.id });
          if (page.status !== expectedStatus) {
            errors.set(target.id, `Expected ${expectedStatus}, found ${String(page.status)}`);
          } else if (String(page.updated_at) !== target.updated_at) {
            errors.set(target.id, 'Page changed since it was read');
          }
        } catch (error) {
          errors.set(target.id, errorMessage(error, this.config));
        }
      }),
    );
    return errors;
  }

  async transitionPages(
    targets: TransitionTarget[],
    status: 'draft' | 'published',
  ): Promise<BatchResult<PageRef>> {
    if (!canPublish(this.config)) throw new Error('The publisher permission profile is required');
    if (new Set(targets.map((target) => target.id)).size !== targets.length) {
      throw new Error('Page IDs must be unique within the batch');
    }
    const expected = status === 'published' ? 'draft' : 'published';
    const errors = await this.validatePageTransitions(targets, expected);
    if (errors.size) {
      return {
        succeeded: [],
        failed: targets.map((target) => ({
          id: target.id,
          error: errors.get(target.id) ?? 'Batch preflight aborted because another target failed',
        })),
        partial_failure: false,
      };
    }

    const result: BatchResult<PageRef> = { succeeded: [], failed: [], partial_failure: false };
    for (let index = 0; index < targets.length; index += 1) {
      const target = targets[index]!;
      try {
        result.succeeded.push(pageRef(await this.ghost.pages.edit({ ...target, status })));
      } catch (error) {
        result.failed.push({ id: target.id, error: errorMessage(error, this.config) });
        for (const remaining of targets.slice(index + 1)) {
          result.failed.push({ id: remaining.id, error: 'Not attempted after an earlier write failed' });
        }
        break;
      }
    }
    result.partial_failure = result.succeeded.length > 0 && result.failed.length > 0;
    if (!result.failed.length && this.config.deployHookUrl) result.deploy = await this.triggerDeploy();
    return result;
  }

  async uploadImage(filePath: string): Promise<ImageAsset> {
    if (!canEditDraft(this.config)) throw new Error('The read-only permission profile cannot upload images');
    if (!this.config.uploadRoots.length) {
      throw new Error('GHOST_UPLOAD_ROOTS must be configured before uploading local files');
    }
    const resolved = await realpath(filePath);
    const allowed = await Promise.all(
      this.config.uploadRoots.map(async (root) => {
        try {
          const actualRoot = await realpath(root);
          const relative = path.relative(actualRoot, resolved);
          return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
        } catch {
          return false;
        }
      }),
    );
    if (!allowed.some(Boolean)) throw new Error('Image path is outside GHOST_UPLOAD_ROOTS');

    const handle = await open(resolved, 'r');
    try {
      const stats = await handle.stat();
      if (!stats.isFile()) throw new Error('Image path must be a regular file');
      if (stats.size > MAX_IMAGE_BYTES) throw new Error('Image exceeds the 20 MB limit');
      return this.uploadBuffer(await handle.readFile(), path.basename(resolved));
    } finally {
      await handle.close();
    }
  }

  private async uploadBuffer(buffer: Buffer, filename: string): Promise<ImageAsset> {
    if (buffer.byteLength > MAX_IMAGE_BYTES) throw new Error('Image exceeds the 20 MB limit');
    const type = await fileTypeFromBuffer(buffer);
    if (!type || !IMAGE_TYPES.has(type.mime)) throw new Error('Unsupported image type');
    const form = new FormData();
    form.append('file', buffer, { filename, contentType: type.mime, knownLength: buffer.byteLength });
    const uploaded = await this.ghost.images.upload(form);
    if (!uploaded?.url) throw new Error('Ghost returned no uploaded image URL');
    return {
      url: String(uploaded.url),
      mime_type: type.mime,
      bytes: buffer.byteLength,
      source: 'upload',
    };
  }

  async triggerDeploy(): Promise<DeployResult> {
    if (!canPublish(this.config)) throw new Error('The publisher permission profile is required');
    if (!this.config.deployHookUrl) throw new Error('GHOST_DEPLOY_HOOK_URL is not configured');
    const url = new URL(this.config.deployHookUrl);
    try {
      const response = await this.request(url, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(30_000),
      });
      return {
        accepted: response.ok,
        host: url.host,
        status: response.status,
        ...(!response.ok ? { error: `Deploy hook returned HTTP ${response.status}` } : {}),
      };
    } catch (error) {
      return { accepted: false, host: url.host, status: 0, error: errorMessage(error, this.config) };
    }
  }

  async checkLivePosts(
    posts: {
      slug: string;
      title: string;
      expected_meta_title?: string;
      expected_meta_description?: string;
      expected_canonical_url?: string;
    }[],
  ) {
    if (!this.config.publicPostUrlTemplate) {
      throw new Error('GHOST_PUBLIC_POST_URL_TEMPLATE is not configured');
    }
    return Promise.all(
      posts.map(async (post) => {
        const url = this.config.publicPostUrlTemplate!.replace('{slug}', encodeURIComponent(post.slug));
        try {
          const response = await this.request(url, {
            redirect: 'error',
            signal: AbortSignal.timeout(15_000),
          });
          const body = await liveResponseText(response);
          const rendered = renderedMetadata(body);
          const titleMatch = response.ok && decodeHtml(body.replace(/<[^>]+>/g, ' ')).includes(post.title);
          const metaTitleMatch =
            post.expected_meta_title === undefined || rendered.title === post.expected_meta_title;
          const metaDescriptionMatch =
            post.expected_meta_description === undefined ||
            rendered.description === post.expected_meta_description;
          const canonicalUrlMatch =
            post.expected_canonical_url === undefined ||
            rendered.canonical === post.expected_canonical_url;
          return {
            slug: post.slug,
            url,
            status: response.status,
            title_match: titleMatch,
            verified:
              response.ok && titleMatch && metaTitleMatch && metaDescriptionMatch && canonicalUrlMatch,
            ...(post.expected_meta_title !== undefined
              ? { meta_title_match: response.ok && metaTitleMatch }
              : {}),
            ...(post.expected_meta_description !== undefined
              ? { meta_description_match: response.ok && metaDescriptionMatch }
              : {}),
            ...(post.expected_canonical_url !== undefined
              ? { canonical_url_match: response.ok && canonicalUrlMatch }
              : {}),
          };
        } catch (error) {
          return {
            slug: post.slug,
            url,
            status: 0,
            title_match: false,
            verified: false,
            error: errorMessage(error, this.config),
          };
        }
      }),
    );
  }

  async checkLivePages(targets: TransitionTarget[]) {
    if (new Set(targets.map((target) => target.id)).size !== targets.length) {
      throw new Error('Page IDs must be unique within the batch');
    }
    return Promise.all(
      targets.map(async (target) => {
        try {
          const page = await this.ghost.pages.read({ id: target.id });
          if (page.status !== 'published') throw new Error(`Expected published, found ${String(page.status)}`);
          if (String(page.updated_at) !== target.updated_at) throw new Error('Page changed since it was read');
          const selectedUrl = this.config.publicPageUrlTemplate
            ? this.config.publicPageUrlTemplate.replace('{slug}', encodeURIComponent(String(page.slug)))
            : String(page.url ?? '');
          if (!selectedUrl) throw new Error('Ghost returned no public page URL');
          const url = this.config.publicPageUrlTemplate
            ? safePublicUrl(selectedUrl)
            : await this.ghostPageUrl(selectedUrl);
          const response = await this.request(url, {
            redirect: 'error',
            signal: AbortSignal.timeout(15_000),
          });
          const body = await liveResponseText(response);
          const rendered = renderedMetadata(body);
          const titleMatch = response.ok && decodeHtml(body.replace(/<[^>]+>/g, ' ')).includes(String(page.title));
          const expectedCanonical = String(page.canonical_url ?? url);
          const canonicalUrlMatch = rendered.canonical === expectedCanonical;
          const metaTitleMatch = page.meta_title == null || rendered.title === String(page.meta_title);
          const metaDescriptionMatch =
            page.meta_description == null || rendered.description === String(page.meta_description);
          return {
            id: target.id,
            slug: String(page.slug),
            url,
            status: response.status,
            title_match: titleMatch,
            canonical_url_match: response.ok && canonicalUrlMatch,
            ...(page.meta_title != null ? { meta_title_match: response.ok && metaTitleMatch } : {}),
            ...(page.meta_description != null
              ? { meta_description_match: response.ok && metaDescriptionMatch }
              : {}),
            verified:
              response.ok && titleMatch && canonicalUrlMatch && metaTitleMatch && metaDescriptionMatch,
          };
        } catch (error) {
          return {
            id: target.id,
            status: 0,
            title_match: false,
            canonical_url_match: false,
            verified: false,
            error: errorMessage(error, this.config),
          };
        }
      }),
    );
  }
}

function decodeHtml(value: string): string {
  const named: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: '\u00a0' };
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    const numeric = code.startsWith('#x')
      ? Number.parseInt(code.slice(2), 16)
      : code.startsWith('#')
        ? Number.parseInt(code.slice(1), 10)
        : undefined;
    if (numeric !== undefined) {
      return Number.isInteger(numeric) && numeric >= 0 && numeric <= 0x10ffff
        ? String.fromCodePoint(numeric)
        : entity;
    }
    return named[code.toLowerCase()] ?? entity;
  });
}

function tagAttribute(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  const value = match?.[1] ?? match?.[2] ?? match?.[3];
  return value === undefined ? undefined : decodeHtml(value);
}

function renderedMetadata(html: string): { title?: string; description?: string; canonical?: string } {
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const meta = html.match(/<meta\b[^>]*>/gi) ?? [];
  const descriptionTag = meta.find((tag) => tagAttribute(tag, 'name')?.toLowerCase() === 'description');
  const links = html.match(/<link\b[^>]*>/gi) ?? [];
  const canonicalTag = links.find((tag) =>
    (tagAttribute(tag, 'rel') ?? '')
      .toLowerCase()
      .split(/\s+/)
      .includes('canonical'),
  );
  return {
    ...(title !== undefined ? { title: decodeHtml(title.replace(/<[^>]+>/g, '').trim()) } : {}),
    ...(descriptionTag ? { description: tagAttribute(descriptionTag, 'content') } : {}),
    ...(canonicalTag ? { canonical: tagAttribute(canonicalTag, 'href') } : {}),
  };
}
