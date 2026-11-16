/**
 * Builds the case file's figures from the release tables and the backtest
 * report (spec fund-dataset-release, "Figures from one source").
 */
import type { BacktestRun } from './backtest.ts';
import type { Figures } from './figures.ts';
import type { Method } from './method.ts';

export const MEASURED = ['return-vs-peers', 'investor-growth', 'repo-borrowing', 'net-inflow'] as const;
export const CONTEXT = ['manager-cluster', 'reach-vs-type'] as const;

export interface CaseInputs {
  run: Omit<BacktestRun, 'leadTimes'>;
  runFile: string;
  leadTimes: { code: string; flag: string; event: string; status: string; since: string; days: string }[];
  leadTimesFile: string;
  eventSet: { fund_code: string; manager: string; event: string; event_date: string }[];
  timeline: { event: string }[];
  /** METHOD.md, for thresholds and windows quoted in the text. */
  method: Method;
}

export function buildFigures(x: CaseInputs): Figures {
  const f: Figures = {};
  const ev = (src: string) => `events/2026-fund-crisis.csv: ${src}`;
  f['funds.liquidated'] = { value: new Set(x.eventSet.map((r) => r.fund_code)).size, kind: 'integer', source: ev('distinct fund_code') };
  f['managers'] = { value: new Set(x.eventSet.map((r) => r.manager)).size, kind: 'integer', source: ev('distinct manager') };
  for (const [name, id] of [['guideline-amended', 'date.guideline'], ['liquidation-ordered', 'date.liquidation']] as const) {
    const d = x.eventSet.find((r) => r.event === name)?.event_date;
    if (d) f[id] = { value: d, kind: 'date', source: ev(`event_date of ${name}`) };
  }
  f['timeline.rows'] = { value: x.timeline.length, kind: 'integer', source: 'events/2026-timeline.csv: rows' };
  f['timeline.trading_bans'] = { value: x.timeline.filter((r) => r.event === 'trading-ban').length, kind: 'integer', source: 'events/2026-timeline.csv: event = trading-ban' };
  const rep = (s: string) => `${x.runFile}: ${s}`;
  f['backtest.controls'] = { value: x.run.controlFunds, kind: 'integer', source: rep('controlFunds') };
  f['backtest.grid_dates'] = { value: x.run.grid.dates, kind: 'integer', source: rep('grid.dates') };
  f['backtest.grid_from'] = { value: x.run.grid.from, kind: 'date', source: rep('grid.from') };
  f['backtest.grid_to'] = { value: x.run.grid.to, kind: 'date', source: rep('grid.to') };
  for (const id of [...MEASURED, ...CONTEXT]) {
    const fl = x.run.flags.find((g) => g.flag === id);
    if (!fl) throw new Error(`backtest run has no flag ${id}`);
    const liq = fl.lead.find((l) => l.event === 'liquidation-ordered');
    const eventPct = fl.eventCoverage ? (100 * fl.eventEverTriggered) / fl.eventCoverage : 0;
    const controlPct = fl.control.withData ? (100 * fl.control.everTriggered) / fl.control.withData : 0;
    const k = `flag.${id}`;
    f[`${k}.event_ever`] = { value: eventPct, kind: 'percent', digits: 1, source: rep(`flags[${id}].eventEverTriggered / eventCoverage`) };
    f[`${k}.control_ever`] = { value: controlPct, kind: 'percent', digits: 1, source: rep(`flags[${id}].control.everTriggered / withData`) };
    f[`${k}.event_with_data`] = { value: fl.eventCoverage, kind: 'integer', source: rep(`flags[${id}].eventCoverage`) };
    f[`${k}.control_with_data`] = { value: fl.control.withData, kind: 'integer', source: rep(`flags[${id}].control.withData`) };
    f[`${k}.ratio`] = { value: controlPct ? eventPct / controlPct : 0, kind: 'decimal', digits: 1, source: rep(`flags[${id}] event_ever / control_ever`) };
    if (liq) {
      f[`${k}.lead_liq`] = { value: liq.lead, kind: 'integer', source: rep(`flags[${id}].lead[liquidation-ordered].lead`) };
      if (liq.medianDays !== null) f[`${k}.median_liq`] = { value: liq.medianDays, kind: 'days', source: rep(`flags[${id}].lead[liquidation-ordered].medianDays`) };
    }
  }
  const lt = (s: string) => `${x.leadTimesFile}: ${s}`;
  const liqLeads = x.leadTimes.filter((r) => r.event === 'liquidation-ordered' && r.status === 'lead');
  f['leads.any_measured'] = { value: new Set(liqLeads.filter((r) => (MEASURED as readonly string[]).includes(r.flag)).map((r) => r.code)).size, kind: 'integer', source: lt('distinct code with a lead into liquidation-ordered in the measured flags') };
  const longest = liqLeads.filter((r) => (MEASURED as readonly string[]).includes(r.flag)).sort((a, b) => Number(b.days) - Number(a.days))[0];
  if (longest) {
    f['longest.days'] = { value: Number(longest.days), kind: 'days', source: lt(`${longest.code} ${longest.flag} liquidation-ordered days`) };
    f['longest.since'] = { value: longest.since, kind: 'date', source: lt(`${longest.code} ${longest.flag} liquidation-ordered since`) };
  }
  for (const [flag, key] of [['repo-borrowing', 'tly.repo'], ['return-vs-peers', 'tly.rvp']] as const) {
    const r = liqLeads.find((l) => l.code === 'TLY' && l.flag === flag);
    if (r) {
      f[`${key}.days`] = { value: Number(r.days), kind: 'days', source: lt(`TLY ${flag} liquidation-ordered days`) };
      f[`${key}.since`] = { value: r.since, kind: 'date', source: lt(`TLY ${flag} liquidation-ordered since`) };
    }
  }
  for (const def of x.method.flags) {
    const src = `METHOD.md ${x.method.version}: ${def.id}`;
    f[`method.${def.id}.threshold`] = { value: Math.abs(def.threshold.value), kind: Number.isInteger(def.threshold.value) ? 'integer' : 'decimal', digits: 2, source: `${src} threshold (absolute value)` };
    if (def.window_days) f[`method.${def.id}.window_days`] = { value: def.window_days, kind: 'integer', source: `${src} window_days` };
    for (const k of ['min_investors', 'min_weight_percent'] as const) if (typeof def[k] === 'number') f[`method.${def.id}.${k}`] = { value: def[k] as number, kind: 'integer', source: `${src} ${k}` };
  }
  return Object.fromEntries(Object.entries(f).sort(([a], [b]) => (a < b ? -1 : 1)));
}
