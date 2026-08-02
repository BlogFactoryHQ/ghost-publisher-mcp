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
      protected_nodes: item.protected_nodes,
      can_apply: item.can_apply,
    })),
  };
  return createHmac('sha256', secret).update(canonicalJson(payload)).digest('base64url');
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
