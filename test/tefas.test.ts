import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { decodePayload, extractFundDetail, extractFundList, ExtractError, valueAt } from '../src/tefas.ts';
import { foldTurkish } from '../src/text.ts';

const ROOT = resolve(import.meta.dirname, '..');
const fixture = (name: string) => readFileSync(join(ROOT, 'test/fixtures/tefas', name), 'utf8');
const LOCAL = join(ROOT, 'fixtures-local/tefas/2026-11-16');

/** A minimal page holding `payload` the way TEFAS serves it. */
const page = (payload: string) => `<html><body><script>self.__next_f.push([1,${JSON.stringify(payload)}])</script></body></html>`;

test('liquidated fund still listed: zeros are kept as shown', () => {
  const d = extractFundDetail(fixture('fund-detail.TLY.2026-11-16.html'), 'TLY');
  assert.equal(d.code, 'TLY');
  assert.equal(d.title, 'TERA PORTFÖY BİRİNCİ SERBEST FON');
  assert.equal(d.category, 'Serbest Fon');
  assert.equal(d.unitPrice, 0);
  assert.equal(d.totalValue, 0);
  assert.equal(d.shareCount, 0);
  assert.equal(d.investorCount, 104210);
  assert.equal(d.categoryRank, 1284);
  assert.equal(d.categorySize, 1315);
  assert.equal(d.riskValue, 7);
  assert.equal(d.isin, 'TRYTRPY00025');
  assert.equal(d.tradingStatus, 'Fon Alımına Kapalı, Fon Bozumuna Kapalı');
  assert.deepEqual(d.returns, { m1: 0, m3: 0, m6: 0, y1: 0, y3: 0, y5: 0 });
  assert.deepEqual(d.allocation?.find((a) => a.assetType === 'Repo'), { assetType: 'Repo', percent: -7.61 });
  assert.equal(d.allocation?.length, 8);
  assert.deepEqual(d.missing, {});
});

test('active fund: figures read from the page', () => {
  const d = extractFundDetail(fixture('fund-detail.AAL.2026-11-16.html'), 'AAL');
  assert.equal(d.unitPrice, 3.746686);
  assert.equal(d.totalValue, 1438509937.03);
  assert.equal(d.shareCount, 383941976);
  assert.equal(d.investorCount, 4092);
  assert.equal(d.riskValue, 1);
});

test('field not shown: empty with the reason not-shown', () => {
  const html = page('{"bilgiData":{"fonKodu":"XYZ","fonUnvan":"X","sonFiyat":1.5},"fonTipi":"F"}');
  const d = extractFundDetail(html, 'XYZ');
  assert.equal(d.unitPrice, 1.5);
  assert.equal(d.investorCount, null);
  assert.equal(d.missing.investorCount, 'not-shown');
  assert.equal(d.missing.riskValue, 'not-shown');
  assert.equal(d.allocation, null);
  assert.equal(d.missing.allocation, 'not-shown');
  assert.equal(d.missing.returns, 'not-shown');
});

test('a reference string is skipped for the later object', () => {
  const payload = '{"profilData":"$a:4:props:children","x":1}{"profilData":{"riskDegeri":"3"},"bilgiData":{"fonKodu":"Q1"}}';
  assert.deepEqual(valueAt(payload, 'profilData'), { riskDegeri: '3' });
  assert.equal(extractFundDetail(page(payload), 'Q1').riskValue, 3);
});

test('a page for another fund or without data is an extraction error', () => {
  assert.throws(() => extractFundDetail(fixture('fund-detail.TLY.2026-11-16.html'), 'AAL'), ExtractError);
  assert.throws(() => extractFundDetail('<html>maintenance</html>', 'TLY'), /no Next.js payload/);
  assert.throws(() => extractFundDetail(page('{"x":1}'), 'TLY'), /no bilgiData/);
});

test('fund list: codes, status, returns and risk value', () => {
  const list = extractFundList(fixture('fund-returns.2026-11-16.html'));
  assert.deepEqual(list.map((e) => e.code), ['AAL', 'PKP', 'DGH', 'TLY']);
  const tly = list.find((e) => e.code === 'TLY')!;
  assert.equal(tly.umbrellaType, 'Serbest Şemsiye Fonu');
  assert.equal(tly.tefasListed, true);
  assert.equal(tly.riskValue, 7);
  assert.equal(tly.returns.m1, null); // shown as null, so kept as null and not marked missing
  assert.equal(tly.missing.m1, undefined);
  assert.throws(() => extractFundList(page('{"x":[]}')), /no initialFundListingData/);
});

test('string decoding handles escapes inside values', () => {
  const payload = '{"bilgiData":{"fonKodu":"E1","fonUnvan":"A \\"quoted\\" {brace} [x]"}}';
  assert.equal(decodePayload(page(payload)), payload);
  assert.equal(extractFundDetail(page(payload), 'E1').title, 'A "quoted" {brace} [x]');
});

test('Turkish folding for matching titles', () => {
  assert.equal(foldTurkish('TERA PORTFÖY BİRİNCİ  SERBEST FON'), 'tera portfoy birinci serbest fon');
  assert.equal(foldTurkish('IŞIK'), 'isik');
});

test('full local responses extract the same as the trimmed fixtures', { skip: !existsSync(LOCAL) && 'fixtures-local not present' }, () => {
  const full = (name: string) => readFileSync(join(LOCAL, name), 'utf8');
  assert.deepEqual(extractFundDetail(full('tly.html'), 'TLY'), extractFundDetail(fixture('fund-detail.TLY.2026-11-16.html'), 'TLY'));
  assert.deepEqual(extractFundDetail(full('aal.html'), 'AAL'), extractFundDetail(fixture('fund-detail.AAL.2026-11-16.html'), 'AAL'));
  const all = extractFundList(full('fon-getirileri.html'));
  assert.equal(all.length, 2136);
  const kept = extractFundList(fixture('fund-returns.2026-11-16.html'));
  for (const e of kept) assert.deepEqual(all.find((x) => x.code === e.code), e);
});
