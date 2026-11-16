/**
 * Flag engine (spec fund-risk-metrics; METHOD.md v0).
 *
 * Builds a point-in-time index from archive records and evaluates each flag
 * for a fund and a date D using only observations available on D (rule 1),
 * returning `insufficient-data` when an input is missing (rule 2) and the
 * ids of every record used (rule 3). Results carry no score or rank.
 */
import { endOfTefasDay } from './dump-import.ts';
import { crosses } from './method.ts';
import type { FlagDefinition, Method } from './method.ts';
import type { ArchiveRecord } from './record.ts';

/** The flags this engine computes; must equal METHOD.md's (test). */
export const FLAG_IDS = ['return-vs-peers', 'investor-growth', 'net-inflow', 'repo-borrowing', 'free-float-share', 'manager-cluster', 'days-to-exit', 'reach-vs-type'] as const;

/** A value for date X is the last observation within this many days before X. */
export const MAX_AGE_DAYS = 31;
/** A holdings report counts on D when its month ended at most this many days before D. */
export const MAX_REPORT_AGE_DAYS = 62;

interface Obs<T> {
  date: string; // the date the value is for
  value: T;
  availableAt: string; // ISO UTC
  recordId: string;
}

interface Holding {
  key: string; // BIST code, else ISIN, else issuer text
  weight: number;
}

interface Report {
  month: string; // YYYY-MM
  holdings: Holding[];
  availableAt: string;
  recordId: string;
}

export interface FundIndex {
  price: Map<string, Obs<number>[]>;
  investors: Map<string, Obs<number>[]>;
  size: Map<string, Obs<number>[]>;
  allocation: Map<string, Obs<Record<string, number>>[]>;
  category: Map<string, Obs<string>[]>;
  title: Map<string, Obs<string>[]>;
  reports: Map<string, Report[]>;
  /** Record ids of the daily all-funds tables by date, for peer sets. */
  dailyTables: Map<string, { availableAt: string; recordId: string; prices: Map<string, number> }>;
}

const DUMP_ALLOCATION_NAMES: Record<string, string> = { r: 'Repo', tr: 'Ters-Repo', hs: 'Hisse Senedi' };

const push = <T>(m: Map<string, Obs<T>[]>, code: string, o: Obs<T>) => {
  let list = m.get(code);
  if (!list) m.set(code, (list = []));
  list.push(o);
};
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function buildIndex(records: Iterable<ArchiveRecord>): FundIndex {
  const ix: FundIndex = { price: new Map(), investors: new Map(), size: new Map(), allocation: new Map(), category: new Map(), title: new Map(), reports: new Map(), dailyTables: new Map() };
  const isinToCode = new Map<string, string>();
  const pendingReports: ArchiveRecord[] = [];
  for (const r of records) {
    const at = r.publishedAt ?? r.capturedAt;
    const d = r.data as Record<string, any>;
    if (r.kind === 'daily-figures') {
      const prices = new Map<string, number>();
      for (const row of d.rows as Record<string, any>[]) {
        const o = { date: d.date, availableAt: at, recordId: r.id };
        if (isNum(row.price) && row.price > 0) {
          push(ix.price, row.code, { ...o, value: row.price });
          prices.set(row.code, row.price);
        }
        if (isNum(row.investors)) push(ix.investors, row.code, { ...o, value: row.investors });
        if (isNum(row.size)) push(ix.size, row.code, { ...o, value: row.size });
      }
      ix.dailyTables.set(d.date, { availableAt: at, recordId: r.id, prices });
    } else if (r.kind === 'daily-allocation') {
      for (const row of d.rows as Record<string, any>[]) {
        const named: Record<string, number> = {};
        for (const [k, v] of Object.entries(row.allocation as Record<string, number>)) named[DUMP_ALLOCATION_NAMES[k] ?? k] = v;
        push(ix.allocation, row.code, { date: d.date, value: named, availableAt: at, recordId: r.id });
      }
    } else if (r.kind === 'fund') {
      const code = d.code as string;
      const o = { date: r.capturedAt.slice(0, 10), availableAt: at, recordId: r.id };
      if (isNum(d.unitPrice) && d.unitPrice > 0) push(ix.price, code, { ...o, value: d.unitPrice });
      if (isNum(d.investorCount)) push(ix.investors, code, { ...o, value: d.investorCount });
      if (isNum(d.totalValue)) push(ix.size, code, { ...o, value: d.totalValue });
      if (Array.isArray(d.allocation)) {
        const a: Record<string, number> = {};
        for (const s of d.allocation as { assetType: string; percent: number }[]) if (isNum(s.percent)) a[s.assetType] = s.percent;
        push(ix.allocation, code, { ...o, value: a });
      }
      if (typeof d.category === 'string' && d.category) push(ix.category, code, { ...o, value: d.category });
      if (typeof d.title === 'string' && d.title) push(ix.title, code, { ...o, value: d.title });
    } else if (r.kind === 'price-history') {
      for (const [date, price] of d.prices as [string, number][]) if (isNum(price) && price > 0) push(ix.price, d.code, { date, value: price, availableAt: at, recordId: r.id });
    } else if (r.kind === 'list-entry') {
      if (typeof d.title === 'string') push(ix.title, d.code, { date: r.capturedAt.slice(0, 10), value: d.title, availableAt: at, recordId: r.id });
    } else if (r.kind === 'holdings-report') {
      pendingReports.push(r);
      for (const h of d.holdings as { isin: string | null; bistCode: string | null }[]) if (h.isin && h.bistCode && !isinToCode.has(h.isin)) isinToCode.set(h.isin, h.bistCode);
    }
  }
  for (const r of pendingReports) {
    const d = r.data as { code: string; reportMonth: string; holdings: { isin: string | null; bistCode: string | null; issuer: string; weight: number | null }[] };
    const holdings = d.holdings
      .filter((h) => isNum(h.weight))
      .map((h) => ({ key: h.bistCode || (h.isin ? (isinToCode.get(h.isin) ?? h.isin) : h.issuer), weight: h.weight as number }));
    let reps = ix.reports.get(d.code);
    if (!reps) ix.reports.set(d.code, (reps = []));
    reps.push({ month: d.reportMonth, holdings, availableAt: r.publishedAt ?? r.capturedAt, recordId: r.id });
  }
  const byDate = <T>(a: Obs<T>, b: Obs<T>) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.availableAt < b.availableAt ? -1 : a.availableAt > b.availableAt ? 1 : a.recordId < b.recordId ? -1 : 1);
  for (const m of [ix.price, ix.investors, ix.size, ix.allocation, ix.category, ix.title] as Map<string, Obs<unknown>[]>[]) for (const v of m.values()) v.sort(byDate);
  return ix;
}

const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** The last observation for a date on or before `x`, at most `maxAge` days older, and available by the end of `d`. */
function asOf<T>(obs: Obs<T>[] | undefined, x: string, d: string, maxAge = MAX_AGE_DAYS): Obs<T> | null {
  if (!obs) return null;
  const known = endOfTefasDay(d);
  const oldest = addDays(x, -maxAge);
  for (let i = obs.length - 1; i >= 0; i--) {
    const o = obs[i];
    if (o.date > x || o.availableAt > known) continue;
    return o.date >= oldest ? o : null;
  }
  return null;
}

const managerOf = (title: string) => {
  const m = /^(.*?PORTFÖY)\b/i.exec(title);
  return m ? m[1].toLocaleUpperCase('tr-TR') : null;
};

export interface FlagResult {
  fund_code: string;
  date: string;
  flag: string;
  method_version: string;
  status: 'ok' | 'insufficient-data';
  value: number | '';
  threshold: string;
  triggered: boolean | '';
  inputs: string;
  note: string;
}

export function evaluate(ix: FundIndex, method: Method, code: string, date: string): FlagResult[] {
  return method.flags.map((def) => evaluateFlag(ix, def, method.version, code, date));
}

function evaluateFlag(ix: FundIndex, def: FlagDefinition, version: string, code: string, date: string): FlagResult {
  const base = { fund_code: code, date, flag: def.id, method_version: version, threshold: `${def.threshold.op} ${def.threshold.value}` };
  const missing = (note: string): FlagResult => ({ ...base, status: 'insufficient-data', value: '', triggered: '', inputs: '', note });
  const done = (value: number, inputs: string[], note = ''): FlagResult => ({
    ...base,
    status: 'ok',
    value: Number(value.toPrecision(12)),
    triggered: crosses(value, def.threshold),
    inputs: [...new Set(inputs)].sort().join(';'),
    note,
  });
  const back = addDays(date, -def.window_days);
  switch (def.id) {
    case 'return-vs-peers': {
      const now = asOf(ix.price.get(code), date, date);
      const then = asOf(ix.price.get(code), back, date);
      const tNow = ix.dailyTables.get(now?.date ?? '');
      const tThen = ix.dailyTables.get(then?.date ?? '');
      if (!now || !then || !tNow || !tThen || tNow.availableAt > endOfTefasDay(date)) return missing('no daily all-funds prices on both dates');
      const r = now.value / then.value - 1;
      const peers: number[] = [];
      for (const [c, p] of tNow.prices) {
        const q = tThen.prices.get(c);
        if (q) peers.push(p / q - 1);
      }
      if (peers.length < 20) return missing(`only ${peers.length} funds priced on both dates`);
      const rank = (100 * peers.filter((x) => x <= r).length) / peers.length;
      return done(rank, [now.recordId, then.recordId, tNow.recordId, tThen.recordId], `r90 ${(r * 100).toFixed(2)}% among ${peers.length} funds`);
    }
    case 'investor-growth': {
      const now = asOf(ix.investors.get(code), date, date);
      const then = asOf(ix.investors.get(code), back, date);
      if (!now || !then) return missing('investor count missing on one of the dates');
      const minInvestors = Number(def.min_investors ?? 0);
      if (now.value < minInvestors) return { ...done(now.value / Math.max(then.value, 1), [now.recordId, then.recordId], `below ${minInvestors} investors`), triggered: false };
      return done(now.value / Math.max(then.value, 1), [now.recordId, then.recordId]);
    }
    case 'net-inflow': {
      const sNow = asOf(ix.size.get(code), date, date);
      const sThen = asOf(ix.size.get(code), back, date);
      const pNow = asOf(ix.price.get(code), date, date);
      const pThen = asOf(ix.price.get(code), back, date);
      if (!sNow || !sThen || !pNow || !pThen || sThen.value <= 0) return missing('size or price missing on one of the dates');
      const r = pNow.value / pThen.value - 1;
      return done((sNow.value - sThen.value * (1 + r)) / sThen.value, [sNow.recordId, sThen.recordId, pNow.recordId, pThen.recordId]);
    }
    case 'repo-borrowing': {
      const a = asOf(ix.allocation.get(code), date, date);
      if (!a) return missing('no allocation within 31 days');
      return done(a.value.Repo ?? 0, [a.recordId]);
    }
    case 'free-float-share':
      return missing('no point-in-time free-float source (METHOD.md)');
    case 'days-to-exit':
      return missing('no daily volume source (METHOD.md)');
    case 'manager-cluster': {
      const minWeight = Number(def.min_weight_percent ?? 10);
      const known = endOfTefasDay(date);
      const latest = (c: string) =>
        (ix.reports.get(c) ?? [])
          .filter((r) => r.availableAt <= known && addDays(`${r.month}-28`, MAX_REPORT_AGE_DAYS + 3) >= date)
          .sort((a, b) => (a.month < b.month ? 1 : -1))[0];
      const own = latest(code);
      const title = asOf(ix.title.get(code), date, date, 3650);
      const manager = title ? managerOf(title.value) : null;
      if (!own || !manager) return missing(own ? 'manager unknown' : 'no holdings report available');
      const sameManager = [...ix.reports.keys()].filter((c) => {
        const t = asOf(ix.title.get(c), date, date, 3650);
        return t && managerOf(t.value) === manager;
      });
      let best = 0;
      const inputs = new Set<string>([own.recordId, title!.recordId]);
      for (const h of own.holdings.filter((x) => x.weight >= minWeight)) {
        let n = 0;
        for (const c of sameManager) {
          const rep = latest(c);
          if (rep && rep.holdings.some((x) => x.key === h.key && x.weight >= minWeight)) {
            n++;
            inputs.add(rep.recordId);
          }
        }
        best = Math.max(best, n);
      }
      return done(best, [...inputs], `manager ${manager}`);
    }
    case 'reach-vs-type': {
      const cat = asOf(ix.category.get(code), date, date, 3650);
      const inv = asOf(ix.investors.get(code), date, date);
      if (!cat || !inv) return missing(cat ? 'investor count missing' : 'category unknown');
      if (!/serbest/i.test(cat.value)) return { ...done(0, [cat.recordId], `category ${cat.value}`), triggered: false };
      return done(inv.value, [cat.recordId, inv.recordId], `category ${cat.value}`);
    }
    default:
      return missing(`no engine rule for ${def.id}`);
  }
}

export const RESULT_COLUMNS = ['fund_code', 'date', 'flag', 'method_version', 'status', 'value', 'threshold', 'triggered', 'inputs', 'note'] as const;
