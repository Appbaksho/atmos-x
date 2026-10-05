import { describe, expect, it } from 'vitest';

import { compareMessages, flatten, getAt, hashText, icuSignature, planKeys, rebuildLike, setAt, type JsonObj } from './i18n-lib';

describe('icuSignature', () => {
  it('collects simple, plural and select arguments with their options', () => {
    const sig = icuSignature('{count, plural, =0 {{name}: today} one {{name}: in {days} day} other {{name}: in {days} days}} · {kind, select, max {maximum} other {minimum}}');
    expect([...sig.args].sort()).toEqual(['count:plural', 'days:simple', 'kind:select', 'name:simple']);
    expect([...(sig.options.get('count:plural') ?? [])]).toEqual(['=0', 'one', 'other']);
    expect([...(sig.options.get('kind:select') ?? [])]).toEqual(['max', 'other']);
  });

  it('handles # , tags and apostrophe quoting', () => {
    expect([...icuSignature("{n, plural, one {# tree} other {# trees}} <b>now</b> it's").args]).toEqual(['n:plural']);
    expect(icuSignature('<b>x</b><br/>').tags).toEqual(['</b>', '<b>', '<br/>']);
    // '{n}' is quoted literal text, not a placeholder
    expect([...icuSignature("d'{n}' arbres").args]).toEqual([]);
    expect([...icuSignature("l''{n}").args]).toEqual(['n:simple']);
  });

  it('rejects broken syntax', () => {
    expect(() => icuSignature('{n')).toThrow();
    expect(() => icuSignature('a }')).toThrow();
    expect(() => icuSignature('{n, plural, one {# tree}}')).toThrow(/other/);
    expect(() => icuSignature('{n, plural, one {# tree} other {# trees}')).toThrow();
  });
});

describe('compareMessages', () => {
  const en = '{n, plural, one {# tree} other {# trees}} near {place}';
  it('accepts a faithful translation', () => {
    expect(compareMessages(en, '{n, plural, one {# arbre} other {# arbres}} près de {place}', 'fr')).toEqual([]);
  });
  it('flags lost or renamed placeholders', () => {
    expect(compareMessages(en, '{n, plural, one {# arbre} other {# arbres}} près de {lieu}', 'fr').join()).toMatch(/missing.*place/);
    expect(compareMessages('Hi {name}', 'Hola', 'es').join()).toMatch(/missing/);
  });
  it('allows the plural categories the target language needs, and nothing else', () => {
    expect(compareMessages(en, '{n, plural, zero {# x} one {# x} two {# x} few {# x} many {# x} other {# x}} {place}', 'ar')).toEqual([]);
    expect(compareMessages(en, '{n, plural, other {# 棵树}} {place}', 'zh')).toEqual([]);
    expect(compareMessages(en, '{n, plural, other {# Bäume}} {place}', 'fr')).not.toEqual([]); // fr needs `one`
    expect(compareMessages(en, '{n, plural, one {# x} few {# x} other {# x}} {place}', 'fr')).not.toEqual([]); // fr has no `few`
    expect(compareMessages('{n, plural, =0 {none} other {#}}', '{n, plural, other {#}}', 'hi')).not.toEqual([]);
  });
  it('requires select keys to match exactly', () => {
    expect(compareMessages('{k, select, max {max} other {min}}', '{k, select, maximum {max} other {min}}', 'es')).not.toEqual([]);
  });
  it('enforces the glossary and reports syntax errors', () => {
    expect(compareMessages('Your Heat Score', 'आपका हीट स्कोर', 'hi').join()).toMatch(/Heat Score/);
    expect(compareMessages('Your Heat Score', 'आपका Heat Score', 'hi')).toEqual([]);
    expect(compareMessages('Hi {name}', 'Hola {name', 'es').join()).toMatch(/syntax/);
  });
});

describe('flatten / setAt / rebuildLike', () => {
  const en: JsonObj = { a: 'A', sugg: { heat: ['x', 'y'] }, deep: { b: 'B', c: 'C' } };
  it('flattens arrays by index and skips _meta', () => {
    expect([...flatten({ _meta: { machine: true }, ...en }).keys()]).toEqual(['a', 'sugg.heat.0', 'sugg.heat.1', 'deep.b', 'deep.c']);
  });
  it('creates containers with the English shape', () => {
    const t: JsonObj = {};
    setAt(t, en, 'sugg.heat.1', 'Y');
    setAt(t, en, 'sugg.heat.0', 'X');
    setAt(t, en, 'deep.c', 'cc');
    expect(t).toEqual({ sugg: { heat: ['X', 'Y'] }, deep: { c: 'cc' } });
    expect(getAt(t, 'sugg.heat.1')).toBe('Y');
  });
  it('rebuilds in English order, drops stale keys and partial arrays', () => {
    const t: JsonObj = { stale: 's', deep: { c: 'cc', b: 'bb' }, sugg: { heat: ['X'] }, a: 'aa' };
    expect(JSON.stringify(rebuildLike(en, t))).toBe(JSON.stringify({ a: 'aa', deep: { b: 'bb', c: 'cc' } }));
  });
});

describe('planKeys', () => {
  const en = flatten({ a: 'Alpha', b: 'Beta', c: 'Gamma', d: 'Delta' });
  it('translates missing and changed keys, keeps human and up-to-date ones', () => {
    const target: JsonObj = { a: 'human A', b: 'machine B', c: 'machine C (old)' };
    const cache = { b: hashText('Beta'), c: hashText('Gamma, before the English changed') };
    const plan = planKeys(en, target, cache);
    expect(plan.todo).toEqual(['c', 'd']);
    expect(plan.changed).toEqual(['c']);
    expect(plan.human).toBe(1);
    expect(plan.upToDate).toBe(1);
  });
});
