/**
 * Daily TEFAS snapshot (spec fund-data-archive: "Daily TEFAS snapshot",
 * "Disappearance is recorded", "Failure is loud", "Raw bodies follow the
 * source policy").
 *
 * 1. Refuse an existing day file before any request.
 * 2. Fund list: one record per entry (`list-entry`).
 * 3. One detail page per fund: one record per fund (`fund`).
 * 4. A code seen on the latest earlier day and missing today: `absence`.
 * 5. Write the day file and its run summary, or nothing at all.
 *
 * Exit 1 and write nothing when the list cannot be read or is empty, or
 * more than 5% of fund pages fail. Exit 1 after writing when a path was
 * disallowed by robots.txt (the summary lists it).
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { dayPath, readLines, writeDay, writeNew, writeRaw } from './archive.ts';
import { TOOL_VERSION } from './fetch.ts';
import type { Clock, Fetcher, FetchResult } from './fetch.ts';
import { makeRecord } from './record.ts';
import type { ArchiveRecord, Witness } from './record.ts';
import { requireSource } from './registry.ts';
import type { Source } from './registry.ts';
import { ExtractError, extractFundDetail, extractFundList } from './tefas.ts';

export const GROUP = 'tefas';
export const LIST_URL = 'https://www.tefas.gov.tr/tr/fon-getirileri';
export const DETAIL_URL = (code: string) => `https://www.tefas.gov.tr/tr/fon-detayli-analiz/${encodeURIComponent(code)}`;
export const MAX_FAILURE_SHARE = 0.05;

export interface SnapshotOptions {
  root: string;
  day: string;
  sources: readonly Source[];
  fetcher: Fetcher;
  clock: Clock;
  /** Witness for a captured URL; defaults to "off". */
  witness?: (url: string) => Promise<Witness>;
  /** Witnesses listed URLs the run did not capture; results go to the run summary. */
  witnessRest?: () => Promise<Record<string, Witness>>;
  /** Capture only the first N funds of the list (local trials only). */
  limit?: number;
  log?: (message: string) => void;
}

export interface Failure {
  code: string;
  url: string;
  reason: string;
}

export interface SnapshotResult {
  exitCode: number;
  file: string | null;
  summary: Record<string, unknown>;
}

/** Codes listed on the latest day file before `day`, with that day. */
export function previousCodes(root: string, day: string): { day: string; codes: Set<string> } | null {
  const base = join(root, GROUP);
  if (!existsSync(base)) return null;
  const days: string[] = [];
  for (const y of readdirSync(base))
    for (const m of readdirSync(join(base, y)))
      for (const f of readdirSync(join(base, y, m)))
        if (/^\d{4}-\d{2}-\d{2}\.jsonl\.gz$/.test(f) && f.slice(0, 10) < day) days.push(f.slice(0, 10));
  const last = days.sort().at(-1);
  if (!last) return null;
  const codes = new Set<string>();
  for (const line of readLines(dayPath(root, GROUP, last))) {
    if (!line) continue;
    const rec = JSON.parse(line) as ArchiveRecord;
    if (rec.kind === 'list-entry') codes.add((rec.data as { code: string }).code);
  }
  return { day: last, codes };
}

export async function runSnapshot(opts: SnapshotOptions): Promise<SnapshotResult> {
  const { root, day, sources, fetcher, clock, limit } = opts;
  const log = opts.log ?? ((m: string) => console.error(m));
  const witness = opts.witness ?? (async () => ({ url: null, reason: 'off' }));
  const startedAt = new Date(clock.now()).toISOString();
  const summary: Record<string, unknown> = { day, startedAt, toolVersion: TOOL_VERSION };
  const fail = (reason: string): SnapshotResult => {
    summary.error = reason;
    log(`snapshot ${day}: ${reason}; nothing written`);
    return { exitCode: 1, file: null, summary };
  };

  const file = dayPath(root, GROUP, day);
  if (existsSync(file)) return fail(`refusing to overwrite ${file}`);

  let listSource: Source;
  try {
    listSource = requireSource(LIST_URL, sources);
  } catch (e) {
    return fail((e as Error).message);
  }

  const listRes = await fetcher.get(LIST_URL);
  if (listRes.kind !== 'response') return fail(`fund list: ${listRes.kind}${listRes.kind === 'network-error' ? ` (${listRes.error})` : ''}`);
  if (listRes.status !== 200) return fail(`fund list: HTTP ${listRes.status}`);
  let entries;
  try {
    entries = extractFundList(listRes.body);
  } catch (e) {
    return fail(`fund list: ${(e as Error).message}`);
  }
  if (entries.length === 0) return fail('fund list parsed to zero funds');
  entries.sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
  summary.list = { url: LIST_URL, status: listRes.status, sha256: listRes.sha256, funds: entries.length };

  const base = (source: Source, res: Extract<FetchResult, { kind: 'response' }>, w: Witness) => ({
    source: source.id,
    sourceUrl: res.url,
    capturedAt: res.capturedAt,
    publishedAt: null,
    httpStatus: res.status,
    sha256: res.sha256,
    toolVersion: TOOL_VERSION,
    origin: 'snapshot' as const,
    witness: w,
  });

  const lines: string[] = [];
  const raws: { hash: string; body: string }[] = [];
  const keepRaw = (source: Source, res: Extract<FetchResult, { kind: 'response' }>) => {
    if (source.rawPolicy === 'publish') raws.push({ hash: res.sha256, body: res.body });
  };
  const listWitness = await witness(LIST_URL);
  keepRaw(listSource, listRes);
  for (const e of entries) lines.push(makeRecord({ ...base(listSource, listRes, listWitness), kind: 'list-entry', data: { ...e } }).line);

  const targets = typeof limit === 'number' ? entries.slice(0, limit) : entries;
  const failures: Failure[] = [];
  const disallowed: string[] = [];
  const fundLines: string[] = [];
  for (const [i, entry] of targets.entries()) {
    const url = DETAIL_URL(entry.code);
    let source: Source;
    try {
      source = requireSource(url, sources);
    } catch (e) {
      return fail((e as Error).message);
    }
    const res = await fetcher.get(url);
    if (res.kind === 'robots-disallowed') {
      disallowed.push(url);
      continue;
    }
    if (res.kind === 'network-error') {
      failures.push({ code: entry.code, url, reason: `network: ${res.error}` });
      continue;
    }
    if (res.status !== 200) {
      failures.push({ code: entry.code, url, reason: `HTTP ${res.status}${res.location ? ` -> ${res.location}` : ''}` });
      continue;
    }
    try {
      const data = extractFundDetail(res.body, entry.code);
      keepRaw(source, res);
      fundLines.push(makeRecord({ ...base(source, res, await witness(url)), kind: 'fund', data: { ...data } }).line);
    } catch (e) {
      if (!(e instanceof ExtractError)) throw e;
      failures.push({ code: entry.code, url, reason: `extract: ${e.message}` });
    }
    if ((i + 1) % 100 === 0) log(`snapshot ${day}: ${i + 1}/${targets.length} funds, ${failures.length} failed`);
  }

  summary.funds = { attempted: targets.length, captured: fundLines.length, failed: failures.length, robotsDisallowed: disallowed.length };
  summary.failures = failures;
  summary.robotsDisallowed = disallowed;
  const share = targets.length ? failures.length / targets.length : 0;
  if (share > MAX_FAILURE_SHARE) return fail(`${failures.length} of ${targets.length} fund pages failed (${(share * 100).toFixed(1)}% > ${MAX_FAILURE_SHARE * 100}%)`);

  lines.push(...fundLines);
  const previous = previousCodes(root, day);
  const today = new Set(entries.map((e) => e.code));
  const absent = previous ? [...previous.codes].filter((c) => !today.has(c)).sort() : [];
  for (const code of absent) lines.push(makeRecord({ ...base(listSource, listRes, listWitness), kind: 'absence', data: { code, lastListedOn: previous!.day } }).line);
  summary.absences = absent;

  if (opts.witnessRest) {
    const all = await opts.witnessRest();
    summary.witness = { requested: Object.keys(all).length, captured: Object.values(all).filter((w) => w.url).length, results: all };
  }
  writeDay(root, GROUP, day, lines);
  for (const r of raws) writeRaw(root, r.hash, r.body);
  summary.finishedAt = new Date(clock.now()).toISOString();
  summary.records = lines.length;
  writeNew(dayPath(root, GROUP, day, '.run.json'), `${JSON.stringify(summary, null, 2)}\n`);
  if (disallowed.length) {
    log(`snapshot ${day}: ${disallowed.length} paths disallowed by robots.txt`);
    return { exitCode: 1, file, summary };
  }
  log(`snapshot ${day}: ${lines.length} records written to ${file}`);
  return { exitCode: 0, file, summary };
}
