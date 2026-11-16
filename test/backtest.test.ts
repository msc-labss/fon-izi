import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { controlShare, fridays, leadTime, reportSection, runBacktest } from '../src/backtest.ts';
import type { Point } from '../src/backtest.ts';
import { endOfTefasDay } from '../src/dump-import.ts';
import { sha256 } from '../src/fetch.ts';
import { buildIndex, evaluate } from '../src/flags.ts';
import { parseMethod } from '../src/method.ts';
import { makeRecord } from '../src/record.ts';
import type { ArchiveRecord } from '../src/record.ts';

const ROOT = resolve(import.meta.dirname, '..');
const method = parseMethod(readFileSync(join(ROOT, 'METHOD.md'), 'utf8'));
const rec = (kind: string, capturedAt: string, publishedAt: string | null, data: Record<string, unknown>): ArchiveRecord =>
  makeRecord({ source: 'test', kind, sourceUrl: 'https://example.org/x', capturedAt, publishedAt, httpStatus: 200, sha256: sha256(JSON.stringify(data)), toolVersion: 'fon-izi@0.1.0', origin: 'backfill', witness: { url: null, reason: 'off' }, data }).record;

const weekly = (from: string, to: string, f: (d: string) => Point['triggered'], status: Point['status'] = 'ok'): Point[] => {
  const out: Point[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 7 * 86_400_000) {
    const date = new Date(t).toISOString().slice(0, 10);
    out.push({ date, status, triggered: status === 'ok' ? f(date) : '' });
  }
  return out;
};

test('the grid is every Friday from 3 Jan 2025', () => {
  const g = fridays('2025-01-03', '2026-09-17');
  assert.equal(g[0], '2025-01-03');
  assert.equal(g.at(-1), '2026-09-11');
  assert.ok(g.every((d) => new Date(`${d}T00:00:00Z`).getUTCDay() === 5));
  assert.throws(() => fridays('2025-01-01', '2025-02-01'), /not a Friday/);
});

test('flag fires early: triggered from 2 June 2026 until the event on 17 September gives 107 days', () => {
  const series = weekly('2026-03-03', '2026-09-15', (d) => d >= '2026-06-02');
  assert.deepEqual(leadTime(series, '2026-09-17'), { status: 'lead', since: '2026-06-02', days: 107 });
});

test('never, and insufficient data ending a streak', () => {
  assert.deepEqual(leadTime(weekly('2026-06-02', '2026-09-15', () => false), '2026-09-17'), { status: 'never', since: null, days: null });
  assert.deepEqual(leadTime(weekly('2026-06-02', '2026-09-15', () => '', 'insufficient-data'), '2026-09-17'), { status: 'insufficient-data', since: null, days: null });
  const gap: Point[] = [...weekly('2026-06-02', '2026-06-30', () => true), { date: '2026-07-07', status: 'insufficient-data', triggered: '' }, ...weekly('2026-07-14', '2026-09-15', () => true)];
  assert.equal(leadTime(gap, '2026-09-17').since, '2026-07-14');
});

/** Event fund TLY and control funds C00..C29 with daily figures for two dates. */
function records(extra: ArchiveRecord[] = []): ArchiveRecord[] {
  const rows = (k: number) => [{ code: 'TLY', price: 100 * (1 + 3 * k), investors: 5000 * (1 + 8 * k), size: 1e9 * (1 + 30 * k) }, ...Array.from({ length: 30 }, (_, i) => ({ code: `C${String(i).padStart(2, '0')}`, price: 1 + 0.001 * i * k, investors: 500, size: 1e8 }))];
  return [
    rec('daily-figures', '2026-09-05T13:52:08.000Z', endOfTefasDay('2026-05-15'), { date: '2026-05-15', rows: rows(0) }),
    rec('daily-figures', '2026-09-05T13:52:08.000Z', endOfTefasDay('2026-08-13'), { date: '2026-08-13', rows: rows(1) }),
    ...extra,
  ];
}

const run = (recs: ArchiveRecord[], m = method, runAt = '2026-11-16T20:00:00.000Z') =>
  runBacktest({ ix: buildIndex(recs), method: m, events: [{ code: 'TLY', event: 'liquidation-ordered', date: '2026-09-17' }], controls: Array.from({ length: 30 }, (_, i) => `C${String(i).padStart(2, '0')}`), runAt, archiveDigest: 'x', gridFrom: '2026-08-14' });

test('late record has no effect on the grid date before it', () => {
  const late = rec('daily-allocation', '2026-09-30T00:00:00.000Z', endOfTefasDay('2026-08-15'), { date: '2026-08-14', rows: [{ code: 'TLY', allocation: { r: -40 } }] });
  const a = evaluate(buildIndex(records()), method, 'TLY', '2026-08-14');
  const b = evaluate(buildIndex(records([late])), method, 'TLY', '2026-08-14');
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test('control rate shown with lead time, in the same row of the report', () => {
  const r = run(records());
  const md = reportSection(r);
  for (const f of r.flags) {
    const row = md.split('\n').find((l) => l.startsWith(`| ${f.flag} |`));
    assert.ok(row, f.flag);
    assert.match(row!, /\(\S+\) \| \d+ of 1 \| \d+ of 30 \| \d+ \(/);
  }
  const ivg = r.flags.find((f) => f.flag === 'investor-growth')!;
  assert.equal(ivg.lead[0].lead, 1);
  assert.equal(ivg.control.withData, 30);
  assert.equal(ivg.control.everTriggered, 0);
});

test('fund without holdings data: holdings-based flags count as insufficient-data, not never', () => {
  const mc = run(records()).flags.find((f) => f.flag === 'manager-cluster')!;
  assert.deepEqual({ lead: mc.lead[0].lead, never: mc.lead[0].never, insufficient: mc.lead[0].insufficient }, { lead: 0, never: 0, insufficient: 1 });
});

test('second method version: both runs stay in the report', () => {
  const v1 = { ...method, version: 'v1', sha256: 'f'.repeat(64) };
  const report = reportSection(run(records())) + reportSection(run(records(), v1, '2026-11-17T20:00:00.000Z'));
  assert.match(report, /## Run 2026-11-16T20:00:00\.000Z · method v0/);
  assert.match(report, /## Run 2026-11-17T20:00:00\.000Z · method v1/);
  assert.ok(report.includes(method.sha256) && report.includes('f'.repeat(64)));
});

test('control share counts funds with data apart from funds it fired for', () => {
  const s = controlShare([
    { fund_code: 'A', date: '2026-01-02', status: 'ok', triggered: true },
    { fund_code: 'A', date: '2026-01-09', status: 'ok', triggered: false },
    { fund_code: 'B', date: '2026-01-02', status: 'ok', triggered: false },
    { fund_code: 'C', date: '2026-01-02', status: 'insufficient-data', triggered: '' },
  ]);
  assert.deepEqual([s.withData, s.everTriggered], [2, 1]);
  assert.deepEqual(s.byDate, [{ date: '2026-01-02', ok: 2, triggered: 1 }, { date: '2026-01-09', ok: 1, triggered: 0 }]);
});
