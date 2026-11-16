import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { dayPath, validateArchive } from '../src/archive.ts';
import { createFetcher } from '../src/fetch.ts';
import type { Clock, FetchLike } from '../src/fetch.ts';
import type { Source } from '../src/registry.ts';
import { DETAIL_URL, LIST_URL, runSnapshot } from '../src/snapshot.ts';

const tmp = () => mkdtempSync(join(tmpdir(), 'fon-izi-snap-'));
const page = (payload: unknown) => `<html><body><script>self.__next_f.push([1,${JSON.stringify(JSON.stringify(payload))}])</script></body></html>`;

const listPage = (codes: string[]) =>
  page({
    initialFundListingData: codes.map((c) => ({ fonKodu: c, fonUnvan: `FON ${c}`, fonTurAciklama: 'Serbest Şemsiye Fonu', tefasDurum: true, getiri1a: 1, getiri3a: 2, getiri6a: 3, getiri1y: 4, getiriyb: 5, getiri3y: 6, getiri5y: 7, getiriOrani: null, riskDegeri: '4' })),
  });

const detailPage = (code: string) =>
  page({
    profilData: { fonKodu: code, isinKodu: `TR${code}`, tefasDurum: 'İşlem Görüyor', kapLink: `https://www.kap.org.tr/x/${code}`, riskDegeri: '4' },
    bilgiData: { fonKodu: code, fonUnvan: `FON ${code}`, sonFiyat: 1.25, gunlukGetiri: 0.1, payAdet: 1000, portBuyukluk: 1250, fonKategori: 'Serbest Fon', kategoriDerece: 1, kategoriFonSay: 9, yatirimciSayi: 42, pazarPayi: 0.01 },
    periyodikData: { fonKodu: code, getiri1a: 1, getiri3a: 2, getiri6a: 3, getiri1y: 4, getiri3y: 6, getiri5y: 7 },
    varlikData: [{ fonKodu: code, kiymetTip: 'Hisse Senedi', portfoyOrani: 90 }, { fonKodu: code, kiymetTip: 'Repo', portfoyOrani: -2 }],
    fonTipi: 'F',
  });

const SOURCES: Source[] = [
  { id: 'tefas-fund-list', urlPrefix: LIST_URL, cadence: 'daily', fields: ['code'], rawPolicy: 'hash-only', termsRef: 'docs/sources/terms.md#tefas' },
  { id: 'tefas-fund-detail', urlPrefix: 'https://www.tefas.gov.tr/tr/fon-detayli-analiz/', cadence: 'daily', fields: ['code'], rawPolicy: 'hash-only', termsRef: 'docs/sources/terms.md#tefas' },
];

type Reply = { status: number; body?: string } | Error;

function setup(routes: Record<string, Reply>, robots = 'User-Agent: *\nAllow: /\nDisallow: /api/\n') {
  let t = Date.UTC(2026, 10, 17, 3, 0, 0);
  const clock: Clock = { now: () => t, sleep: async (ms) => void (t += ms) };
  const fetchImpl: FetchLike = async (url) => {
    const reply: Reply | undefined = url.endsWith('/robots.txt') ? { status: 200, body: robots } : routes[url];
    if (!reply) return { status: 404, headers: new Headers(), arrayBuffer: async () => new ArrayBuffer(0) };
    if (reply instanceof Error) throw reply;
    const bytes = new TextEncoder().encode(reply.body ?? '');
    return { status: reply.status, headers: new Headers(), arrayBuffer: async () => bytes.buffer };
  };
  const fetcher = createFetcher({ fetchImpl, clock, logError: () => {} });
  return { clock, fetcher };
}

function routesFor(codes: string[], listCodes = codes): Record<string, Reply> {
  const r: Record<string, Reply> = { [LIST_URL]: { status: 200, body: listPage(listCodes) } };
  for (const c of codes) r[DETAIL_URL(c)] = { status: 200, body: detailPage(c) };
  return r;
}

const read = (root: string, day: string) =>
  readFileSync(dayPath(root, 'tefas', day), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l));

async function snap(root: string, day: string, routes: Record<string, Reply>, extra: Partial<Parameters<typeof runSnapshot>[0]> = {}, robots?: string) {
  const { clock, fetcher } = setup(routes, robots);
  const result = await runSnapshot({ root, day, sources: SOURCES, fetcher, clock, log: () => {}, ...extra });
  return { result, fetcher };
}

test('a run writes list entries, fund records and a run summary, all valid', async () => {
  const root = tmp();
  const { result } = await snap(root, '2026-11-17', routesFor(['BBB', 'AAA']));
  assert.equal(result.exitCode, 0);
  const recs = read(root, '2026-11-17');
  assert.deepEqual(recs.map((r) => `${r.kind}:${r.data.code}`), ['list-entry:AAA', 'list-entry:BBB', 'fund:AAA', 'fund:BBB']);
  const fund = recs.find((r) => r.kind === 'fund');
  assert.equal(fund.data.investorCount, 42);
  assert.equal(fund.publishedAt, null);
  assert.equal(fund.origin, 'snapshot');
  assert.deepEqual(fund.witness, { url: null, reason: 'off' });
  assert.deepEqual(validateArchive(root).errors, []);
  const summary = JSON.parse(readFileSync(dayPath(root, 'tefas', '2026-11-17', '.run.json'), 'utf8'));
  assert.deepEqual(summary.funds, { attempted: 2, captured: 2, failed: 0, robotsDisallowed: 0 });
});

test('hash-only source: no raw body is written', async () => {
  const root = tmp();
  await snap(root, '2026-11-17', routesFor(['AAA']));
  assert.ok(!existsSync(join(root, 'raw')));
  const publishing = SOURCES.map((s) => ({ ...s, rawPolicy: 'publish' as const }));
  const root2 = tmp();
  await snap(root2, '2026-11-17', routesFor(['AAA']), { sources: publishing });
  assert.ok(existsSync(join(root2, 'raw')));
});

test('fund drops off the list: an absence record dated today', async () => {
  const root = tmp();
  await snap(root, '2026-11-17', routesFor(['AAA', 'XXX']));
  const { result } = await snap(root, '2026-11-18', routesFor(['AAA']));
  assert.equal(result.exitCode, 0);
  const absence = read(root, '2026-11-18').filter((r) => r.kind === 'absence');
  assert.equal(absence.length, 1);
  assert.deepEqual(absence[0].data, { code: 'XXX', lastListedOn: '2026-11-17' });
  assert.equal(absence[0].capturedAt.slice(0, 10), '2026-11-17'); // fake clock day; the file day is 2026-11-18
});

test('empty fund list: exit 1 and no snapshot for that day', async () => {
  const root = tmp();
  const { result } = await snap(root, '2026-11-17', { [LIST_URL]: { status: 200, body: listPage([]) } });
  assert.equal(result.exitCode, 1);
  assert.ok(!existsSync(dayPath(root, 'tefas', '2026-11-17')));
  assert.ok(!existsSync(dayPath(root, 'tefas', '2026-11-17', '.run.json')));
});

test('many fund pages fail: 6% failing after retry writes nothing; 5% is tolerated', async () => {
  const codes = Array.from({ length: 100 }, (_, i) => `F${String(i).padStart(2, '0')}`);
  const failing = (n: number) => {
    const r = routesFor(codes);
    for (const c of codes.slice(0, n)) r[DETAIL_URL(c)] = new Error('ECONNRESET');
    return r;
  };
  const root = tmp();
  const bad = await snap(root, '2026-11-17', failing(6));
  assert.equal(bad.result.exitCode, 1);
  assert.match(String(bad.result.summary.error), /6 of 100 fund pages failed/);
  assert.ok(!existsSync(dayPath(root, 'tefas', '2026-11-17')));

  const ok = await snap(tmp(), '2026-11-17', failing(5));
  assert.equal(ok.result.exitCode, 0);
  assert.equal((ok.result.summary.failures as unknown[]).length, 5);
});

test('disallowed path: skipped, recorded in the summary, exit 1', async () => {
  const root = tmp();
  const robots = 'User-Agent: *\nAllow: /\nDisallow: /tr/fon-detayli-analiz/BBB\n';
  const { result, fetcher } = await snap(root, '2026-11-17', routesFor(['AAA', 'BBB']), {}, robots);
  assert.equal(result.exitCode, 1);
  assert.deepEqual(result.summary.robotsDisallowed, [DETAIL_URL('BBB')]);
  assert.ok(!fetcher.log.some((e) => e.url === DETAIL_URL('BBB')));
  assert.deepEqual(read(root, '2026-11-17').filter((r) => r.kind === 'fund').map((r) => r.data.code), ['AAA']);
});

test('overwrite attempt: an existing day file stops the run before any request', async () => {
  const root = tmp();
  mkdirSync(join(root, 'tefas/2026/11'), { recursive: true });
  writeFileSync(dayPath(root, 'tefas', '2026-11-17'), 'kept\n');
  const { result, fetcher } = await snap(root, '2026-11-17', routesFor(['AAA']));
  assert.equal(result.exitCode, 1);
  assert.equal(fetcher.log.length, 0);
  assert.equal(readFileSync(dayPath(root, 'tefas', '2026-11-17'), 'utf8'), 'kept\n');
});

test('unregistered source is refused: exit 1, URL named, no record', async () => {
  const root = tmp();
  const { result } = await snap(root, '2026-11-17', routesFor(['AAA']), { sources: [SOURCES[0]] });
  assert.equal(result.exitCode, 1);
  assert.match(String(result.summary.error), /unregistered source: https:\/\/www\.tefas\.gov\.tr\/tr\/fon-detayli-analiz\/AAA/);
  assert.ok(!existsSync(dayPath(root, 'tefas', '2026-11-17')));
});
