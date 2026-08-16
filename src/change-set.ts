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

function lexicalNodeText(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  if (Array.isArray(value)) return value.map(lexicalNodeText).join('');
  const node = value as Record<string, unknown>;
  if ((node.type === 'text' || node.type === 'extended-text') && typeof node.text === 'string') return node.text;
  if (typeof node.buttonText === 'string') return node.buttonText;
  if (typeof node.calloutText === 'string') return node.calloutText.replace(/<[^>]*>/g, ' ');
  return Array.isArray(node.children) ? node.children.map(lexicalNodeText).join('') : '';
}

export function analyzeLexical(lexical: string) {
  const document = parseLexical(lexical);
  const nodes: Record<string, number> = {};
  const protectedNodes = new Set<string>();
  const headings: { index: number; level?: number; text: string }[] = [];
  const links: { index: number; type: string; url: string; text?: string }[] = [];
  const images: { index: number; alt?: string; caption?: string; title?: string }[] = [];
  const bookmarks: { index: number; url?: string; title?: string }[] = [];
  const buttons: { index: number; label: string }[] = [];
  const toggles: number[] = [];
  const galleries: { index: number; fingerprint: string }[] = [];
  const complexScriptStarts: number[] = [];
  let meaningful = false;
  let nextIndex = 0;
  const meaningfulCards = new Set(['image', 'gallery', 'bookmark', 'button', 'callout', 'html', 'embed', 'video', 'audio', 'file', 'product', 'toggle']);

  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const node = value as Record<string, unknown>;
    const type = typeof node.type === 'string' ? node.type : 'unknown';
    const index = nextIndex++;
    nodes[type] = (nodes[type] ?? 0) + 1;
    if (!PLAIN_LEXICAL_NODES.has(type)) protectedNodes.add(type);
    const text = lexicalNodeText(node).trim();
    if (text || meaningfulCards.has(type)) meaningful = true;

    if (type === 'heading' || type === 'extended-heading') {
      const tag = typeof node.tag === 'string' ? node.tag.match(/^h([1-6])$/i) : null;
      const level = tag ? Number(tag[1]) : typeof node.level === 'number' ? node.level : undefined;
      headings.push({ index, ...(level ? { level } : {}), text });
    }
    if (type === 'link' || type === 'extended-link') {
      const url = typeof node.url === 'string' ? node.url : typeof node.href === 'string' ? node.href : '';
      links.push({ index, type, url, ...(text ? { text } : {}) });
    }
    if (type === 'image') {
      images.push({
        index,
        ...(typeof node.alt === 'string' ? { alt: node.alt } : {}),
        ...(typeof node.caption === 'string' ? { caption: node.caption } : {}),
        ...(typeof node.title === 'string' ? { title: node.title } : {}),
      });
    }
    if (type === 'bookmark') {
      const metadata = node.metadata && typeof node.metadata === 'object' ? node.metadata as Record<string, unknown> : {};
      bookmarks.push({
        index,
        ...(typeof node.url === 'string' ? { url: node.url } : {}),
        ...(typeof metadata.title === 'string' ? { title: metadata.title } : {}),
      });
    }
    if (type === 'button') buttons.push({ index, label: typeof node.buttonText === 'string' ? node.buttonText.trim() : text });
    if (type === 'toggle') toggles.push(index);
    if (type === 'gallery') {
      const rawImages = Array.isArray(node.images) ? node.images : Array.isArray(node.children) ? node.children : [];
      const normalizedImages = rawImages.map((image) => {
        const item = image && typeof image === 'object' ? image as Record<string, unknown> : {};
        return {
          src: item.src ?? item.url ?? item.fileName ?? null,
          width: item.width ?? null,
          height: item.height ?? null,
          alt: item.alt ?? null,
          caption: item.caption ?? null,
        };
      });
      galleries.push({
        index,
        fingerprint: sha256({ images: normalizedImages, card_width: node.cardWidth ?? null, caption: node.caption ?? null }),
      });
    }
    if (['paragraph', 'heading', 'extended-heading', 'quote', 'listitem'].includes(type) && /^\p{Script=Hangul}/u.test(text)) {
      complexScriptStarts.push(index);
    }
    if (Array.isArray(node.children)) node.children.forEach(visit);
  };

  visit(document.root);
  return {
    nodes,
    protectedNodes: [...protectedNodes].sort(),
    headings,
    links,
    images,
    bookmarks,
    buttons,
    toggles,
    galleries,
    complexScriptStarts,
    meaningful,
  };
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
