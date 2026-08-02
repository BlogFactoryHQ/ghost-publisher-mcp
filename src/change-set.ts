import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { ChangePreviewItem, ChangeRequest, ChangeScope, ContentSnapshot } from './types.js';

const PLAIN_LEXICAL_NODES = new Set([
  'root',
  'paragraph',
  'heading',
  'extended-heading',
  'extended-text',
  'text',
  'link',
  'extended-link',
  'list',
  'listitem',
  'quote',
  'code',
  'linebreak',
  'horizontalrule',
]);

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error('Cannot canonicalize undefined');
    return encoded;
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => (item === undefined ? 'null' : canonicalJson(item))).join(',')}]`;
  }
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .filter((key) => object[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
    .join(',')}}`;
}

export function sha256(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('base64url');
}

export function signedPayload(secret: string, value: unknown): string {
  return createHmac('sha256', secret).update(canonicalJson(value)).digest('base64url');
}

export function previewSignature(
  secret: string,
  ghostUrl: string,
  changes: ChangeRequest[],
  items: ChangePreviewItem[],
): string {
  const payload = {
    schema_version: 1,
    ghost_url: ghostUrl,
    changes,
    previews: items.map((item) => ({
      target: item.target,
      snapshot_hash: item.snapshot_hash,
      changed_fields: item.changed_fields,
      required_scopes: item.required_scopes,
      characters: item.characters,
      lexical_nodes: item.lexical_nodes,
      after_lexical_nodes: item.after_lexical_nodes,
      removed_nodes: item.removed_nodes,
      protected_nodes: item.protected_nodes,
      warnings: item.warnings,
      can_apply: item.can_apply,
    })),
  };
  return signedPayload(secret, payload);
}

export function sameSignature(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function lexicalInventory(lexical: string): { nodes: Record<string, number>; protectedNodes: string[] } {
  const parsed = JSON.parse(lexical) as unknown;
  const nodes: Record<string, number> = {};
  const protectedNodes = new Set<string>();
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const object = value as Record<string, unknown>;
    if (typeof object.type === 'string') {
      nodes[object.type] = (nodes[object.type] ?? 0) + 1;
      if (!PLAIN_LEXICAL_NODES.has(object.type)) protectedNodes.add(object.type);
    }
    if (Array.isArray(object.children)) object.children.forEach(visit);
  };
  const document = parsed as Record<string, unknown>;
  visit(document.root ?? parsed);
  return { nodes, protectedNodes: [...protectedNodes].sort() };
}

type LexicalDocument = Record<string, unknown> & {
  root: Record<string, unknown> & { children: unknown[] };
};

export function parseLexical(lexical: string): LexicalDocument {
  const document = JSON.parse(lexical) as LexicalDocument;
  if (!document.root || !Array.isArray(document.root.children)) throw new Error('Lexical root children are missing');
  return document;
}

export function insertHtmlSection(lexical: string, html: string, position: 'append' | 'prepend'): string {
  const document = structuredClone(parseLexical(lexical));
  const node = { type: 'html', version: 1, html };
  if (position === 'append') document.root.children.push(node);
  else document.root.children.unshift(node);
  return JSON.stringify(document);
}

export function replaceUniqueText(lexical: string, find: string, replacement: string): string {
  const document = structuredClone(parseLexical(lexical));
  const matches: Record<string, unknown>[] = [];
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const node = value as Record<string, unknown>;
    if ((node.type === 'text' || node.type === 'extended-text') && node.text === find) matches.push(node);
    if (Array.isArray(node.children)) node.children.forEach(visit);
  };
  visit(document.root);
  if (matches.length !== 1) throw new Error(`Exact text must match one text node; found ${matches.length}`);
  matches[0]!.text = replacement;
  return JSON.stringify(document);
}

export function lexicalLinks(lexical: string): { type: string; url: string; text?: string }[] {
  const links: { type: string; url: string; text?: string }[] = [];
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const node = value as Record<string, unknown>;
    const url = typeof node.url === 'string' ? node.url : typeof node.href === 'string' ? node.href : undefined;
    if (url) {
      const text = Array.isArray(node.children)
        ? node.children
            .map((child) => (child && typeof child === 'object' ? (child as Record<string, unknown>).text : ''))
            .filter((item): item is string => typeof item === 'string')
            .join('')
        : undefined;
      links.push({ type: String(node.type ?? 'link'), url, ...(text ? { text } : {}) });
    }
    if (Array.isArray(node.children)) node.children.forEach(visit);
  };
  visit(parseLexical(lexical).root);
  return links;
}

export function lexicalHeadings(lexical: string): string[] {
  const headings: string[] = [];
  const nodeText = (value: unknown): string => {
    if (!value || typeof value !== 'object') return '';
    if (Array.isArray(value)) {
      return value.map(nodeText).join('');
    }
    const node = value as Record<string, unknown>;
    if ((node.type === 'text' || node.type === 'extended-text') && typeof node.text === 'string') return node.text;
    return Array.isArray(node.children) ? node.children.map(nodeText).join('') : '';
  };
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const node = value as Record<string, unknown>;
    if (node.type === 'heading' || node.type === 'extended-heading') headings.push(nodeText(node));
    if (Array.isArray(node.children)) node.children.forEach(visit);
  };
  visit(parseLexical(lexical).root);
  return headings;
}

export function textCharacters(html: string): number {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().length;
}

export function scopeForField(field: string): ChangeScope {
  if (field === 'title') return 'title';
  if (field === 'slug') return 'slug';
  if (field === 'tags' || field === 'authors') return 'taxonomy';
  if (field.startsWith('feature_image')) return 'feature_image';
  return 'metadata';
}

export function snapshotHash(snapshot: ContentSnapshot): string {
  return sha256(snapshot);
}
