/**
 * Backtest (spec fund-flag-backtest).
 *
 * Evaluates every flag point-in-time on a weekly grid (Fridays from
 * 3 Jan 2025) for the event-set funds and a control group, then reports per
 * flag: lead times before each event date for the event funds, next to the
 * share of control funds the same flag fired for. `insufficient-data` is
 * counted apart and never as "never fired". Every run is appended to the
 * report; earlier runs stay.
 */
import { evaluate } from './flags.ts';
import type { FlagResult, FundIndex } from './flags.ts';
import type { Method } from './method.ts';

export const GRID_START = '2025-01-03';

const DAY = 86_400_000;
const toMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
const toDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Fridays from `from` (itself a Friday) through `to`, inclusive. */
export function fridays(from: string, to: string): string[] {
  if (new Date(toMs(from)).getUTCDay() !== 5) throw new Error(`${from} is not a Friday`);
  const out: string[] = [];
  for (let t = toMs(from); t <= toMs(to); t += 7 * DAY) out.push(toDay(t));
  return out;
}

export interface Point {
  date: string;
  status: 'ok' | 'insufficient-data';
  triggered: boolean | '';
}

export interface LeadTime {
  status: 'lead' | 'never' | 'insufficient-data';
  since: string | null;
  days: number | null;
}

/**
 * The first grid date from which the flag stayed triggered until the event
 * (looking back from the last date with data on or before the event); an
 * `insufficient-data` date ends the streak.
 */
export function leadTime(series: readonly Point[], eventDate: string): LeadTime {
  const upto = [...series].filter((p) => p.date <= eventDate).sort((a, b) => (a.date < b.date ? -1 : 1));
  let i = upto.length - 1;
  while (i >= 0 && upto[i].status !== 'ok') i--;
  if (i < 0) return { status: 'insufficient-data', since: null, days: null };
  if (upto[i].triggered !== true) return { status: 'never', since: null, days: null };
  let since = upto[i].date;
  for (let j = i - 1; j >= 0 && upto[j].status === 'ok' && upto[j].triggered === true; j--) since = upto[j].date;
  return { status: 'lead', since, days: Math.round((toMs(eventDate) - toMs(since)) / DAY) };
}

export interface ControlShare {
  /** Control funds with data for this flag on at least one grid date. */
  withData: number;
  /** Of those, how many it fired for on at least one grid date. */
  everTriggered: number;
  byDate: { date: string; ok: number; triggered: number }[];
}

export function controlShare(results: Iterable<Pick<FlagResult, 'fund_code' | 'date' | 'status' | 'triggered'>>): ControlShare {
  const withData = new Set<string>();
  const fired = new Set<string>();
  const byDate = new Map<string, { ok: number; triggered: number }>();
  for (const r of results) {
    if (r.status !== 'ok') continue;
    withData.add(r.fund_code);
    const d = byDate.get(r.date) ?? { ok: 0, triggered: 0 };
    d.ok++;
    if (r.triggered === true) {
      d.triggered++;
      fired.add(r.fund_code);
    }
    byDate.set(r.date, d);
  }
  return { withData: withData.size, everTriggered: fired.size, byDate: [...byDate].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, v]) => ({ date, ...v })) };
}

export interface EventRow {
  code: string;
  event: string;
  date: string;
}

export interface BacktestRun {
  runAt: string;
  method: { version: string; sha256: string };
  archiveDigest: string;
  grid: { from: string; to: string; dates: number };
  events: { name: string; date: string }[];
  eventFunds: number;
  controlFunds: number;
  flags: {
    flag: string;
    lead: { event: string; lead: number; never: number; insufficient: number; medianDays: number | null }[];
    control: ControlShare;
    eventCoverage: number;
    /** Event funds the flag fired for on at least one grid date (same measure as the controls'). */
    eventEverTriggered: number;
  }[];
  leadTimes: { code: string; flag: string; event: string; status: string; since: string; days: number | '' }[];
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function runBacktest(opts: { ix: FundIndex; method: Method; events: readonly EventRow[]; controls: readonly string[]; runAt: string; archiveDigest: string; gridFrom?: string; log?: (m: string) => void }): BacktestRun {
  const { ix, method, events, controls } = opts;
  const log = opts.log ?? (() => {});
  const lastEvent = events.reduce((m, e) => (e.date > m ? e.date : m), '');
  const grid = fridays(opts.gridFrom ?? GRID_START, lastEvent);
  const eventCodes = [...new Set(events.map((e) => e.code))].sort();
  const eventNames = [...new Map(events.map((e) => [e.event, e.date])).entries()].sort(([, a], [, b]) => (a < b ? -1 : 1));

  const evalAll = (codes: readonly string[], label: string) => {
    const out = new Map<string, FlagResult[]>(); // flag -> results
    codes.forEach((code, i) => {
      for (const date of grid)
        for (const r of evaluate(ix, method, code, date)) {
          let list = out.get(r.flag);
          if (!list) out.set(r.flag, (list = []));
          list.push(r);
        }
      if ((i + 1) % 200 === 0) log(`backtest: ${label} ${i + 1}/${codes.length}`);
    });
    return out;
  };
  const eventResults = evalAll(eventCodes, 'event funds');
  const controlResults = evalAll(controls, 'controls');

  const leadTimes: BacktestRun['leadTimes'] = [];
  const flags = method.flags.map((def) => {
    const rs = eventResults.get(def.id) ?? [];
    const byFund = new Map<string, Point[]>();
    for (const r of rs) {
      let list = byFund.get(r.fund_code);
      if (!list) byFund.set(r.fund_code, (list = []));
      list.push({ date: r.date, status: r.status, triggered: r.triggered });
    }
    const lead = eventNames.map(([name, date]) => {
      const codes = events.filter((e) => e.event === name).map((e) => e.code);
      const lt = codes.map((code) => {
        const l = leadTime(byFund.get(code) ?? [], date);
        leadTimes.push({ code, flag: def.id, event: name, status: l.status, since: l.since ?? '', days: l.days ?? '' });
        return l;
      });
      return {
        event: name,
        lead: lt.filter((l) => l.status === 'lead').length,
        never: lt.filter((l) => l.status === 'never').length,
        insufficient: lt.filter((l) => l.status === 'insufficient-data').length,
        medianDays: median(lt.filter((l) => l.status === 'lead').map((l) => l.days as number)),
      };
    });
    const covered = new Set(rs.filter((r) => r.status === 'ok').map((r) => r.fund_code));
    const fired = new Set(rs.filter((r) => r.status === 'ok' && r.triggered === true).map((r) => r.fund_code));
    return { flag: def.id, lead, control: controlShare(controlResults.get(def.id) ?? []), eventCoverage: covered.size, eventEverTriggered: fired.size };
  });
  leadTimes.sort((a, b) => (a.flag < b.flag ? -1 : a.flag > b.flag ? 1 : a.event < b.event ? -1 : a.event > b.event ? 1 : a.code < b.code ? -1 : 1));
  return {
    runAt: opts.runAt,
    method: { version: method.version, sha256: method.sha256 },
    archiveDigest: opts.archiveDigest,
    grid: { from: grid[0], to: grid[grid.length - 1], dates: grid.length },
    events: eventNames.map(([name, date]) => ({ name, date })),
    eventFunds: eventCodes.length,
    controlFunds: controls.length,
    flags,
    leadTimes,
  };
}

const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)}%` : '–');

/** One report section; each run is appended under its own heading. */
export function reportSection(run: BacktestRun): string {
  const lines = [
    `## Run ${run.runAt} · method ${run.method.version}`,
    '',
    `- METHOD.md SHA-256: \`${run.method.sha256}\``,
    `- Archive digest (SHA-256 of all record ids): \`${run.archiveDigest}\``,
    `- Grid: ${run.grid.dates} Fridays, ${run.grid.from} to ${run.grid.to}`,
    `- Event funds: ${run.eventFunds}; control funds: ${run.controlFunds}`,
    `- Events: ${run.events.map((e) => `${e.name} (${e.date})`).join(', ')}`,
    '',
    'Each row puts a flag\'s lead times for the event funds next to the share of control funds it fired for. Lead: the flag stayed triggered from a grid date until the event. "Ever fired" uses the same measure for both groups: the flag fired on at least one grid date. `insufficient-data` is counted apart, never as a miss.',
    '',
    `| Flag | ${run.events.map((e) => `${e.name}: lead / never / no data (median days)`).join(' | ')} | Event funds with data | Event funds it ever fired for | Control funds with data | Controls it ever fired for | Mean weekly control share |`,
    `|---|${run.events.map(() => '---').join('|')}|---|---|---|---|---|`,
  ];
  for (const f of run.flags) {
    const weekly = f.control.byDate.filter((d) => d.ok > 0);
    const mean = weekly.length ? weekly.reduce((s, d) => s + d.triggered / d.ok, 0) / weekly.length : null;
    lines.push(
      `| ${f.flag} | ${f.lead.map((l) => `${l.lead} / ${l.never} / ${l.insufficient} (${l.medianDays ?? '–'})`).join(' | ')} | ${f.eventCoverage} of ${run.eventFunds} | ${f.eventEverTriggered} (${pct(f.eventEverTriggered, f.eventCoverage)}) | ${f.control.withData} of ${run.controlFunds} | ${f.control.everTriggered} (${pct(f.control.everTriggered, f.control.withData)}) | ${mean === null ? '–' : `${(mean * 100).toFixed(1)}%`} |`,
    );
  }
  return `${lines.join('\n')}\n`;
}
