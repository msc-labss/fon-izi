import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

const DIR = resolve(import.meta.dirname, '../.github/workflows');
const read = (name: string) => readFileSync(join(DIR, name), 'utf8');
/** Lines that are not comments. */
const code = (text: string) => text.split('\n').filter((l) => !/^\s*#/.test(l));

test('every workflow uses first-party actions only', () => {
  for (const name of readdirSync(DIR).filter((f) => f.endsWith('.yml'))) {
    for (const line of code(read(name))) {
      const m = /^\s*-?\s*uses:\s*(\S+)/.exec(line);
      if (m) assert.match(m[1], /^actions\/[a-z-]+@v\d+$/, `${name}: ${m[1]}`);
    }
  }
});

test('snapshot workflow: manual only until publication is approved, contents write only', () => {
  const lines = code(read('snapshot.yml'));
  const text = lines.join('\n');
  assert.match(text, /^on:\n {2}workflow_dispatch:\n\n/m);
  assert.doesNotMatch(text, /^\s*schedule:/m);
  assert.match(read('snapshot.yml'), /^#\s+- cron: '0 3 \* \* \*'$/m);
  assert.match(text, /^permissions:\n {2}contents: write\n\n/m);
  assert.equal((text.match(/^\s*permissions:/gm) ?? []).length, 1);
  assert.match(text, /^defaults:\n {2}run:\n {4}shell: bash$/m);
  assert.match(text, /NODE_VERSION: '22\.\d+\.\d+'/);
  assert.match(text, /timeout-minutes: 60/);
  assert.match(text, /concurrency:\n {2}group: snapshot\n {2}cancel-in-progress: false/);
  assert.match(text, /if: \$\{\{ !cancelled\(\) && steps\.validate\.outcome == 'success' \}\}/);
  assert.match(text, /git config user\.name 'github-actions\[bot\]'/);
  assert.doesNotMatch(text, /secrets\./);
});

test('test workflow: npm test on every push and pull request, read-only', () => {
  const text = code(read('test.yml')).join('\n');
  assert.match(text, /^on:\n {2}push:\n {2}pull_request:\n/m);
  assert.match(text, /^permissions:\n {2}contents: read\n/m);
  assert.match(text, /run: npm test/);
  assert.doesNotMatch(text, /secrets\./);
});

test('workflow triggers: the release workflow runs only on manual dispatch', () => {
  const text = code(read('release.yml')).join('\n');
  const on = /^on:\n((?: {2}.*\n|\n)*?)(?=^\S)/m.exec(text)?.[1] ?? '';
  const triggers = [...on.matchAll(/^ {2}([a-z_]+):/gm)].map((m) => m[1]);
  assert.deepEqual(triggers, ['workflow_dispatch']);
  assert.doesNotMatch(text, /\$\{\{\s*inputs\.release\s*\}\}"/); // input reaches scripts only through env
  assert.match(text, /verify-release/);
  assert.match(text, /release-check/);
});
