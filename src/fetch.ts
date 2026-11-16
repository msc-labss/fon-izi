/**
 * Polite HTTP layer (spec fund-data-archive, "Polite capture").
 *
 * - At most one request per second to each host, robots.txt included.
 * - A User-Agent that names the project and its repository, and no person.
 * - robots.txt honoured: a disallowed URL is not requested.
 * - 30 s timeout; one retry after a network error, 5xx or 429.
 * - Redirects are not followed; the 3xx status is the result.
 *
 * Adapted from `fetchIndex` in MSC Labs' Resmî Gazete monitor. Fetch and
 * clock are injected so tests run without network or real time.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isAllowed, rulesFromResponse } from './robots.ts';
import type { RobotsRules } from './robots.ts';

const VERSION: string = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
export const PRODUCT = 'fon-izi';
export const USER_AGENT = `${PRODUCT}/${VERSION} (+https://github.com/msc-labss/fon-izi)`;
export const TOOL_VERSION = `${PRODUCT}@${VERSION}`;

export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export type FetchLike = (url: string, init: RequestInit) => Promise<{ status: number; headers: Headers; arrayBuffer(): Promise<ArrayBuffer> }>;

export interface RequestLogEntry {
  url: string;
  host: string;
  at: number;
}

export type FetchResult =
  | { kind: 'response'; url: string; status: number; body: string; sha256: string; capturedAt: string; location: string | null; contentLocation: string | null }
  | { kind: 'network-error'; url: string; error: string; capturedAt: string }
  | { kind: 'robots-disallowed'; url: string; capturedAt: string };

export interface FetcherOptions {
  fetchImpl?: FetchLike;
  clock?: Clock;
  userAgent?: string;
  minIntervalMs?: number;
  /** Longer spacing for some hosts, e.g. `{ 'web.archive.org': 5000 }`. */
  hostIntervalMs?: Record<string, number>;
  /**
   * Hosts whose unreadable robots.txt (not 2xx, not 4xx) counts as "no rules"
   * instead of "disallow everything". Founder's decision for KAP only (plan
   * design D16); every other host keeps RFC 9309.
   */
  unreadableRobotsAllowed?: readonly string[];
  retryDelayMs?: number;
  timeoutMs?: number;
  logError?: (message: string) => void;
}

export const sha256 = (bytes: Uint8Array | string): string => createHash('sha256').update(bytes).digest('hex');

export function createFetcher({
  fetchImpl = fetch as unknown as FetchLike,
  clock = realClock,
  userAgent = USER_AGENT,
  minIntervalMs = 1000,
  hostIntervalMs = {},
  unreadableRobotsAllowed = [],
  retryDelayMs = 5000,
  timeoutMs = 30_000,
  logError = (m) => console.error(m),
}: FetcherOptions = {}) {
  const log: RequestLogEntry[] = [];
  const hostQueue = new Map<string, Promise<void>>();
  const nextAt = new Map<string, number>();
  const robotsByOrigin = new Map<string, Promise<RobotsRules>>();
  const iso = () => new Date(clock.now()).toISOString();

  /** Waits for the host's turn; serialises requests per host. */
  function turn(host: string): Promise<void> {
    const previous = hostQueue.get(host) ?? Promise.resolve();
    const mine = previous.then(async () => {
      const wait = (nextAt.get(host) ?? 0) - clock.now();
      if (wait > 0) await clock.sleep(wait);
      nextAt.set(host, clock.now() + Math.max(minIntervalMs, hostIntervalMs[host] ?? 0));
    });
    hostQueue.set(host, mine);
    return mine;
  }

  async function once(url: string, requestTimeoutMs: number) {
    const host = new URL(url).host;
    await turn(host);
    log.push({ url, host, at: clock.now() });
    const res = await fetchImpl(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(requestTimeoutMs),
      headers: { 'User-Agent': userAgent, 'Accept-Language': 'tr-TR' },
    });
    const bytes = new Uint8Array(await res.arrayBuffer());
    return { status: res.status, bytes, location: res.headers.get('location'), contentLocation: res.headers.get('content-location') };
  }

  /** One request with one retry; never throws. */
  async function request(url: string, requestTimeoutMs = timeoutMs): Promise<FetchResult> {
    for (let attempt = 1; ; attempt++) {
      try {
        const r = await once(url, requestTimeoutMs);
        if ((r.status >= 500 || r.status === 429) && attempt === 1) {
          logError(`${url}: HTTP ${r.status}, retrying`);
          await clock.sleep(retryDelayMs);
          continue;
        }
        return { kind: 'response', url, status: r.status, body: new TextDecoder().decode(r.bytes), sha256: sha256(r.bytes), capturedAt: iso(), location: r.location, contentLocation: r.contentLocation };
      } catch (e) {
        const cause = (e as { cause?: { code?: string } })?.cause?.code;
        const message = `${(e as Error)?.message ?? e}${cause ? ` (${cause})` : ''}`;
        logError(`${url}: ${message}`);
        if (attempt === 2) return { kind: 'network-error', url, error: message, capturedAt: iso() };
        await clock.sleep(retryDelayMs);
      }
    }
  }

  function robotsFor(origin: string): Promise<RobotsRules> {
    let rules = robotsByOrigin.get(origin);
    if (!rules) {
      const host = new URL(origin).host;
      rules = request(`${origin}/robots.txt`).then((r) => {
        const parsed = r.kind === 'response' ? rulesFromResponse(r.status, r.body, PRODUCT) : rulesFromResponse(null, '', PRODUCT);
        return parsed.mode === 'all-disallowed' && unreadableRobotsAllowed.includes(host) ? { mode: 'all-allowed' as const, rules: [] } : parsed;
      });
      robotsByOrigin.set(origin, rules);
    }
    return rules;
  }

  /** Fetches `url` if robots.txt allows it. `timeoutMs` overrides the default for this request. */
  async function get(url: string, { timeoutMs: requestTimeoutMs }: { timeoutMs?: number } = {}): Promise<FetchResult> {
    const u = new URL(url);
    const rules = await robotsFor(u.origin);
    if (!isAllowed(u.pathname + u.search, rules)) return { kind: 'robots-disallowed', url, capturedAt: iso() };
    return request(url, requestTimeoutMs ?? timeoutMs);
  }

  return { get, log };
}

export type Fetcher = ReturnType<typeof createFetcher>;
