import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { writeDay } from '../src/archive.ts';
import { parseCsvRecords } from '../src/csv.ts';
import { sha256 } from '../src/fetch.ts';
import { makeRecord } from '../src/record.ts';
import type { ArchiveRecord } from '../src/record.ts';
import { COVERAGE_FIELDS, recordCoverage } from '../src/record-coverage.ts';

const CLI = resolve(import.meta.dirname, '../src/cli.ts');
const EVENTS = resolve(import.meta.dirname, '../events/2026-fund-crisis.csv');

const rec = (kind: string, capturedAt: string, data: Record<string, unknown>, origin: 'snapshot' | 'backfill' = 'backfill'): string =>
  makeRecord({
    source: 'wayback-tefas-legacy', kind, sourceUrl: 'https://www.tefas.gov.tr/FonAnaliz.aspx?FonKod=TLY', capturedAt, publishedAt: null,
    httpStatus: 200, sha256: sha256(capturedAt), toolVersion: 'fon-izi@0.1.0', origin, witness: { url: null, reason: 'off' }, data,
  } as Omit<ArchiveRecord, 'id'>).line;

function fixtureArchive() {
  const root = mkdtempSync(join(tmpdir(), 'fon-izi-rc-'));
  writeDay(root, 'tefas-backfill', '2026-02-19', [
    rec('fund', '2026-02-19T06:06:08.000Z', { code: 'TLY', unitPrice: 2210.5, totalValue: null, shareCount: null, investorCount: 30000, allocation: [{ assetType: 'Hisse Senedi', percent: 95 }], riskValue: 7, category: 'Serbest Fon' }),
    rec('price-history', '2026-02-19T06:06:08.000Z', { code: 'TLY', prices: [['2026-01-30', 2000], ['2026-02-02', 2010], ['2026-02-18', 2200], ['2026-02-19', 0]] }),
    rec('fund', '2026-02-19T07:00:00.000Z', { code: 'AAL', unitPrice: 3.1, investorCount: 4000 }),
  ]);
  return root;
}

test('coverage for the crisis funds: one row per fund, field and month with a count', () => {
  const root = fixtureArchive();
  const out = join(root, 'coverage.csv');
  const res = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', CLI, 'record-coverage', '--archive', root, '--events', EVENTS, '--from', '2026-01', '--to', '2026-09', '--out', out], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
  const { records } = parseCsvRecords(readFileSync(out, 'utf8'));
  assert.equal(records.length, 131 * COVERAGE_FIELDS.length * 9);
  const get = (code: string, field: string, month: string) => records.find((r) => r.fund_code === code && r.field === field && r.month === month)?.records;
  assert.equal(get('TLY', 'investorCount', '2026-02'), '1');
  assert.equal(get('TLY', 'totalValue', '2026-02'), '0');
  assert.equal(get('TLY', 'prices', '2026-02'), '2'); // the 0 on the capture day is not a price
  assert.equal(get('TLY', 'prices', '2026-01'), '1');
  assert.equal(get('DOH', 'investorCount', '2026-02'), '0');
  assert.ok(!records.some((r) => r.fund_code === 'AAL')); // not in the event set
});

test('codes outside the list are ignored and empty lists still give rows', () => {
  const rows = recordCoverage(fixtureArchive(), ['AAL'], '2026-02', '2026-02');
  assert.equal(rows.find((r) => r.field === 'unitPrice')?.records, 1);
  assert.equal(rows.find((r) => r.field === 'allocation')?.records, 0);
});
