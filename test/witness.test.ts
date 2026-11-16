import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { dayPath } from '../src/archive.ts';
import { parseCsvRecords } from '../src/csv.ts';
import { createFetcher } from '../src/fetch.ts';
import type { Clock, FetchLike } from '../src/fetch.ts';
import type { Source } from '../src/registry.ts';
import { DETAIL_URL, LIST_URL, runSnapshot } from '../src/snapshot.ts';
import { captureUrl, createWitness, parseWitnessConfig, SAVE_PREFIX } from '../src/witness.ts';

const ROOT = resolve(import.meta.dirname, '..');
const page = (payload: unknown) => `<html><script>self.__next_f.push([1,${JSON.stringify(JSON.stringify(payload))}])</script></html>`;
const SOURCES: Source[] = [
  { id: 'tefas-fund-list', urlPrefix: LIST_URL, cadence: 'daily', fields: ['code'], rawPolicy: 'hash-only' },
  { id: 'tefas-fund-detail', urlPrefix: 'https://www.tefas.gov.tr/tr/fon-detayli-analiz/', cadence: 'daily', fields: ['code'], rawPolicy: 'hash-only' },
];

type Reply = { status: number; body?: string; headers?: Record<string, string> };

async function run(enabled: boolean, listed: string[], spn: (target: string) => Reply) {
  let t = Date.UTC(2026, 10, 17, 3, 0, 0);
  const clock: Clock = { now: () => t, sleep: async (ms) => void (t += ms) };
  const routes: Record<string, Reply> = {
    [LIST_URL]: { status: 200, body: page({ initialFundListingData: [{ fonKodu: 'AAA', fonUnvan: 'A', tefasDurum: true, riskDegeri: '3' }, { fonKodu: 'BBB', fonUnvan: 'B', tefasDurum: true, riskDegeri: '3' }] }) },
    [DETAIL_URL('AAA')]: { status: 200, body: page({ bilgiData: { fonKodu: 'AAA', yatirimciSayi: 1 } }) },
    [DETAIL_URL('BBB')]: { status: 200, body: page({ bilgiData: { fonKodu: 'BBB', yatirimciSayi: 2 } }) },
  };
  const fetchImpl: FetchLike = async (url) => {
    const reply: Reply = url.endsWith('/robots.txt') ? { status: 404 } : url.startsWith(SAVE_PREFIX) ? spn(url.slice(SAVE_PREFIX.length)) : (routes[url] ?? { status: 404 });
    const bytes = new TextEncoder().encode(reply.body ?? '');
    return { status: reply.status, headers: new Headers(reply.headers ?? {}), arrayBuffer: async () => bytes.buffer };
  };
  const fetcher = createFetcher({ fetchImpl, clock, logError: () => {}, hostIntervalMs: { 'web.archive.org': 5000 } });
  const { witness, rest } = createWitness({ enabled, urls: listed }, fetcher);
  const root = mkdtempSync(join(tmpdir(), 'fon-izi-w-'));
  const result = await runSnapshot({ root, day: '2026-11-17', sources: SOURCES, fetcher, clock, witness, witnessRest: rest, log: () => {} });
  const records = readFileSync(dayPath(root, 'tefas', '2026-11-17'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  return { result, records, fetcher };
}

const fund = (records: { kind: string; data: { code: string } }[], code: string) => records.find((r) => r.kind === 'fund' && r.data.code === code) as unknown as { witness: unknown };

test('witness off: no request reaches archive.org', async () => {
  const { records, fetcher, result } = await run(false, [DETAIL_URL('AAA')], () => ({ status: 200 }));
  assert.equal(result.exitCode, 0);
  assert.ok(!fetcher.log.some((e) => e.host === 'web.archive.org'));
  assert.deepEqual(fund(records, 'AAA').witness, { url: null, reason: 'off' });
});

test('witness error: empty witness with the reason, run exits 0', async () => {
  const { records, result } = await run(true, [DETAIL_URL('AAA')], () => ({ status: 520 }));
  assert.equal(result.exitCode, 0);
  assert.deepEqual(fund(records, 'AAA').witness, { url: null, reason: 'error: HTTP 520' });
});

test('witness success: the capture URL is stored; unlisted URLs are not sent', async () => {
  const { records, fetcher, result } = await run(true, [DETAIL_URL('AAA'), 'https://spk.gov.tr/data/x/2026-61.pdf'], (target) => ({
    status: 302,
    headers: { location: `/web/20261117030001/${target}` },
  }));
  assert.deepEqual(fund(records, 'AAA').witness, { url: `https://web.archive.org/web/20261117030001/${DETAIL_URL('AAA')}`, reason: null });
  assert.deepEqual(fund(records, 'BBB').witness, { url: null, reason: 'not-listed' });
  const saves = fetcher.log.filter((e) => e.host === 'web.archive.org' && e.url.startsWith(SAVE_PREFIX)).map((e) => e.url.slice(SAVE_PREFIX.length));
  assert.deepEqual(saves.sort(), ['https://spk.gov.tr/data/x/2026-61.pdf', DETAIL_URL('AAA')]);
  const summary = result.summary.witness as { requested: number; captured: number };
  assert.deepEqual({ requested: summary.requested, captured: summary.captured }, { requested: 2, captured: 2 });
});

test('Save Page Now header parsing', () => {
  assert.equal(captureUrl('/web/20261117030001/https://x.org/a?b=1'), 'https://web.archive.org/web/20261117030001/https://x.org/a?b=1');
  assert.equal(captureUrl('https://web.archive.org/web/20261117030001/https://x.org/'), 'https://web.archive.org/web/20261117030001/https://x.org/');
  assert.equal(captureUrl('/save/_embed/x'), null);
  assert.equal(captureUrl(null), null);
});

test('the committed witness list is off and covers the fund list and every event-set fund', () => {
  const config = parseWitnessConfig(readFileSync(join(ROOT, 'witness-list.json'), 'utf8'));
  assert.equal(config.enabled, false);
  const { records } = parseCsvRecords(readFileSync(join(ROOT, 'events/2026-fund-crisis.csv'), 'utf8'));
  for (const code of new Set(records.map((r) => r.fund_code))) assert.ok(config.urls.includes(DETAIL_URL(code)), code);
  assert.ok(config.urls.includes(LIST_URL));
  for (const url of new Set(records.map((r) => r.source_url))) assert.ok(config.urls.includes(url), url);
});
