import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatFigure, handTypedNumbers, render } from '../src/figures.ts';

test('one figure, two languages', () => {
  const f = { value: 1234.5, kind: 'decimal' as const, digits: 1, source: 't' };
  assert.equal(formatFigure(f, 'tr'), '1.234,5');
  assert.equal(formatFigure(f, 'en'), '1,234.5');
  assert.equal(formatFigure({ value: 44.53, kind: 'percent', digits: 1, source: 't' }, 'en'), '44.5%');
  assert.equal(formatFigure({ value: 44.53, kind: 'percent', digits: 1, source: 't' }, 'tr'), '%44,5');
  assert.equal(formatFigure({ value: '2026-09-17', kind: 'date', source: 't' }, 'tr'), '17 Eylül 2026');
  assert.equal(formatFigure({ value: '2026-09-17', kind: 'date', source: 't' }, 'en'), 'September 17, 2026');
});

test('render replaces references and refuses unknown ones', () => {
  const figures = { n: { value: 131, kind: 'integer' as const, source: 't' } };
  assert.equal(render('{{fig:n}} funds', figures, 'en'), '131 funds');
  assert.throws(() => render('{{fig:missing}}', figures, 'en'), /unknown figure missing/);
});

test('hand-typed figure fails, naming file and line', () => {
  assert.deepEqual(handTypedNumbers('case-file/en.md.tmpl', 'Intro.\nAbout 455758 investors held them.\n'), ['case-file/en.md.tmpl:2: 455758']);
  assert.deepEqual(handTypedNumbers('t', 'Repo borrowing of 7.61% was shown.'), ['t:1: 7.61%']);
});

test('dates, citations, law and decision numbers, codes and figure references are allowed', () => {
  const ok = [
    'On 17 September 2026 SPK ordered {{fig:funds.liquidated}} funds liquidated [SPK Bülten 2026/61, s. 6].',
    '17 Eylül 2026 tarihinde 6362 sayılı Kanun madde 96/1 uyarınca, karar 57/1706.',
    'Funds such as `T3B` and `TP2`; method v0; dates 2025-01-03 to 2026-09-11.',
    'Law 6362 art. 97/1 and Communiqué V-101.1.',
    '[Report](https://example.org/a1/b2) and August 2026.',
  ];
  for (const line of ok) assert.deepEqual(handTypedNumbers('t', line), [], line);
});

test('the case-file templates have no hand-typed numbers and no evaluative terms', async () => {
  const { readFileSync } = await import('node:fs');
  const { join, resolve } = await import('node:path');
  const { checkWording } = await import('../src/wording.ts');
  const root = resolve(import.meta.dirname, '..');
  const terms = JSON.parse(readFileSync(join(root, 'wording.json'), 'utf8')).terms;
  for (const lang of ['en', 'tr']) {
    const p = `case-file/${lang}.md.tmpl`;
    const t = readFileSync(join(root, p), 'utf8');
    assert.deepEqual(handTypedNumbers(p, t), [], p);
    assert.deepEqual(checkWording(p, t, terms), [], p);
  }
});
