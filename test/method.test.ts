import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { checkFrozen, crosses, parseMethod } from '../src/method.ts';

const ROOT = resolve(import.meta.dirname, '..');
const method = () => parseMethod(readFileSync(join(ROOT, 'METHOD.md'), 'utf8'));

test('flag ids present: method v0 defines exactly the eight flags', () => {
  const m = method();
  assert.equal(m.version, 'v0');
  assert.deepEqual(m.flags.map((f) => f.id).sort(), ['days-to-exit', 'free-float-share', 'investor-growth', 'manager-cluster', 'net-inflow', 'reach-vs-type', 'repo-borrowing', 'return-vs-peers']);
  assert.match(m.sha256, /^[0-9a-f]{64}$/);
});

test('thresholds come from the document', () => {
  const t = Object.fromEntries(method().flags.map((f) => [f.id, f.threshold]));
  assert.deepEqual(t['repo-borrowing'], { op: '<', value: -5 });
  assert.deepEqual(t['investor-growth'], { op: '>=', value: 5 });
  assert.ok(crosses(-7.61, t['repo-borrowing']));
  assert.ok(!crosses(-5, t['repo-borrowing']));
});

test('a malformed flag block is refused', () => {
  const bad = (block: string) => () => parseMethod(`# Method v0\n\n\`\`\`json flag\n${block}\n\`\`\`\n`);
  assert.throws(bad('{"id":"x","version":"v1","measure":"m","formula":"f","inputs":["a"],"window_days":0,"threshold":{"op":">=","value":1}}'), /version v1 is not v0/);
  assert.throws(bad('{"id":"x","version":"v0","measure":"m","formula":"f","inputs":["a"],"window_days":0,"threshold":{"op":"~","value":1}}'), /threshold/);
  assert.throws(() => parseMethod('no heading'), /no "# Method vN" heading/);
});

test('threshold edited in place: same version, changed content fails validation, naming METHOD.md', async () => {
  const { spawnSync } = await import('node:child_process');
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const text = readFileSync(join(ROOT, 'METHOD.md'), 'utf8');
  const versions = JSON.parse(readFileSync(join(ROOT, 'method-versions.json'), 'utf8'));
  assert.deepEqual(checkFrozen(parseMethod(text), versions), []);
  const edited = text.replace('"threshold": { "op": "<", "value": -5 }', '"threshold": { "op": "<", "value": -4 }');
  assert.notEqual(edited, text);
  assert.match(checkFrozen(parseMethod(edited), versions)[0], /content changed but version is still v0/);
  const file = join(mkdtempSync(join(tmpdir(), 'fon-izi-m-')), 'METHOD.md');
  writeFileSync(file, edited);
  const res = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', join(ROOT, 'src/cli.ts'), 'validate-method', '--method', file], { encoding: 'utf8' });
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /METHOD\.md: METHOD\.md: content changed/);
  const v1 = edited.replace('# Method v0', '# Method v1').replaceAll('"version": "v0"', '"version": "v1"');
  assert.match(checkFrozen(parseMethod(v1), versions)[0], /version v1 is not recorded/);
});
