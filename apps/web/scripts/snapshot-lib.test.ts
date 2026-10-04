import { describe, expect, it } from 'vitest';

import { fileNameFor, renderIndex } from './snapshot-lib';

describe('snapshot index', () => {
  it('maps names to files and rejects unsafe names', () => {
    expect(fileNameFor('zones.500.bn')).toBe('zones.500.bn.json');
    expect(() => fileNameFor('../x')).toThrow();
  });
  it('renders sorted, de-duplicated static imports', () => {
    const src = renderIndex(['zones.500.en', 'air', 'air']);
    expect(src).toContain("import s0 from './air.json';");
    expect(src).toContain("'zones.500.en': s1,");
    expect(src.match(/import /g)?.length).toBe(2);
  });
});
