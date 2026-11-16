import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cdxQuery, isUsable, parseCdx } from '../src/cdx.ts';
import type { Capture } from '../src/cdx.ts';
import { coverageRows, months } from '../src/coverage.ts';
import { apportion, drawSample, mulberry32 } from '../src/sample.ts';

const cap = (timestamp: string, status = '200', length = 450_000): Capture => ({ timestamp, original: 'x', status, mimetype: 'text/html', length });

test('CDX output is parsed by header names', () => {
  const text = JSON.stringify([
    ['timestamp', 'original', 'statuscode', 'mimetype', 'length'],
    ['20250818045739', 'https://www.tefas.gov.tr/FonAnaliz.aspx?FonKod=TLY', '200', 'text/html', '460985'],
  ]);
  assert.deepEqual(parseCdx(text), [{ timestamp: '20250818045739', original: 'https://www.tefas.gov.tr/FonAnaliz.aspx?FonKod=TLY', status: '200', mimetype: 'text/html', length: 460985 }]);
  assert.deepEqual(parseCdx(''), []);
  assert.deepEqual(parseCdx('[]'), []);
  assert.match(cdxQuery('https://www.tefas.gov.tr/FonAnaliz.aspx?FonKod=TLY', '202501', '202609'), /url=https%3A%2F%2Fwww\.tefas\.gov\.tr%2FFonAnaliz\.aspx%3FFonKod%3DTLY&from=202501&to=202609&output=json/);
});

test('usable captures: status 200 and at least 20 KB archived', () => {
  assert.ok(isUsable(cap('20250818045739')));
  assert.ok(!isUsable(cap('20260520065339', '200', 929))); // WAF "Request Rejected"
  assert.ok(!isUsable(cap('20260607155138', '200', 3631))); // bot challenge
  assert.ok(!isUsable(cap('20250818045739', '302')));
});

test('months are inclusive and cross years', () => {
  assert.deepEqual(months('2025-11', '2026-02'), ['2025-11', '2025-12', '2026-01', '2026-02']);
  assert.equal(months('2025-01', '2026-09').length, 21);
});

test('sample quotas follow the event set by largest remainder', () => {
  const quotas = apportion({ 'Serbest Şemsiye Fonu': 117, 'Para Piyasası Şemsiye Fonu': 9, 'Katılım Şemsiye Fonu': 3, 'Hisse Senedi Şemsiye Fonu': 2 }, 200);
  assert.deepEqual(quotas, { 'Serbest Şemsiye Fonu': 179, 'Para Piyasası Şemsiye Fonu': 14, 'Katılım Şemsiye Fonu': 4, 'Hisse Senedi Şemsiye Fonu': 3 });
});

test('the seeded draw is reproducible and respects quotas', () => {
  const pool = Array.from({ length: 50 }, (_, i) => ({ code: `F${String(i).padStart(2, '0')}`, stratum: i % 5 === 0 ? 'b' : 'a' }));
  const a = drawSample(pool, { a: 7, b: 3 }, 20261116);
  const b = drawSample(pool, { a: 7, b: 3 }, 20261116);
  assert.deepEqual(a, b);
  assert.equal(a.filter((c) => c.stratum === 'a').length, 7);
  assert.equal(a.filter((c) => c.stratum === 'b').length, 3);
  assert.notDeepEqual(drawSample(pool, { a: 7, b: 3 }, 1), a);
  assert.throws(() => drawSample(pool, { b: 11 }, 1), /stratum b/);
  const r = mulberry32(1);
  for (let i = 0; i < 100; i++) {
    const x = r();
    assert.ok(x >= 0 && x < 1);
  }
});

test('coverage rows count captures per month, usable apart', () => {
  const rows = coverageRows({ code: 'TLY', group: 'event', stratum: 'Serbest Şemsiye Fonu' }, ['2025-08', '2026-05', '2026-06'], [cap('20250818045739'), cap('20250820015135'), cap('20260520065339', '200', 929)], [cap('20260607155138', '200', 3631)]);
  assert.deepEqual(
    rows.map((r) => [r.month, r.old_captures, r.old_usable, r.new_captures, r.new_usable, r.first_usable]),
    [
      ['2025-08', 2, 2, 0, 0, '20250818045739'],
      ['2026-05', 1, 0, 0, 0, ''],
      ['2026-06', 0, 0, 1, 0, ''],
    ],
  );
});
