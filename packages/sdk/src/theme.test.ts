import { describe, expect, it } from 'vitest';
import { isKnownThemeSection, type ThemeV1 } from './index';

describe('theme', () => {
  it('keeps known sections and skips unknown or malformed ones', () => {
    const theme: ThemeV1 = {
      schemaVersion: 1,
      font: 'inter',
      homepage: {
        sections: [
          { type: 'hero', title: 'Merhaba' },
          { type: 'carousel', slides: [] },
          { type: 'richText', content: 'Metin' },
        ],
      },
      futureKey: { anything: true },
    };
    const sections: unknown[] = [
      ...(theme.homepage?.sections ?? []),
      null,
      'x',
      { type: 1 },
    ];
    const known = sections.filter(isKnownThemeSection);
    expect(known.map((s) => s.type)).toEqual(['hero', 'richText']);
    const titles = known.map((s) =>
      s.type === 'hero' ? s.title : s.type === 'richText' ? s.content : '',
    );
    expect(titles).toEqual(['Merhaba', 'Metin']);
  });
});
