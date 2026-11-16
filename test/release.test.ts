import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { buildManifest, checkRelease, verifyRelease } from '../src/release.ts';

const ROOT = resolve(import.meta.dirname, '..');
const CLI = join(ROOT, 'src/cli.ts');
const terms = JSON.parse(readFileSync(join(ROOT, 'wording.json'), 'utf8')).terms;

/** A small release: texts, licences, schemas, the event set and a backtest table. */
function fixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'fon-izi-rel-'));
  for (const f of ['README.md', 'LICENSE', 'LICENSE-DATA', 'METHOD.md', 'docs/schema.md', 'events/2026-fund-crisis.csv', 'events/2026-timeline.csv']) {
    mkdirSync(join(dir, f, '..'), { recursive: true });
    cpSync(join(ROOT, f), join(dir, f));
  }
  mkdirSync(join(dir, 'tables'));
  writeFileSync(join(dir, 'tables/backtest-leadtimes.csv'), 'code,flag,event,status,since,days\nTLY,repo-borrowing,liquidation-ordered,lead,2026-07-31,48\n');
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(buildManifest(dir, 'test', '2026-11-16T00:00:00.000Z', { version: 'v0', sha256: 'x' })));
  return dir;
}
const run = (...args: string[]) => spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', CLI, ...args], { encoding: 'utf8' });

test('verification passes on an unmodified release, and the release check is clean', () => {
  const dir = fixture();
  assert.deepEqual(verifyRelease(dir), []);
  assert.deepEqual(checkRelease(dir, terms), []);
  assert.equal(run('verify-release', dir).status, 0);
  const m = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
  assert.equal(m.files.find((f: { path: string }) => f.path === 'events/2026-fund-crisis.csv').rows, 262);
});

test('altered file: one changed byte fails verification, naming the file', () => {
  const dir = fixture();
  const p = join(dir, 'tables/backtest-leadtimes.csv');
  writeFileSync(p, readFileSync(p, 'utf8').replace(',48', ',49'));
  const res = run('verify-release', dir);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /tables\/backtest-leadtimes\.csv: SHA-256 does not match the manifest/);
});

test('locale-formatted number in a numeric column fails, naming table, row and column', () => {
  const dir = fixture();
  writeFileSync(join(dir, 'tables/backtest-leadtimes.csv'), 'code,flag,event,status,since,days\nTLY,repo-borrowing,liquidation-ordered,lead,2026-07-31,"1.234,5"\n');
  assert.deepEqual(checkRelease(dir, terms), ['tables/backtest-leadtimes.csv: row 1, column days: "1.234,5" is not a plain number']);
});

test('raw body from a hash-only source fails the release check', () => {
  const dir = fixture();
  mkdirSync(join(dir, 'raw/ab'), { recursive: true });
  writeFileSync(join(dir, 'raw/ab/abcdef'), '<html>tefas page</html>');
  assert.ok(checkRelease(dir, terms).some((e) => e.startsWith('raw/ab/abcdef: raw body from a hash-only source')));
});

test('a table without a schema, and evaluative wording in a release text, fail the check', () => {
  const dir = fixture();
  writeFileSync(join(dir, 'tables/extra.csv'), 'a\n1\n');
  writeFileSync(join(dir, 'NOTES.md'), 'This fund was risky.\n');
  const errors = checkRelease(dir, terms);
  assert.ok(errors.includes('tables/extra.csv: no schema in docs/schema.md'));
  assert.ok(errors.includes('NOTES.md:1: "risky"'));
});
