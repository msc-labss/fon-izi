import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { endOfTefasDay } from '../src/dump-import.ts';
import { sha256 } from '../src/fetch.ts';
import { buildIndex, evaluate, FLAG_IDS, RESULT_COLUMNS } from '../src/flags.ts';
import { parseMethod } from '../src/method.ts';
import { makeRecord } from '../src/record.ts';
import type { ArchiveRecord } from '../src/record.ts';
import { toCsv } from '../src/csv.ts';

const ROOT = resolve(import.meta.dirname, '..');
const method = parseMethod(readFileSync(join(ROOT, 'METHOD.md'), 'utf8'));

const rec = (kind: string, capturedAt: string, publishedAt: string | null, data: Record<string, unknown>): ArchiveRecord =>
  makeRecord({ source: 'test', kind, sourceUrl: 'https://example.org/x', capturedAt, publishedAt, httpStatus: 200, sha256: sha256(JSON.stringify(data)), toolVersion: 'fon-izi@0.1.0', origin: 'backfill', witness: { url: null, reason: 'off' }, data }).record;

/** 40 funds with daily figures on two dates; TLY grows fast; a holdings report and cards. */
function fixture(extra: ArchiveRecord[] = []): ArchiveRecord[] {
  const day = (date: string, f: (i: number) => Record<string, unknown>[]) => rec('daily-figures', '2026-09-05T13:52:08.000Z', endOfTefasDay(date), { date, rows: f(0) });
  const others = (k: number) => Array.from({ length: 39 }, (_, i) => ({ code: `F${String(i).padStart(2, '0')}`, price: 1 + i * 0.001 * k, investors: 500, size: 1e8, units: 1e8 }));
  return [
    day('2026-05-15', () => [{ code: 'TLY', price: 100, investors: 5000, size: 1e9, units: 1e7 }, ...others(0)]),
    day('2026-08-13', () => [{ code: 'TLY', price: 400, investors: 43000, size: 3.5e10, units: 8.75e7 }, ...others(1)]),
    rec('fund', '2026-03-25T15:10:21.000Z', null, { code: 'TLY', title: 'TERA PORTFÖY BİRİNCİ SERBEST FON', category: 'Serbest Fon', investorCount: 30000, allocation: [{ assetType: 'Hisse Senedi', percent: 100 }] }),
    rec('fund', '2026-03-25T15:10:21.000Z', null, { code: 'DOH', title: 'TERA PORTFÖY DÖRDÜNCÜ HİSSE SENEDİ SERBEST (TL) FON', category: 'Serbest Fon' }),
    rec('fund', '2026-03-25T15:10:21.000Z', null, { code: 'THF', title: 'TERA PORTFÖY HİSSE SENEDİ (TL) FONU', category: 'Hisse Senedi Fonu' }),
    rec('daily-allocation', '2026-09-08T14:05:07.000Z', endOfTefasDay('2026-08-12'), { date: '2026-08-12', rows: [{ code: 'TLY', allocation: { hs: 79.48, r: -7.61, tr: 14.9 } }] }),
    ...['TLY', 'DOH', 'THF'].map((code) => rec('holdings-report', '2026-08-10T06:17:16.000Z', null, { code, reportMonth: '2026-07', holdings: [{ issuer: 'Özata', bistCode: 'OZATD', isin: 'TREOZAT00023', assetType: 'Hisse', nominal: 1, marketValue: 1, weight: code === 'THF' ? 12 : 30 }] })),
    ...extra,
  ];
}

const byFlag = (results: ReturnType<typeof evaluate>) => Object.fromEntries(results.map((r) => [r.flag, r]));

test('flag missing from the method document: engine and METHOD.md define the same flags', () => {
  assert.deepEqual([...FLAG_IDS].sort(), method.flags.map((f) => f.id).sort());
});

test('the measured flags on a fixture: returns, investors, inflow, repo, cluster, reach', () => {
  const r = byFlag(evaluate(buildIndex(fixture()), method, 'TLY', '2026-08-13'));
  assert.equal(r['return-vs-peers'].status, 'ok');
  assert.equal(r['return-vs-peers'].triggered, true); // +300% against 39 funds near 0%
  assert.equal(r['investor-growth'].value, 8.6);
  assert.equal(r['investor-growth'].triggered, true);
  assert.equal(r['net-inflow'].triggered, true);
  assert.equal(r['repo-borrowing'].value, -7.61);
  assert.equal(r['repo-borrowing'].triggered, true);
  assert.equal(r['manager-cluster'].value, 3); // TLY, DOH and THF each hold >= 10% in OZATD
  assert.equal(r['manager-cluster'].triggered, true);
  assert.equal(r['reach-vs-type'].value, 43000);
});

test('inputs resolve in the archive', () => {
  const records = fixture();
  const ids = new Set(records.map((r) => r.id));
  for (const res of evaluate(buildIndex(records), method, 'TLY', '2026-08-13')) for (const id of res.inputs ? res.inputs.split(';') : []) assert.ok(ids.has(id), `${res.flag}: ${id}`);
});

test('record published the day after is not used', () => {
  const late = rec('daily-allocation', '2026-09-08T14:05:07.000Z', endOfTefasDay('2026-08-14'), { date: '2026-08-13', rows: [{ code: 'TLY', allocation: { r: -40 } }] });
  const before = byFlag(evaluate(buildIndex(fixture()), method, 'TLY', '2026-08-13'));
  const after = byFlag(evaluate(buildIndex(fixture([late])), method, 'TLY', '2026-08-13'));
  assert.deepEqual(after['repo-borrowing'], before['repo-borrowing']);
});

test('no volume source: days-to-exit is insufficient-data; so is free-float-share', () => {
  const r = byFlag(evaluate(buildIndex(fixture()), method, 'TLY', '2026-08-13'));
  assert.equal(r['days-to-exit'].status, 'insufficient-data');
  assert.equal(r['days-to-exit'].triggered, '');
  assert.equal(r['free-float-share'].status, 'insufficient-data');
});

test('missing input is not a pass: a fund with no data is insufficient-data, never untriggered', () => {
  for (const res of evaluate(buildIndex(fixture()), method, 'ZZZ', '2026-08-13')) assert.equal(res.status, 'insufficient-data', res.flag);
});

test('output schema has no score, grade, colour or rank column', () => {
  for (const c of RESULT_COLUMNS) assert.doesNotMatch(c, /score|grade|colou?r|rank/i);
});

test('two runs give byte-identical results', () => {
  const run = () => sha256(toCsv(RESULT_COLUMNS, ['TLY', 'DOH', 'THF', 'F01'].flatMap((c) => evaluate(buildIndex(fixture()), method, c, '2026-08-13')) as unknown as Record<string, string>[]));
  assert.equal(run(), run());
});
