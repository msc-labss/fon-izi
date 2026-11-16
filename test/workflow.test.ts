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

test('snapshot workflow: daily at 03:00 UTC and by hand, contents write only', () => {
  const lines = code(read('snapshot.yml'));
  const text = lines.join('\n');
  assert.match(text, /^on:\n {2}schedule:\n {4}- cron: '0 3 \* \* \*'\n {2}workflow_dispatch:\n/m);
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
