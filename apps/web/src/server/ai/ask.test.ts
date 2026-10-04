import { describe, expect, it } from 'vitest';

import { serverT } from '../i18n';
import { actionsFor, prefetchFor, sseEncode } from './ask';
import { kindOf, screenKind } from './canned';
import { renderCodes } from './tools';

describe('Ask Atmos helpers', () => {
  it('encodes SSE events as `event: type` + JSON data', () => {
    expect(sseEncode({ type: 'token', text: 'hi' })).toBe('event: token\ndata: {"type":"token","text":"hi"}\n\n');
  });
  it('detects the topic in en / bn / ur', () => {
    expect(kindOf('Should I open the windows now?', 'heat')).toBe('air');
    expect(kindOf('আমার এলাকা এত গরম কেন?', 'tree')).toBe('heat');
    expect(kindOf('ধান কবে কাটা যাবে?', 'heat')).toBe('farm');
    expect(kindOf('میرے درخت کے پتے', 'heat')).toBe('tree');
    expect(screenKind('S04', true)).toBe('farm');
    expect(screenKind('S26', false)).toBe('air');
  });
  it('prefetches the zone on S06 and never suggests more than 2 actions', () => {
    expect(prefetchFor('S06', 'heat', true)).toContain('get_zone');
    expect(prefetchFor('S26', 'air', false)).toContain('get_air');
    expect(actionsFor('heat', { zoneId: 'z-x-500', screen: 'S04' }).length).toBeLessThanOrEqual(2);
    expect(actionsFor('farm', { alertId: 'rice_heat-2026-10-05', screen: 'F01' })[0]).toMatchObject({ screen: 'F02', params: { id: 'rice_heat-2026-10-05' } });
  });
  it('renders I18nText codes for the model, with locale digits', () => {
    const out = renderCodes({ causes: [{ code: 'cause.low_green', params: { pct: 6, adds_c: 1.4 } }] }, 'bn') as { causes: string[] };
    expect(out.causes[0]).toContain('৬');
    expect(serverT('en', 'zone.unnamed', { n: 3 })).toBe('Zone 3');
  });
});
