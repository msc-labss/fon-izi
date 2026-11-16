import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { dayPath, readLines, validateArchive } from '../src/archive.ts';
import { archiveTime, BACKFILL_GROUP, captureUrl, runBackfill } from '../src/backfill.ts';
import type { Capture } from '../src/cdx.ts';
import { createFetcher } from '../src/fetch.ts';
import type { Clock, FetchLike } from '../src/fetch.ts';
import { validateRegistry } from '../src/registry.ts';

const ROOT = resolve(import.meta.dirname, '..');
const page = readFileSync(join(ROOT, 'test/fixtures/wayback/fund-legacy.TLY.20250818045739.html'), 'utf8');
const { sources } = validateRegistry(JSON.parse(readFileSync(join(ROOT, 'sources.json'), 'utf8')));
const ORIGINAL = 'https://www.tefas.gov.tr/FonAnaliz.aspx?FonKod=TLY';
const cap = (timestamp: string, length = 450_000): Capture => ({ timestamp, original: ORIGINAL, status: '200', mimetype: 'text/html', length });

function setup(bodies: Record<string, { status: number; body: string }>, start = Date.UTC(2026, 10, 16, 12, 0, 0)) {
  let t = start;
  const clock: Clock = { now: () => t, sleep: async (ms) => void (t += ms) };
  const fetchImpl: FetchLike = async (url) => {
    const r = url.endsWith('/robots.txt') ? { status: 404, body: '' } : (bodies[url] ?? { status: 404, body: '' });
    const bytes = new TextEncoder().encode(r.body);
    return { status: r.status, headers: new Headers(), arrayBuffer: async () => bytes.buffer };
  };
  return { clock, fetcher: createFetcher({ fetchImpl, clock, logError: () => {} }) };
}

const raw = (ts: string) => `https://web.archive.org/web/${ts}id_/${ORIGINAL}`;

test('import of an old capture keeps the archive time, origin and witness', async () => {
  const root = mkdtempSync(join(tmpdir(), 'fon-izi-bf-'));
  const { clock, fetcher } = setup({ [raw('20260601120000')]: { status: 200, body: page } });
  const { exitCode, summary } = await runBackfill({ root, codes: ['TLY'], from: '202501', to: '202609', sources, fetcher, clock, log: () => {}, listCaptures: async () => [cap('20260601120000')] });
  assert.equal(exitCode, 0);
  const recs = readLines(dayPath(root, BACKFILL_GROUP, '2026-06-01')).filter(Boolean).map((l) => JSON.parse(l));
  assert.deepEqual(recs.map((r) => r.kind).sort(), ['fund', 'price-history']);
  for (const r of recs) {
    assert.equal(r.capturedAt, '2026-06-01T12:00:00.000Z');
    assert.equal(r.origin, 'backfill');
    assert.equal(r.sourceUrl, ORIGINAL);
    assert.deepEqual(r.witness, { url: `https://web.archive.org/web/20260601120000/${ORIGINAL}`, reason: null });
    assert.equal(r.publishedAt, null);
    assert.equal(r.source, 'wayback-tefas-legacy');
  }
  assert.equal(recs.find((r) => r.kind === 'fund').data.investorCount, 11121);
  assert.equal(recs.find((r) => r.kind === 'price-history').data.prices.length, 250);
  assert.deepEqual(validateArchive(root).errors, []);
  assert.equal(summary.usableCaptures, 1);
});

test('unusable captures are not fetched; rejected pages are failures, not records', async () => {
  const root = mkdtempSync(join(tmpdir(), 'fon-izi-bf-'));
  const { clock, fetcher } = setup({ [raw('20260520065339')]: { status: 200, body: '<html>Request Rejected</html>' } });
  const { summary } = await runBackfill({
    root, codes: ['TLY'], from: '202501', to: '202609', sources, fetcher, clock, log: () => {},
    listCaptures: async () => [cap('20260520065339'), cap('20260607155138', 3631)],
  });
  assert.equal(summary.usableCaptures, 1);
  assert.equal((summary.failures as unknown[]).length, 1);
  assert.ok(!fetcher.log.some((e) => e.url.includes('20260607155138')));
  assert.equal(validateArchive(root).records, 0);
});

test('an existing day file is left alone and reported', async () => {
  const root = mkdtempSync(join(tmpdir(), 'fon-izi-bf-'));
  let runs = 0;
  const run = async () => {
    const { clock, fetcher } = setup({ [raw('20250818045739')]: { status: 200, body: page } }, Date.UTC(2026, 10, 16, 12, runs++, 0));
    return runBackfill({ root, codes: ['TLY'], from: '202501', to: '202609', sources, fetcher, clock, log: () => {}, listCaptures: async () => [cap('20250818045739')] });
  };
  assert.equal((await run()).summary.daysWritten, 1);
  const before = readFileSync(dayPath(root, BACKFILL_GROUP, '2025-08-18'));
  const second = await run();
  assert.deepEqual(second.summary.daysSkippedExisting, ['2025-08-18']);
  assert.deepEqual(readFileSync(dayPath(root, BACKFILL_GROUP, '2025-08-18')), before);
});

test('archive timestamps and capture URLs', () => {
  assert.equal(archiveTime('20250818045739'), '2025-08-18T04:57:39.000Z');
  assert.throws(() => archiveTime('2025'), /bad archive timestamp/);
  assert.equal(captureUrl(cap('20250818045739')), `https://web.archive.org/web/20250818045739/${ORIGINAL}`);
});

test('a second run reads captures from the cache and fetches nothing', async () => {
  const cacheDir = mkdtempSync(join(tmpdir(), 'fon-izi-cache-'));
  const once = async (minute: number) => {
    const root = mkdtempSync(join(tmpdir(), 'fon-izi-bf-'));
    const { clock, fetcher } = setup({ [raw('20250818045739')]: { status: 200, body: page } }, Date.UTC(2026, 10, 16, 12, minute, 0));
    const r = await runBackfill({ root, codes: ['TLY'], from: '202501', to: '202609', sources, fetcher, clock, log: () => {}, listCaptures: async () => [cap('20250818045739')], cacheDir });
    return { r, fetcher, root };
  };
  const first = await once(0);
  const second = await once(1);
  assert.ok(first.fetcher.log.some((e) => e.url === raw('20250818045739')));
  assert.ok(!second.fetcher.log.some((e) => e.url === raw('20250818045739')));
  assert.deepEqual(readFileSync(dayPath(first.root, BACKFILL_GROUP, '2025-08-18')), readFileSync(dayPath(second.root, BACKFILL_GROUP, '2025-08-18')));
});

test('rate limits back off and retry instead of failing the capture', async () => {
  const root = mkdtempSync(join(tmpdir(), 'fon-izi-bf-'));
  let calls = 0;
  let t = Date.UTC(2026, 10, 16, 12, 0, 0);
  const clock: Clock = { now: () => t, sleep: async (ms) => void (t += ms) };
  const fetchImpl: FetchLike = async (url) => {
    if (url.endsWith('/robots.txt')) return { status: 404, headers: new Headers(), arrayBuffer: async () => new ArrayBuffer(0) };
    calls++;
    const r = calls <= 2 ? { status: 429, body: '' } : { status: 200, body: page };
    const bytes = new TextEncoder().encode(r.body);
    return { status: r.status, headers: new Headers(), arrayBuffer: async () => bytes.buffer };
  };
  const fetcher = createFetcher({ fetchImpl, clock, logError: () => {} });
  const { summary } = await runBackfill({ root, codes: ['TLY'], from: '202501', to: '202609', sources, fetcher, clock, log: () => {}, listCaptures: async () => [cap('20250818045739')], sleep: async () => {} });
  assert.deepEqual(summary.failures, []);
  assert.equal(summary.daysWritten, 1);
});

test('a retry pass takes only the listed captures and writes into its own group', async () => {
  const root = mkdtempSync(join(tmpdir(), 'fon-izi-bf-'));
  const { clock, fetcher } = setup({ [raw('20250818045739')]: { status: 200, body: page }, [raw('20250820015135')]: { status: 200, body: page } });
  const { summary } = await runBackfill({
    root, codes: ['TLY'], from: '202501', to: '202609', sources, fetcher, clock, log: () => {},
    listCaptures: async () => [cap('20250818045739'), cap('20250820015135')],
    group: 'tefas-backfill-2', only: new Set(['TLY|20250820015135']),
  });
  assert.equal(summary.usableCaptures, 1);
  assert.equal(summary.group, 'tefas-backfill-2');
  assert.ok(!fetcher.log.some((e) => e.url === raw('20250818045739')));
  assert.equal(readLines(dayPath(root, 'tefas-backfill-2', '2025-08-20')).filter(Boolean).length, 2);
});
