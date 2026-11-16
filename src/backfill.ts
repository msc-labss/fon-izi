/**
 * Historical backfill from Internet Archive captures of the old TEFAS fund
 * page (spec fund-data-archive, "Historical backfill keeps original time").
 *
 * For each fund: list usable captures (src/cdx.ts), fetch each raw capture,
 * extract it (src/tefas-legacy.ts) and write two records per capture:
 * - `fund`: the card, profile and allocation as shown on that day;
 * - `price-history`: the page's one-year daily price series.
 *
 * Each record's capture time and source URL come from the archive capture
 * (`origin: backfill`); its witness is the capture's archive.org URL. Records
 * are grouped by capture day into `archive/tefas-backfill/…/<day>.jsonl.gz`.
 * A day file that already exists is left alone and its captures are
 * reported as skipped: the archive is append-only.
 *
 * Downloaded captures are kept gzipped in a private cache (`cacheDir`), so
 * a run that stops can be repeated without fetching again. Capture-index
 * queries and downloads back off 30, 60 and 120 s on rate limits and 5xx.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { dayPath, writeDay, writeNew } from './archive.ts';
import { captures, isUsable, OLD_PAGE, rawCaptureUrl } from './cdx.ts';
import type { Capture } from './cdx.ts';
import { withBackoff } from './coverage.ts';
import { sha256, TOOL_VERSION } from './fetch.ts';
import type { Clock, Fetcher } from './fetch.ts';
import { makeRecord } from './record.ts';
import { requireSource } from './registry.ts';
import type { Source } from './registry.ts';
import { ExtractError } from './tefas.ts';
import { extractLegacyFundPage } from './tefas-legacy.ts';

export const BACKFILL_GROUP = 'tefas-backfill';

/** 20250818045739 → 2025-08-18T04:57:39.000Z */
export function archiveTime(timestamp: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(timestamp);
  if (!m) throw new Error(`bad archive timestamp: ${timestamp}`);
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.000Z`;
}

export const captureUrl = (c: Pick<Capture, 'timestamp' | 'original'>) => `https://web.archive.org/web/${c.timestamp}/${c.original}`;

export interface BackfillOptions {
  root: string;
  codes: readonly string[];
  from: string; // YYYYMM
  to: string; // YYYYMM
  sources: readonly Source[];
  fetcher: Fetcher;
  clock: Clock;
  log?: (message: string) => void;
  /** List captures only from this function (tests). */
  listCaptures?: (code: string) => Promise<Capture[]>;
  /** Private cache of downloaded captures; none when absent. */
  cacheDir?: string;
  /** Back-off sleep (tests pass a no-op). */
  sleep?: (ms: number) => Promise<void>;
}

class RetryableHttp extends Error {}

export async function runBackfill(opts: BackfillOptions): Promise<{ exitCode: number; summary: Record<string, unknown> }> {
  const { root, codes, sources, fetcher, clock } = opts;
  const log = opts.log ?? ((m: string) => console.error(m));
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const query = (code: string) => captures(fetcher, OLD_PAGE(code), opts.from, opts.to);
  const list = opts.listCaptures ?? ((code: string) => withBackoff(`${code} captures`, () => query(code), sleep, log));
  const cachePath = (code: string, c: Capture) => (opts.cacheDir ? join(opts.cacheDir, code, `${c.timestamp}.html.gz`) : null);
  /** The raw capture body: from the cache, or downloaded (with back-off) and cached. */
  async function body(code: string, c: Capture, url: string): Promise<{ status: number; text: string; hash: string } | { error: string }> {
    const cached = cachePath(code, c);
    if (cached && existsSync(cached)) {
      const bytes = gunzipSync(readFileSync(cached));
      return { status: 200, text: bytes.toString('utf8'), hash: sha256(bytes) };
    }
    try {
      return await withBackoff(`${code} ${c.timestamp}`, async () => {
        const res = await fetcher.get(url, { timeoutMs: 120_000 });
        if (res.kind === 'response' && (res.status === 429 || res.status >= 500)) throw new RetryableHttp(`HTTP ${res.status}`);
        if (res.kind === 'network-error') throw new RetryableHttp(res.error);
        if (res.kind !== 'response') return { error: res.kind };
        if (res.status !== 200) return { error: `HTTP ${res.status}` };
        if (cached) {
          mkdirSync(dirname(cached), { recursive: true });
          writeFileSync(cached, gzipSync(Buffer.from(res.body, 'utf8')));
        }
        return { status: res.status, text: res.body, hash: res.sha256 };
      }, sleep, log);
    } catch (e) {
      return { error: (e as Error).message };
    }
  }
  const byDay = new Map<string, string[]>();
  const failures: { code: string; capture: string; reason: string }[] = [];
  let usable = 0;
  for (const [i, code] of codes.entries()) {
    const caps = (await list(code)).filter(isUsable);
    usable += caps.length;
    for (const c of caps) {
      const url = rawCaptureUrl(c);
      let source: Source;
      try {
        source = requireSource(url, sources);
      } catch (e) {
        return { exitCode: 1, summary: { error: (e as Error).message } };
      }
      const res = await body(code, c, url);
      if ('error' in res) {
        failures.push({ code, capture: c.timestamp, reason: res.error });
        continue;
      }
      let page;
      try {
        page = extractLegacyFundPage(res.text, code);
      } catch (e) {
        if (!(e instanceof ExtractError)) throw e;
        failures.push({ code, capture: c.timestamp, reason: `extract: ${e.message}` });
        continue;
      }
      const base = {
        source: source.id,
        sourceUrl: c.original,
        capturedAt: archiveTime(c.timestamp),
        publishedAt: null,
        httpStatus: res.status,
        sha256: res.hash,
        toolVersion: TOOL_VERSION,
        origin: 'backfill' as const,
        witness: { url: captureUrl(c), reason: null },
      };
      const { priceSeries, ...card } = page;
      const day = base.capturedAt.slice(0, 10);
      const lines = byDay.get(day) ?? [];
      lines.push(makeRecord({ ...base, kind: 'fund', data: { ...card } }).line);
      if (priceSeries) lines.push(makeRecord({ ...base, kind: 'price-history', data: { code, prices: priceSeries } }).line);
      byDay.set(day, lines);
    }
    if ((i + 1) % 10 === 0) log(`backfill: ${i + 1}/${codes.length} funds, ${usable} usable captures, ${failures.length} failed`);
  }

  const written: string[] = [];
  const skippedDays: string[] = [];
  for (const day of [...byDay.keys()].sort()) {
    if (existsSync(dayPath(root, BACKFILL_GROUP, day))) {
      skippedDays.push(day);
      continue;
    }
    written.push(writeDay(root, BACKFILL_GROUP, day, [...byDay.get(day)!].sort()));
  }
  const runAt = new Date(clock.now()).toISOString();
  const summary = {
    runAt,
    toolVersion: TOOL_VERSION,
    window: { from: opts.from, to: opts.to },
    funds: codes.length,
    usableCaptures: usable,
    failures,
    daysWritten: written.length,
    daysSkippedExisting: skippedDays,
  };
  writeNew(dayPath(root, BACKFILL_GROUP, runAt.slice(0, 10), `.backfill-run-${runAt.replace(/[:.]/g, '')}.json`), `${JSON.stringify(summary, null, 2)}\n`);
  log(`backfill: ${usable} usable captures, ${written.length} day files written, ${failures.length} failed, ${skippedDays.length} days skipped`);
  return { exitCode: 0, summary };
}
