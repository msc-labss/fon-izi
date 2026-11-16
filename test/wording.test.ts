import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { checkWording } from '../src/wording.ts';

const ROOT = resolve(import.meta.dirname, '..');
const terms = JSON.parse(readFileSync(join(ROOT, 'wording.json'), 'utf8')).terms;

test('unquoted term fails, naming file and line', () => {
  assert.deepEqual(checkWording('case-file/en.md', 'Intro.\nThis was a Ponzi structure.\n', terms), ['case-file/en.md:2: "ponzi"']);
  assert.deepEqual(checkWording('t.md', 'Bu fon riskli görünüyordu.', terms), ['t.md:1: "riskli"']);
  assert.deepEqual(checkWording('t.md', 'Bu bir dolandırıcılıktı.', terms), ['t.md:1: "dolandirici"']);
});

test('quoted official wording passes', () => {
  assert.deepEqual(checkWording('t.md', 'SPK wrote of “piyasa dolandırıcılığı” [SPK Bülten 2026/65, s. 2] in its decision.', terms), []);
  assert.deepEqual(checkWording('t.md', 'In SPK\'s words, "market manipulation" [SPK Bulletin 2026/65, p. 2].', terms), []);
  assert.equal(checkWording('t.md', 'SPK wrote of "market manipulation" in a decision.', terms).length, 1); // no citation, no exception
});

test('word boundaries: safeguard is not safe, risk is not risky', () => {
  assert.deepEqual(checkWording('t.md', 'The control group is the safeguard; every flag has a risk value.', terms), []);
});

test('the repository texts are clean', () => {
  const res = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', join(ROOT, 'src/cli.ts'), 'check-wording'], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
});
