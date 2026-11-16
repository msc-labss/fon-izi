/**
 * Import of fund holdings from the privately used public dump
 * `sercannnnn/fon-analiz-veri` (plan design D17), into archive records.
 *
 * The dump is a git repository, so it is treated as an archive: each fund's
 * monthly holdings become available at the first commit whose
 * `arsiv/fon_icerik_<YYYY-MM>.csv.gz` contains that fund. One record per fund
 * and report month (`holdings-report`):
 * - capture time: that commit's time (UTC);
 * - source URL: the raw file at that commit;
 * - witness: the file at that commit on GitHub;
 * - origin `backfill`; publication time empty (the dump does not keep KAP's).
 * Later revisions of the same fund and month are not imported.
 */
import { execFileSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { parseCsvRecords } from './csv.ts';
import { sha256, TOOL_VERSION } from './fetch.ts';
import { makeRecord } from './record.ts';

export const DUMP_REPO = 'sercannnnn/fon-analiz-veri';
export const DUMP_SOURCE = 'dump-fon-analiz-veri';
export const HOLDINGS_GROUP = 'dump-holdings';

export interface Holding {
  issuer: string;
  bistCode: string | null;
  isin: string | null;
  assetType: string;
  nominal: number | null;
  marketValue: number | null;
  weight: number | null;
}

const num = (s: string) => (s === '' ? null : Number(s));

/** Rows of one fon_icerik file grouped by fund: report month and holdings. */
export function parseHoldingsFile(csv: string): Map<string, { reportMonth: string; holdings: Holding[] }> {
  const out = new Map<string, { reportMonth: string; holdings: Holding[] }>();
  for (const r of parseCsvRecords(csv).records) {
    const entry = out.get(r.fonKodu) ?? { reportMonth: r.raporTarihi, holdings: [] };
    entry.holdings.push({
      issuer: r.ihracci || r.kiymetAdi,
      bistCode: r.bistKodu || null,
      isin: r.isin || null,
      assetType: r.tur,
      nominal: num(r.nominal),
      marketValue: num(r.rayicDeger),
      weight: num(r.agirlik),
    });
    out.set(r.fonKodu, entry);
  }
  return out;
}

export interface Version {
  commit: string;
  time: string; // ISO 8601 UTC
}

const git = (repo: string, args: string[]) => execFileSync('git', ['-C', repo, ...args], { maxBuffer: 1 << 30 });

/** Versions of a file, oldest first. */
export function fileVersions(repo: string, path: string): Version[] {
  return git(repo, ['log', '--format=%H %cI', '--', path])
    .toString('utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const [commit, time] = l.split(' ');
      return { commit, time: new Date(time).toISOString() };
    })
    .reverse();
}

/** Builds holdings-report record lines, grouped by capture day, from the given file versions. */
export function holdingsRecords(
  path: string,
  versions: readonly Version[],
  readVersion: (commit: string) => Uint8Array,
  codes?: ReadonlySet<string>,
): Map<string, string[]> {
  const seen = new Set<string>();
  const byDay = new Map<string, string[]>();
  for (const v of versions) {
    const bytes = readVersion(v.commit);
    const funds = parseHoldingsFile(gunzipSync(bytes).toString('utf8'));
    for (const [code, report] of [...funds].sort(([a], [b]) => (a < b ? -1 : 1))) {
      const key = `${code}|${report.reportMonth}`;
      if (seen.has(key) || (codes && !codes.has(code))) continue;
      seen.add(key);
      const { line } = makeRecord({
        source: DUMP_SOURCE,
        kind: 'holdings-report',
        sourceUrl: `https://raw.githubusercontent.com/${DUMP_REPO}/${v.commit}/${path}`,
        capturedAt: v.time,
        publishedAt: null,
        httpStatus: 200,
        sha256: sha256(bytes),
        toolVersion: TOOL_VERSION,
        origin: 'backfill',
        witness: { url: `https://github.com/${DUMP_REPO}/blob/${v.commit}/${path}`, reason: null },
        data: { code, reportMonth: report.reportMonth, holdings: report.holdings },
      });
      const day = v.time.slice(0, 10);
      byDay.set(day, [...(byDay.get(day) ?? []), line]);
    }
  }
  return byDay;
}

/** Reads a file at a commit from the local clone. */
export const readAt = (repo: string, path: string) => (commit: string) => new Uint8Array(git(repo, ['show', `${commit}:${path}`]));

export const DAILY_GROUP = 'dump-daily';

/** End of the TEFAS day in Türkiye (23:59:59 +03:00) as ISO UTC. */
export const endOfTefasDay = (date: string) => `${date}T20:59:59.000Z`;

type DailyKind = 'daily-figures' | 'daily-allocation';

function dailyRows(kind: DailyKind, csv: string): Map<string, Record<string, unknown>[]> {
  const byDate = new Map<string, Record<string, unknown>[]>();
  for (const r of parseCsvRecords(csv).records) {
    let row: Record<string, unknown>;
    if (kind === 'daily-figures') row = { code: r.fonKodu, price: num(r.fiyat), investors: num(r.kisiSayisi), size: num(r.portfoyBuyukluk), units: num(r.tedPaySayisi) };
    else {
      const allocation: Record<string, number> = {};
      for (const [k, v] of Object.entries(r)) if (k !== 'tarih' && k !== 'fonKodu' && v !== '') allocation[k] = Number(v);
      row = { code: r.fonKodu, allocation };
    }
    byDate.set(r.tarih, [...(byDate.get(r.tarih) ?? []), row]);
  }
  return byDate;
}

/**
 * One record per TEFAS date: all funds' figures (or allocations) for that
 * date, at the first commit of the monthly file that contains the date.
 * Publication time is the end of that TEFAS day; capture time the commit's.
 * Returns record lines keyed by capture day.
 */
export function dailyRecords(kind: DailyKind, path: string, versions: readonly Version[], readVersion: (commit: string) => Uint8Array, into = new Map<string, string[]>()): Map<string, string[]> {
  const seen = new Set<string>();
  for (const v of versions) {
    const bytes = readVersion(v.commit);
    for (const [date, rows] of [...dailyRows(kind, gunzipSync(bytes).toString('utf8'))].sort(([a], [b]) => (a < b ? -1 : 1))) {
      if (seen.has(date)) continue;
      seen.add(date);
      const { line } = makeRecord({
        source: DUMP_SOURCE,
        kind,
        sourceUrl: `https://raw.githubusercontent.com/${DUMP_REPO}/${v.commit}/${path}`,
        capturedAt: v.time,
        publishedAt: endOfTefasDay(date),
        httpStatus: 200,
        sha256: sha256(bytes),
        toolVersion: TOOL_VERSION,
        origin: 'backfill',
        witness: { url: `https://github.com/${DUMP_REPO}/blob/${v.commit}/${path}`, reason: null },
        data: { date, rows: [...rows].sort((a, b) => (String(a.code) < String(b.code) ? -1 : 1)) },
      });
      const day = v.time.slice(0, 10);
      into.set(day, [...(into.get(day) ?? []), line]);
    }
  }
  return into;
}
