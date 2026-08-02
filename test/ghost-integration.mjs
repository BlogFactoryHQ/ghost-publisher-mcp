/* global console, fetch, process, setTimeout */
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import GhostAdminAPI from '@tryghost/admin-api';
import { GhostPublisher } from '../dist/publisher.js';

const ghostUrl = process.env.GHOST_INTEGRATION_URL ?? 'http://localhost:2368';
const email = 'owner@example.com';
const password = 'correct horse battery staple 2026';
const uploadRoot = await mkdtemp(path.join(tmpdir(), 'ghost-publisher-integration-'));
const imagePath = path.join(uploadRoot, 'pixel.png');
await writeFile(
  imagePath,
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAL0lEQVR4nO3OIQEAAAgDMLoQjfiEgBg3E/Ornr2kEhAQEBAQEBAQEBAQEBAQSAcecybAiG90aXEAAAAASUVORK5CYII=',
    'base64',
  ),
);

async function request(path, options = {}) {
  const response = await fetch(`${ghostUrl}${path}`, options);
  if (!response.ok) throw new Error(`${options.method ?? 'GET'} ${path} failed: ${response.status} ${await response.text()}`);
  return response;
}

async function waitForGhost() {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try {
      if ((await fetch(`${ghostUrl}/ghost/api/admin/authentication/setup/`)).ok) return;
    } catch {
      // Ghost is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error('Ghost did not start within three minutes');
}

async function createAdminKey() {
  await request('/ghost/api/admin/authentication/setup/', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ setup: [{ name: 'Integration Owner', email, password, blogTitle: 'MCP Test' }] }),
  });
  const session = await request('/ghost/api/admin/session/', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ghostUrl },
    body: JSON.stringify({ grant_type: 'password', username: email, password }),
    redirect: 'manual',
  });
  const cookie = session.headers.getSetCookie().map((value) => value.split(';', 1)[0]).join('; ');
  const integration = await request('/ghost/api/admin/integrations/?include=api_keys', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ghostUrl, cookie },
    body: JSON.stringify({ integrations: [{ name: 'Ghost Publisher Integration Test' }] }),
  }).then((response) => response.json());
  const adminKey = integration.integrations[0].api_keys.find((key) => key.type === 'admin')?.secret;
  assert.match(adminKey, /^[a-f\d]{24}:[a-f\d]{64}$/i);
  return adminKey;
}

await waitForGhost();
const adminKey = await createAdminKey();
const config = {
  ghostUrl,
  ghostAdminApiKey: adminKey,
  ghostApiVersion: 'v5.0',
  permissionProfile: 'publisher',
  readOnly: false,
  uploadRoots: [uploadRoot],
};
const publisher = new GhostPublisher(config);
const api = new GhostAdminAPI({ url: ghostUrl, key: adminKey, version: 'v5.0' });
let created;
let createdPage;

async function applyExact(changes) {
  const preview = await publisher.previewChanges(changes);
  assert.equal(preview.changes.every((change) => change.can_apply), true, JSON.stringify(preview.changes));
  const scopes = Object.fromEntries(preview.changes.flatMap((change) => change.required_scopes).map((scope) => [scope, true]));
  const result = await publisher.applyChangeSet(changes, preview.preview_hash, scopes);
  assert.equal(result.failed.length, 0, JSON.stringify(result));
  assert.equal(result.succeeded.length, changes.length);
  return result.succeeded[0];
}

try {
  const image = await publisher.uploadImage(imagePath);
  assert.equal(image.mime_type, 'image/png');
  assert.match(image.url, /^https?:\/\//);

  const authors = await publisher.listAuthors({ limit: 50, page: 1 });
  const owner = authors.authors.find((author) => author.name === 'Integration Owner');
  assert.match(owner?.id, /^(?:[a-f\d]{24}|[1-9]\d{0,19})$/i);

  const slug = `ghost-publisher-integration-${Date.now()}`;
  const batch = await publisher.createDrafts([
    {
      title: 'Integration draft',
      slug,
      markdown: '# It works',
      authors: [owner.id],
      excerpt: 'Metadata to clear',
    },
  ]);
  assert.equal(batch.failed.length, 0);
  created = batch.succeeded[0];
  assert.equal(created.status, 'draft');
  assert.deepEqual(created.authors.map((author) => author.id), [owner.id]);

  const updatedReceipt = await applyExact([
    {
      target: { type: 'post', id: created.id, updated_at: created.updated_at },
      operation: {
        type: 'update_fields',
        patch: { excerpt: null, feature_image_url: image.url, tags: [], authors: [owner.id] },
      },
    },
  ]);
  const updated = await publisher.getPost(updatedReceipt.target.id);
  const scheduled = await publisher.schedulePosts([
    {
      id: updated.id,
      updated_at: updated.updated_at,
      published_at: new Date(Date.now() + 60 * 60 * 1_000).toISOString(),
    },
  ]);
  assert.equal(scheduled.succeeded[0]?.status, 'scheduled');
  const unscheduled = await publisher.unschedulePosts([
    { id: scheduled.succeeded[0].id, updated_at: scheduled.succeeded[0].updated_at },
  ]);
  assert.equal(unscheduled.succeeded[0]?.status, 'draft');
  const draftDetails = await publisher.getPost(unscheduled.succeeded[0].id);
  assert.equal(draftDetails.custom_excerpt, null);
  assert.equal(draftDetails.feature_image, image.url);
  assert.deepEqual(draftDetails.authors.map((author) => author.id), [owner.id]);

  const published = await publisher.transitionPosts(
    [{ id: draftDetails.id, updated_at: draftDetails.updated_at }],
    'published',
  );
  assert.equal(published.succeeded[0]?.status, 'published');
  const publishedDetails = await publisher.getPost(published.succeeded[0].id);
  const optimizedReceipt = await applyExact([
    {
      target: { type: 'post', id: publishedDetails.id, updated_at: publishedDetails.updated_at },
      operation: {
        type: 'update_fields',
        patch: {
          feature_image_url: null,
          meta_title: 'Integration SEO title',
          meta_description: 'Updated published SEO metadata',
        },
      },
    },
  ]);
  const optimizedDetails = await publisher.getPost(optimizedReceipt.target.id);
  assert.equal(optimizedDetails.status, 'published');
  assert.equal(optimizedDetails.feature_image, null);
  assert.equal(optimizedDetails.meta_title, 'Integration SEO title');
  assert.equal(optimizedDetails.meta_description, 'Updated published SEO metadata');
  assert.match(optimizedDetails.html, /It works/);
  const unpublished = await publisher.transitionPosts(
    [{ id: optimizedDetails.id, updated_at: optimizedDetails.updated_at }],
    'draft',
  );
  assert.equal(unpublished.succeeded[0]?.status, 'draft');

  const pageSlug = `ghost-publisher-page-${Date.now()}`;
  const pageBatch = await publisher.createPageDrafts([
    { title: 'Integration page', slug: pageSlug, markdown: '# Page works' },
  ]);
  assert.equal(pageBatch.failed.length, 0);
  createdPage = pageBatch.succeeded[0];
  assert.equal(createdPage.status, 'draft');
  const bodyReceipt = await applyExact([
    {
      target: { type: 'page', id: createdPage.id, updated_at: createdPage.updated_at },
      operation: { type: 'replace_body', markdown: '# Page works\n\nUpdated safely.' },
    },
  ]);
  const bodyPage = await publisher.getPage(bodyReceipt.target.id);
  const metadataReceipt = await applyExact([
    {
      target: { type: 'page', id: bodyPage.id, updated_at: bodyPage.updated_at },
      operation: { type: 'update_fields', patch: { excerpt: 'Integration page excerpt' } },
    },
  ]);
  const updatedPage = await publisher.getPage(metadataReceipt.target.id);
  const publishedPage = await publisher.transitionPages(
    [{ id: updatedPage.id, updated_at: updatedPage.updated_at }],
    'published',
  );
  assert.equal(publishedPage.succeeded[0]?.status, 'published');
  const pageDetails = await publisher.getPage(publishedPage.succeeded[0].id);
  assert.match(pageDetails.html, /Updated safely/);
  const optimizedPageReceipt = await applyExact([
    {
      target: { type: 'page', id: pageDetails.id, updated_at: pageDetails.updated_at },
      operation: {
        type: 'update_fields',
        patch: {
          meta_title: 'Integration page SEO title',
          meta_description: 'Integration page SEO description',
        },
      },
    },
  ]);
  const optimizedPageDetails = await publisher.getPage(optimizedPageReceipt.target.id);
  assert.equal(optimizedPageDetails.status, 'published');
  assert.match(optimizedPageDetails.html, /Updated safely/);
  const livePage = await publisher.checkLivePages([
    { id: optimizedPageDetails.id, updated_at: optimizedPageDetails.updated_at },
  ]);
  assert.equal(livePage[0]?.verified, true);
  const unpublishedPage = await publisher.transitionPages(
    [{ id: optimizedPageDetails.id, updated_at: optimizedPageDetails.updated_at }],
    'draft',
  );
  assert.equal(unpublishedPage.succeeded[0]?.status, 'draft');
  console.log(`Ghost ${process.env.GHOST_IMAGE ?? ''} integration passed`);
} finally {
  if (createdPage) await api.pages.delete({ id: createdPage.id });
  if (created) await api.posts.delete({ id: created.id });
  await rm(uploadRoot, { recursive: true, force: true });
}
