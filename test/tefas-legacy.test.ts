import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { ExtractError } from '../src/tefas.ts';
import { extractLegacyFundPage, trDate, trNumber } from '../src/tefas-legacy.ts';

const ROOT = resolve(import.meta.dirname, '..');
const fixture = readFileSync(join(ROOT, 'test/fixtures/wayback/fund-legacy.TLY.20250818045739.html'), 'utf8');
const FULL = join(ROOT, 'fixtures-local/wayback/TLY-20250818045739.html');

test('old page: card, profile, price year and allocation, as shown', () => {
  const p = extractLegacyFundPage(fixture, 'TLY');
  assert.equal(p.code, 'TLY');
  assert.equal(p.title, 'TERA PORTFÖY BİRİNCİ SERBEST FON');
  assert.equal(p.unitPrice, 0);
  assert.equal(p.dailyReturn, -100);
  assert.equal(p.shareCount, null);
  assert.equal(p.missing.shareCount, 'empty');
  assert.equal(p.totalValue, null);
  assert.equal(p.missing.totalValue, 'empty');
  assert.equal(p.investorCount, 11121);
  assert.equal(p.categoryRank, 954);
  assert.equal(p.categorySize, 1288);
  assert.equal(p.category, 'Serbest Fon');
  assert.equal(p.isin, 'TRYTRPY00025');
  assert.equal(p.tradingStatus, "TEFAS'ta işlem görüyor");
  assert.equal(p.riskValue, 7);
  assert.deepEqual(p.allocation, [{ assetType: 'Hisse Senedi', percent: 100 }]);
  assert.equal(p.priceSeries?.length, 250);
  assert.deepEqual(p.priceSeries?.[0], ['2024-08-19', 19.859863]);
  assert.deepEqual(p.priceSeries?.at(-2), ['2025-08-15', 1027.803998]);
  assert.deepEqual(p.priceSeries?.at(-1), ['2025-08-18', 0]);
});

test('a page for another fund is refused', () => {
  assert.throws(() => extractLegacyFundPage(fixture, 'DOH'), ExtractError);
  assert.throws(() => extractLegacyFundPage('<html>Request Rejected</html>', 'TLY'), /no fund profile/);
});

test('tr-TR numbers and dates', () => {
  assert.equal(trNumber('11.121'), 11121);
  assert.equal(trNumber('%-12,5'), -12.5);
  assert.equal(trNumber('1.234.567,89'), 1234567.89);
  assert.equal(trNumber(' '), null);
  assert.equal(trNumber('&nbsp;'), null);
  assert.equal(trNumber('-'), null);
  assert.throws(() => trNumber('abc'), ExtractError);
  assert.equal(trDate('19.08.2024'), '2024-08-19');
});

test('the full capture extracts the same as the trimmed fixture', { skip: !existsSync(FULL) && 'fixtures-local not present' }, () => {
  assert.deepEqual(extractLegacyFundPage(readFileSync(FULL, 'utf8'), 'TLY'), extractLegacyFundPage(fixture, 'TLY'));
});

test('a risk value shown as "-" is empty, not an error', () => {
  const page = fixture.replace(/(Fonun Risk Değeri<\/td>\s*<td class="fund-profile-item">)7</, '$1-<');
  const p = extractLegacyFundPage(page, 'TLY');
  assert.equal(p.riskValue, null);
  assert.equal(p.missing.riskValue, 'empty');
});
