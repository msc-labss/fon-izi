import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { dayPath, validateArchive, writeCorrections, writeDay, writeRaw } from '../src/archive.ts';
import { sha256 } from '../src/fetch.ts';
import { canonicalJson, makeRecord, validateRecord } from '../src/record.ts';
import type { ArchiveRecord } from '../src/record.ts';

const CLI = resolve(import.meta.dirname, '../src/cli.ts');
const tmp = () => mkdtempSync(join(tmpdir(), 'fon-izi-'));

const fields = (over: Partial<Omit<ArchiveRecord, 'id'>> = {}): Omit<ArchiveRecord, 'id'> => ({
  source: 'tefas-fund-detail',
  kind: 'fund',
  sourceUrl: 'https://www.tefas.gov.tr/tr/fon-detayli-analiz/TLY',
  capturedAt: '2026-11-17T03:12:44.120Z',
  publishedAt: null,
  httpStatus: 200,
  sha256: sha256('page'),
  toolVersion: 'fon-izi@0.1.0',
  origin: 'snapshot',
  witness: { url: null, reason: 'off' },
  data: { code: 'TLY', investorCount: 104210 },
  ...over,
});

test('a record line is canonical and its id is the SHA-256 of the line without id', () => {
  const { record, line } = makeRecord(fields());
  const parsed = JSON.parse(line);
  assert.equal(Object.keys(parsed)[0], 'id');
  const { id, ...rest } = parsed;
  assert.equal(id, record.id);
  assert.equal(sha256(canonicalJson(rest)), id);
  assert.deepEqual(validateRecord(parsed), []);
});

test('record without provenance is rejected, naming the record and the field', () => {
  const root = tmp();
  const good = makeRecord(fields()).line;
  const broken = JSON.parse(makeRecord(fields({ data: { code: 'AAL' } })).line);
  delete broken.sha256;
  writeDay(root, 'tefas', '2026-11-17', [good, JSON.stringify(broken)]);
  const res = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', CLI, 'validate-archive', '--archive', root], { encoding: 'utf8' });
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, new RegExp(`tefas/2026/11/2026-11-17\\.jsonl:2 ${broken.id.slice(0, 12)}: missing sha256`));
  assert.doesNotMatch(res.stderr, /:1 /);
});

test('an edited record no longer matches its id', () => {
  const rec = JSON.parse(makeRecord(fields()).line);
  rec.data.investorCount = 1;
  assert.deepEqual(validateRecord(rec), ['id does not match content']);
});

test('overwrite attempt: an existing day file is refused', () => {
  const root = tmp();
  const line = makeRecord(fields()).line;
  writeDay(root, 'tefas', '2026-11-17', [line]);
  assert.throws(() => writeDay(root, 'tefas', '2026-11-17', [line]), /refusing to overwrite .*2026-11-17\.jsonl/);
  assert.equal(readFileSync(dayPath(root, 'tefas', '2026-11-17'), 'utf8'), `${line}\n`);
});

test('a correction is a new record that names the record it corrects', () => {
  const root = tmp();
  const original = makeRecord(fields());
  writeDay(root, 'tefas', '2026-11-17', [original.line]);
  const fix = makeRecord(fields({ kind: 'correction', corrects: original.record.id, data: { code: 'TLY', investorCount: 104211 } }));
  writeCorrections(root, '2026-11-18', [fix.line]);
  const { records, errors } = validateArchive(root);
  assert.equal(records, 2);
  assert.deepEqual(errors, []);
  assert.equal(readFileSync(dayPath(root, 'tefas', '2026-11-17'), 'utf8'), `${original.line}\n`);
});

test('disclosure with a publication stamp keeps both times apart', () => {
  const { record } = makeRecord(fields({ source: 'example-disclosure', kind: 'disclosure', publishedAt: '2026-08-18T17:42:00.000Z' }));
  assert.equal(record.publishedAt, '2026-08-18T17:42:00.000Z');
  assert.equal(record.capturedAt, '2026-11-17T03:12:44.120Z');
});

test('page without a publication stamp has an empty publication time', () => {
  const { record } = makeRecord(fields());
  assert.equal(record.publishedAt, null);
  assert.deepEqual(validateRecord(JSON.parse(makeRecord(fields({ publishedAt: '' as unknown as null })).line)), ['publishedAt must be null or a time']);
});

test('a witness without url needs a reason', () => {
  assert.ok(validateRecord(JSON.parse(makeRecord(fields({ witness: { url: null, reason: null } })).line)).includes('witness without url needs a reason'));
});

test('raw bodies are content-addressed and written once', () => {
  const root = tmp();
  const h = sha256('raw body');
  const p = writeRaw(root, h, 'raw body');
  assert.equal(writeRaw(root, h, 'raw body'), p);
  assert.ok(existsSync(p));
  writeFileSync(join(root, 'note.txt'), 'not scanned');
  assert.deepEqual(validateArchive(root), { records: 0, errors: [] });
});
