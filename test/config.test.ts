import { describe, expect, it } from 'vitest';
import { loadConfig, publicConfig, redactSecrets } from '../src/config.js';

const key = `${'a'.repeat(24)}:${'b'.repeat(64)}`;

describe('configuration boundary', () => {
  it('validates URLs and never exposes secrets', () => {
    const config = loadConfig({
      GHOST_URL: 'https://example.com/',
      GHOST_ADMIN_API_KEY: key,
      GHOST_READ_ONLY: 'true',
      GHOST_DEPLOY_HOOK_URL: 'https://deploy.example.com/hook?secret=yes',
      GHOST_PUBLIC_POST_URL_TEMPLATE: 'https://example.com/posts/{slug}',
      GHOST_PUBLIC_PAGE_URL_TEMPLATE: 'https://example.com/{slug}',
    });

    expect(config.ghostUrl).toBe('https://example.com');
    expect(config.readOnly).toBe(true);
    expect(config.permissionProfile).toBe('read-only');
    expect(publicConfig(config)).toMatchObject({
      permission_profile: 'read-only',
      read_only: true,
      deploy_hook_host: 'deploy.example.com',
      page_live_check_configured: true,
    });
    expect(publicConfig(config)).not.toHaveProperty('ghostAdminApiKey');
    expect(redactSecrets(`bad ${key} ${config.deployHookUrl}`, config)).toBe(
      'bad [REDACTED] [REDACTED]',
    );
  });

  it('rejects insecure remote URLs and unusable templates', () => {
    expect(() => loadConfig({ GHOST_URL: 'http://example.com', GHOST_ADMIN_API_KEY: key })).toThrow(
      'must use HTTPS',
    );
    expect(() =>
      loadConfig({
        GHOST_URL: 'https://example.com',
        GHOST_ADMIN_API_KEY: key,
        GHOST_PUBLIC_POST_URL_TEMPLATE: 'https://example.com/posts',
      }),
    ).toThrow('must contain exactly one {slug}');
    expect(() =>
      loadConfig({
        GHOST_URL: 'https://example.com',
        GHOST_ADMIN_API_KEY: key,
        GHOST_PUBLIC_PAGE_URL_TEMPLATE: 'http://remote.example.com/{slug}',
      }),
    ).toThrow('must use HTTPS');
    expect(() =>
      loadConfig({
        GHOST_URL: 'https://user:password@example.com',
        GHOST_ADMIN_API_KEY: key,
      }),
    ).toThrow('must not contain credentials');
    expect(() =>
      loadConfig({
        GHOST_URL: 'https://example.com',
        GHOST_ADMIN_API_KEY: key,
        GHOST_DEPLOY_HOOK_URL: 'https://token@deploy.example.com/hook',
      }),
    ).toThrow('must not contain credentials');
    expect(() =>
      loadConfig({
        GHOST_URL: 'https://example.com',
        GHOST_ADMIN_API_KEY: key,
        GHOST_PUBLIC_POST_URL_TEMPLATE: 'https://{slug}',
      }),
    ).toThrow('must place {slug} in the URL path');
    expect(() =>
      loadConfig({
        GHOST_URL: 'https://example.com',
        GHOST_ADMIN_API_KEY: key,
        GHOST_PUBLIC_POST_URL_TEMPLATE: 'https://example.com/{slug}/{slug}',
      }),
    ).toThrow('must contain exactly one {slug}');
    expect(() =>
      loadConfig({ GHOST_URL: 'https://example.com', GHOST_ADMIN_API_KEY: key, GHOST_READ_ONLY: 'yes' }),
    ).toThrow('GHOST_READ_ONLY must be true or false');
    expect(() =>
      loadConfig({
        GHOST_URL: 'https://example.com',
        GHOST_ADMIN_API_KEY: key,
        GHOST_PERMISSION_PROFILE: 'scheduler',
        GHOST_READ_ONLY: 'false',
      }),
    ).toThrow('cannot be used together');
    expect(() =>
      loadConfig({
        GHOST_URL: 'https://example.com',
        GHOST_ADMIN_API_KEY: key,
        GHOST_PERMISSION_PROFILE: 'owner',
      }),
    ).toThrow('must be read-only, draft-editor, scheduler, or publisher');
  });

  it('defaults to read-write mode', () => {
    const config = loadConfig({ GHOST_URL: 'https://example.com', GHOST_ADMIN_API_KEY: key });
    expect(config.readOnly).toBe(false);
    expect(config.permissionProfile).toBe('publisher');
  });
});
