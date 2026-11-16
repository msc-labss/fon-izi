/**
 * History coverage in the Internet Archive (plan task 2.4).
 *
 * For each fund (event set plus a seeded control sample), how many
 * archive.org captures of its TEFAS page exist per month, and how many of
 * them are usable fund pages.
 */
import { captures, isUsable, NEW_PAGE, OLD_PAGE } from './cdx.ts';
import type { Capture } from './cdx.ts';
import { parseCsvRecords } from './csv.ts';
import type { Fetcher } from './fetch.ts';
import { apportion, drawSample } from './sample.ts';
import { extractFundList } from './tefas.ts';

export const SAMPLE_SEED = 20261116;
export const SAMPLE_SIZE = 200;

export interface Fund {
  code: string;
  group: 'event' | 'control';
  stratum: string;
}

/** Event-set funds and a control sample drawn from the TEFAS fund list page. */
export function studyFunds(fundListHtml: string, eventsCsv: string, size = SAMPLE_SIZE, seed = SAMPLE_SEED): Fund[] {
  const list = extractFundList(fundListHtml);
  const eventCodes = new Set(parseCsvRecords(eventsCsv).records.map((r) => r.fund_code));
  const stratum = (code: string) => String(list.find((e) => e.code === code)?.umbrellaType ?? 'unknown');
  const weights: Record<string, number> = {};
  for (const code of eventCodes) weights[stratum(code)] = (weights[stratum(code)] ?? 0) + 1;
  const pool = list.filter((e) => !eventCodes.has(e.code) && String(e.umbrellaType) in weights).map((e) => ({ code: e.code, stratum: String(e.umbrellaType) }));
  const controls = drawSample(pool, apportion(weights, size), seed);
  return [
    ...[...eventCodes].sort().map((code) => ({ code, group: 'event' as const, stratum: stratum(code) })),
    ...controls.map((c) => ({ code: c.code, group: 'control' as const, stratum: c.stratum })),
  ];
}

/** Months `YYYY-MM` from `from` to `to`, inclusive. */
export function months(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m === 13) {
      y++;
      m = 1;
    }
  }
  return out;
}

export interface CoverageRow {
  fund_code: string;
  group: string;
  stratum: string;
  month: string;
  old_captures: number;
  old_usable: number;
  new_captures: number;
  new_usable: number;
  first_usable: string;
}

const monthOf = (c: Capture) => `${c.timestamp.slice(0, 4)}-${c.timestamp.slice(4, 6)}`;

export function coverageRows(fund: Fund, monthList: readonly string[], oldCaps: readonly Capture[], newCaps: readonly Capture[]): CoverageRow[] {
  return monthList.map((month) => {
    const o = oldCaps.filter((c) => monthOf(c) === month);
    const n = newCaps.filter((c) => monthOf(c) === month);
    const usable = [...o, ...n].filter(isUsable).map((c) => c.timestamp).sort();
    return {
      fund_code: fund.code,
      group: fund.group,
      stratum: fund.stratum,
      month,
      old_captures: o.length,
      old_usable: o.filter(isUsable).length,
      new_captures: n.length,
      new_usable: n.filter(isUsable).length,
      first_usable: usable[0] ?? '',
    };
  });
}

/** CDX queries fail now and then (5xx, rate limits); back off 30, 60 and 120 s before giving up. */
async function withBackoff<T>(what: string, fn: () => Promise<T>, sleep: (ms: number) => Promise<void>, log: (m: string) => void): Promise<T> {
  for (const wait of [30_000, 60_000, 120_000, -1]) {
    try {
      return await fn();
    } catch (e) {
      if (wait < 0) throw e;
      log(`${what}: ${(e as Error).message}; retrying in ${wait / 1000} s`);
      await sleep(wait);
    }
  }
  throw new Error('unreachable');
}

export async function archiveCoverage(
  fetcher: Fetcher,
  funds: readonly Fund[],
  from: string,
  to: string,
  log = (m: string) => console.error(m),
  sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
): Promise<CoverageRow[]> {
  const monthList = months(from, to);
  const cdxFrom = from.replace('-', '');
  const cdxTo = to.replace('-', '');
  const rows: CoverageRow[] = [];
  for (const [i, fund] of funds.entries()) {
    const oldCaps = await withBackoff(`${fund.code} old`, () => captures(fetcher, OLD_PAGE(fund.code), cdxFrom, cdxTo), sleep, log);
    const newCaps = await withBackoff(`${fund.code} new`, () => captures(fetcher, NEW_PAGE(fund.code), cdxFrom, cdxTo), sleep, log);
    rows.push(...coverageRows(fund, monthList, oldCaps, newCaps));
    if ((i + 1) % 25 === 0) log(`coverage: ${i + 1}/${funds.length} funds`);
  }
  return rows;
}
