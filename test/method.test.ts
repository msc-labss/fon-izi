import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { crosses, parseMethod } from '../src/method.ts';

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
