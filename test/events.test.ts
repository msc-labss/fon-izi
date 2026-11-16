import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { parseCsv, parseCsvRecords, toCsv } from '../src/csv.ts';
import { EVENT_COLUMNS, validateEvents } from '../src/events.ts';

const ROOT = resolve(import.meta.dirname, '..');
const CLI = join(ROOT, 'src/cli.ts');
const run = (...args: string[]) => spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', CLI, ...args], { encoding: 'utf8' });

const row = (over: Record<string, string> = {}) => ({
  fund_code: 'TLY',
  list_number: '126',
  fund_title: 'TERA PORTFÖY BİRİNCİ SERBEST FON',
  manager: 'TERA PORTFÖY',
  event: 'liquidation-ordered',
  event_date: '2026-09-17',
  source_published: '2026-09-17',
  source_url: 'https://spk.gov.tr/data/6aac56ff8f95db07100fd82d/2026-61.pdf',
  source_bulletin: '2026/61',
  source_page: '6',
  match: 'exact folded title',
  ...over,
});

test('the committed event set is valid: 131 funds, two events each', () => {
  const res = run('validate-events');
  assert.equal(res.status, 0, res.stderr);
  const { records } = parseCsvRecords(readFileSync(join(ROOT, 'events/2026-fund-crisis.csv'), 'utf8'));
  assert.equal(records.length, 262);
  assert.equal(new Set(records.map((r) => r.fund_code)).size, 131);
  const tera = records.filter((r) => r.manager === 'TERA PORTFÖY' && r.event === 'liquidation-ordered').map((r) => r.fund_code).sort();
  assert.deepEqual(tera, ['DOH', 'T3B', 'THF', 'TLV', 'TLY', 'TP2']);
});

test('row without citation fails validation, naming the row', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fon-izi-ev-'));
  const file = join(dir, 'bad.csv');
  writeFileSync(file, toCsv(EVENT_COLUMNS, [row(), row({ fund_code: 'DOH', source_url: '', source_page: '', source_bulletin: '' })]));
  const res = run('validate-events', '--events', file);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /row 2 \(DOH, liquidation-ordered\): no source citation/);
  assert.doesNotMatch(res.stderr, /row 1 /);
});

test('a URL alone is not a citation; a page or bulletin number is needed', () => {
  const { errors } = validateEvents(toCsv(EVENT_COLUMNS, [row({ source_page: '', source_bulletin: '' })]));
  assert.deepEqual(errors, ['row 1 (TLY, liquidation-ordered): no source citation (needs source_page or source_bulletin)']);
});

test('duplicate fund and event, bad code and bad date are reported', () => {
  const { errors } = validateEvents(toCsv(EVENT_COLUMNS, [row(), row(), row({ fund_code: 'tly1x', event_date: '17.09.2026' })]));
  assert.ok(errors.some((e) => e.includes('row 2') && e.includes('duplicate')));
  assert.ok(errors.some((e) => e.includes('fund_code must be a TEFAS code')));
  assert.ok(errors.some((e) => e.includes('event_date must be YYYY-MM-DD')));
});

test('CSV round trip with quotes, commas and newlines', () => {
  const records = [{ a: 'plain', b: 'with, comma' }, { a: 'say "hi"', b: 'two\nlines' }];
  const text = toCsv(['a', 'b'], records);
  assert.deepEqual(parseCsvRecords(text).records, records);
  assert.deepEqual(parseCsv('x,y\r\n1,2\r\n'), [['x', 'y'], ['1', '2']]);
  assert.throws(() => parseCsv('"open'), /unterminated/);
});
