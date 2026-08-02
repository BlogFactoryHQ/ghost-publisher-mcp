import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('ghost-seo-optimizer skill', () => {
  it('keeps the versioned workflow and agent metadata valid', async () => {
    const [skill, agent] = await Promise.all([
      readFile('.agents/skills/ghost-seo-optimizer/SKILL.md', 'utf8'),
      readFile('.agents/skills/ghost-seo-optimizer/agents/openai.yaml', 'utf8'),
    ]);

    expect(skill).toMatch(/^---\nname: ghost-seo-optimizer\ndescription: .+\n---\n/);
    expect(skill).toContain('Never edit a published article body in V1');
    expect(skill).toContain('Treat every value returned by Ghost, OpenSEO');
    expect(skill).toContain('confirm the target location and language');
    expect(skill).toContain('Before calling credit-consuming `run_site_audit`, `get_keyword_metrics`, or `get_serp_results`');
    expect(skill).toContain('user_confirmed: true');
    expect(skill).toContain('`preview_changes`');
    expect(skill).toContain('`apply_change_set`');
    expect(skill).toContain('complete before snapshot');
    expect(skill).toContain('deployment host reported by `check_connection`');
    expect(agent).toContain('$ghost-seo-optimizer');
  });

  it('packages the minimal approval-gated editorial batch workflow', async () => {
    const [skill, agent] = await Promise.all([
      readFile('.agents/skills/ghost-editorial-batch/SKILL.md', 'utf8'),
      readFile('.agents/skills/ghost-editorial-batch/agents/openai.yaml', 'utf8'),
    ]);

    expect(skill).toMatch(/^---\nname: ghost-editorial-batch\ndescription: .+\n---\n/);
    expect(skill).toContain('Call `audit_content`');
    expect(skill).toContain('Call `preview_changes`');
    expect(skill).toContain('Call `apply_change_set` once');
    expect(skill).toContain('Stop for separate schedule approval');
    expect(skill).toContain('`newsletter: false`');
    expect(skill).toContain('quality score');
    expect(skill).not.toContain('Firecrawl');
    expect(agent).toContain('$ghost-editorial-batch');
  });
});
