import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { matchSource, requireSource, validateRegistry } from '../src/registry.ts';
import type { Source } from '../src/registry.ts';

const ROOT = resolve(import.meta.dirname, '..');
const CLI = join(ROOT, 'src/cli.ts');

const entry = (over: Record<string, unknown> = {}) => ({
  id: 'example',
  urlPrefix: 'https://example.org/funds/',
  cadence: 'daily',
  fields: ['code'],
  ...over,
});

function runCheck(registry: unknown) {
  const dir = mkdtempSync(join(tmpdir(), 'fon-izi-'));
  const file = join(dir, 'sources.json');
  writeFileSync(file, JSON.stringify(registry));
  return spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', CLI, 'check', '--registry', file], { encoding: 'utf8' });
}

test('the committed registry is valid', () => {
  const res = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', CLI, 'check'], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
});

test('unregistered source is refused, naming the URL', () => {
  const { sources } = validateRegistry(JSON.parse(readFileSync(join(ROOT, 'sources.json'), 'utf8')));
  assert.throws(() => requireSource('https://www.tefas.gov.tr/api/funds/x', sources), /unregistered source: https:\/\/www\.tefas\.gov\.tr\/api\/funds\/x/);
  assert.equal(requireSource('https://www.tefas.gov.tr/tr/fon-detayli-analiz/TLY', sources).id, 'tefas-fund-detail');
});

test('publish policy needs a terms reference', () => {
  const res = runCheck({ sources: [entry({ id: 'no-terms', rawPolicy: 'publish' })] });
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /no-terms: rawPolicy "publish" needs a termsRef/);
});

test('an entry without a terms reference is hash-only', () => {
  const { sources, errors } = validateRegistry({ sources: [entry()] });
  assert.deepEqual(errors, []);
  assert.equal(sources[0].rawPolicy, 'hash-only');
});

test('termsRef must point at an existing file when a checker is given', () => {
  const { errors } = validateRegistry({ sources: [entry({ termsRef: 'docs/missing.md#x' })] }, { fileExists: () => false });
  assert.deepEqual(errors, ['example: termsRef file not found: docs/missing.md']);
});

test('bad entries are reported by id', () => {
  const { errors } = validateRegistry({ sources: [entry({ urlPrefix: 'http://example.org/', cadence: 'hourly', extra: 1 }), entry()] });
  assert.ok(errors.includes('example: unknown field "extra"'));
  assert.ok(errors.includes('example: urlPrefix must use https'));
  assert.ok(errors.some((e) => e.startsWith('example: cadence must be one of')));
  assert.ok(errors.includes('example: duplicate id'));
});

test('prefixes match at a path boundary and the longest wins', () => {
  const sources: Source[] = [
    { id: 'list', urlPrefix: 'https://x.org/tr/fon-getirileri', cadence: 'daily', fields: ['code'], rawPolicy: 'hash-only' },
    { id: 'all', urlPrefix: 'https://x.org/tr/', cadence: 'daily', fields: ['code'], rawPolicy: 'hash-only' },
  ];
  assert.equal(matchSource('https://x.org/tr/fon-getirileri', sources)?.id, 'list');
  assert.equal(matchSource('https://x.org/tr/fon-getirileri?x=1', sources)?.id, 'list');
  assert.equal(matchSource('https://x.org/tr/fon-getirileri-eski', sources)?.id, 'all');
  assert.equal(matchSource('https://x.org/en/', sources), null);
});
