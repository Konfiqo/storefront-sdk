// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pkg = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version?: string; files?: string[]; dependencies?: object };

describe('package.json', () => {
  it('is at 0.7.0 and ships only dist, README and LICENSE', () => {
    expect(pkg.version).toBe('0.7.0');
    expect(pkg.files).toEqual(['dist', 'README.md', 'LICENSE']);
  });

  it('has no runtime dependencies', () => {
    expect(pkg.dependencies).toBeUndefined();
  });
});
