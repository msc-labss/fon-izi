import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFetcher, USER_AGENT } from '../src/fetch.ts';
import type { Clock, FetchLike } from '../src/fetch.ts';
import { isAllowed, parseRobots, rulesFromResponse } from '../src/robots.ts';

/** Virtual clock: sleeping advances time without waiting. */
function fakeClock(start = Date.UTC(2026, 10, 16, 3, 0, 0)): Clock {
  let t = start;
  return { now: () => t, sleep: async (ms) => void (t += ms) };
}

type Reply = { status: number; body?: string } | Error;

/** Fake fetch: `routes` maps a URL to replies, consumed in order (the last one repeats). */
function fakeFetch(routes: Record<string, Reply[]>, seen: { url: string; init: RequestInit }[] = []): FetchLike {
  return async (url, init) => {
    seen.push({ url, init });
    const replies = routes[url];
    if (!replies) return { status: 404, headers: new Headers(), arrayBuffer: async () => new ArrayBuffer(0) };
    const reply = replies.length > 1 ? replies.shift()! : replies[0];
    if (reply instanceof Error) throw reply;
    const bytes = new TextEncoder().encode(reply.body ?? '');
    return { status: reply.status, headers: new Headers(), arrayBuffer: async () => bytes.buffer };
  };
}

const TEFAS_ROBOTS = `User-Agent: *
Allow: /
Disallow: /api/
Disallow: /private/
Disallow: /tefasbuild
Disallow: /_next/
Disallow: /static/

User-Agent: GPTBot
Disallow: /private-content/
Disallow: /api/
`;

const quiet = () => {};

test('request spacing: no two requests to one host under 1000 ms apart', async () => {
  const routes: Record<string, Reply[]> = { 'https://h.example/robots.txt': [{ status: 200, body: 'User-agent: *\nAllow: /' }] };
  for (let i = 0; i < 10; i++) routes[`https://h.example/p/${i}`] = [{ status: 200, body: `page ${i}` }];
  const f = createFetcher({ fetchImpl: fakeFetch(routes), clock: fakeClock(), logError: quiet });
  for (let i = 0; i < 10; i++) assert.equal((await f.get(`https://h.example/p/${i}`)).kind, 'response');
  const times = f.log.filter((e) => e.host === 'h.example').map((e) => e.at);
  assert.equal(times.length, 11); // robots.txt + ten pages
  for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] >= 1000, `gap ${i}: ${times[i] - times[i - 1]} ms`);
});

test('a disallowed path is recorded as robots-disallowed and never requested', async () => {
  const f = createFetcher({
    fetchImpl: fakeFetch({ 'https://www.tefas.gov.tr/robots.txt': [{ status: 200, body: TEFAS_ROBOTS }] }),
    clock: fakeClock(),
    logError: quiet,
  });
  const r = await f.get('https://www.tefas.gov.tr/api/funds/history');
  assert.equal(r.kind, 'robots-disallowed');
  assert.ok(!f.log.some((e) => e.url.includes('/api/')));
});

test('an unreadable robots.txt (5xx, network error, HTTP 666) disallows everything', async () => {
  for (const reply of [{ status: 503 }, { status: 666 }, new Error('ECONNRESET')] as Reply[]) {
    const f = createFetcher({
      fetchImpl: fakeFetch({ 'https://k.example/robots.txt': [reply], 'https://k.example/x': [{ status: 200, body: 'x' }] }),
      clock: fakeClock(),
      logError: quiet,
    });
    assert.equal((await f.get('https://k.example/x')).kind, 'robots-disallowed');
  }
});

test('a missing robots.txt (404) allows everything', async () => {
  const f = createFetcher({ fetchImpl: fakeFetch({ 'https://s.example/x': [{ status: 200, body: 'ok' }] }), clock: fakeClock(), logError: quiet });
  const r = await f.get('https://s.example/x');
  assert.equal(r.kind, 'response');
  assert.equal(r.kind === 'response' && r.body, 'ok');
});

test('one retry after a network error or 5xx, then the result stands', async () => {
  const ok = createFetcher({
    fetchImpl: fakeFetch({ 'https://r.example/robots.txt': [{ status: 404 }], 'https://r.example/x': [new Error('timeout'), { status: 200, body: 'ok' }] }),
    clock: fakeClock(),
    logError: quiet,
  });
  assert.equal((await ok.get('https://r.example/x')).kind, 'response');

  const down = createFetcher({
    fetchImpl: fakeFetch({ 'https://r.example/robots.txt': [{ status: 404 }], 'https://r.example/x': [new Error('timeout'), new Error('timeout')] }),
    clock: fakeClock(),
    logError: quiet,
  });
  const r = await down.get('https://r.example/x');
  assert.equal(r.kind, 'network-error');
  assert.equal(down.log.filter((e) => e.url === 'https://r.example/x').length, 2);

  const busy = createFetcher({
    fetchImpl: fakeFetch({ 'https://r.example/robots.txt': [{ status: 404 }], 'https://r.example/x': [{ status: 503 }, { status: 503 }] }),
    clock: fakeClock(),
    logError: quiet,
  });
  const b = await busy.get('https://r.example/x');
  assert.equal(b.kind === 'response' && b.status, 503);
});

test('the User-Agent names the project and repository and no person', async () => {
  const seen: { url: string; init: RequestInit }[] = [];
  const f = createFetcher({ fetchImpl: fakeFetch({ 'https://u.example/x': [{ status: 200 }] }, seen), clock: fakeClock(), logError: quiet });
  await f.get('https://u.example/x');
  const ua = (seen[0].init.headers as Record<string, string>)['User-Agent'];
  assert.equal(ua, USER_AGENT);
  assert.match(ua, /^fon-izi\/\d+\.\d+\.\d+ \(\+https:\/\/github\.com\/msc-labss\/fon-izi\)$/);
  assert.doesNotMatch(ua, /@/);
});

test('the response carries the SHA-256 of the body and the capture time', async () => {
  const f = createFetcher({ fetchImpl: fakeFetch({ 'https://h.example/x': [{ status: 200, body: 'abc' }] }), clock: fakeClock(), logError: quiet });
  const r = await f.get('https://h.example/x');
  assert.equal(r.kind, 'response');
  if (r.kind !== 'response') return;
  assert.equal(r.sha256, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.match(r.capturedAt, /^2026-11-16T03:00:\d\d\.\d{3}Z$/);
});

test('robots parser: TEFAS rules, own group, wildcards and ties', () => {
  const tefas = parseRobots(TEFAS_ROBOTS, 'fon-izi');
  assert.ok(isAllowed('/tr/fon-getirileri', tefas));
  assert.ok(isAllowed('/tr/fon-detayli-analiz/TLY', tefas));
  assert.ok(!isAllowed('/api/funds/x', tefas));
  assert.ok(!isAllowed('/_next/data/x.json', tefas));

  const own = parseRobots('User-agent: *\nDisallow: /\n\nUser-agent: fon-izi\nAllow: /public\nDisallow: /', 'fon-izi');
  assert.ok(isAllowed('/public/page', own));
  assert.ok(!isAllowed('/other', own));

  const wild = parseRobots('User-agent: *\nDisallow: /*.pdf$\nDisallow: /a*b\nAllow: /tie\nDisallow: /tie', 'fon-izi');
  assert.ok(!isAllowed('/docs/x.pdf', wild));
  assert.ok(isAllowed('/docs/x.pdf?y=1', wild));
  assert.ok(!isAllowed('/a-long-b', wild));
  assert.ok(isAllowed('/tie', wild));

  assert.equal(rulesFromResponse(404, '', 'fon-izi').mode, 'all-allowed');
  assert.equal(rulesFromResponse(666, '', 'fon-izi').mode, 'all-disallowed');
});
