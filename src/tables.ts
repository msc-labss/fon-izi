/**
 * Derived tables (spec fund-risk-metrics, "Holdings table").
 *
 * Built from archive records; every row carries the id of the record it
 * comes from and that record's availability time (publication time, or
 * capture time when the source states none).
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { readLines } from './archive.ts';
import type { ArchiveRecord } from './record.ts';

/** Every record in the archive (day files only; corrections and raw bodies excluded). */
export function* archiveRecords(root: string): Generator<ArchiveRecord> {
  function* walk(dir: string): Generator<string> {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir).sort()) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name !== 'raw' && name !== 'corrections') yield* walk(p);
      } else if (name.endsWith('.jsonl.gz') || name.endsWith('.jsonl')) yield p;
    }
  }
  for (const file of walk(root)) for (const line of readLines(file)) if (line) yield JSON.parse(line) as ArchiveRecord;
}

export const availableAt = (r: Pick<ArchiveRecord, 'publishedAt' | 'capturedAt'>) => r.publishedAt ?? r.capturedAt;

export const HOLDINGS_COLUMNS = ['fund_code', 'report_month', 'issuer', 'bist_code', 'bist_code_source', 'isin', 'asset_type', 'nominal', 'market_value', 'weight_percent', 'available_at', 'report_record_id'] as const;

/**
 * Holdings rows, one per fund, report month and holding. Early versions of
 * a report may carry the ISIN without the BIST code; the code is then taken
 * from another report that pairs the same ISIN with a code
 * (`bist_code_source: isin-map`), an identifier mapping, not a data value.
 */
export function holdingsTable(records: Iterable<ArchiveRecord>): Record<string, string | number>[] {
  const reports = [...records].filter((r) => r.kind === 'holdings-report');
  const isinToCode = new Map<string, string>();
  for (const r of reports)
    for (const h of (r.data as { holdings: { isin: string | null; bistCode: string | null }[] }).holdings)
      if (h.isin && h.bistCode && !isinToCode.has(h.isin)) isinToCode.set(h.isin, h.bistCode);
  const rows: Record<string, string | number>[] = [];
  for (const r of reports) {
    const d = r.data as { code: string; reportMonth: string; holdings: Record<string, string | number | null>[] };
    for (const h of d.holdings)
      rows.push({
        fund_code: d.code,
        report_month: d.reportMonth,
        issuer: (h.issuer as string) ?? '',
        bist_code: (h.bistCode as string) || (h.isin && isinToCode.get(h.isin as string)) || '',
        bist_code_source: h.bistCode ? 'report' : h.isin && isinToCode.has(h.isin as string) ? 'isin-map' : '',
        isin: (h.isin as string) ?? '',
        asset_type: (h.assetType as string) ?? '',
        nominal: h.nominal ?? '',
        market_value: h.marketValue ?? '',
        weight_percent: h.weight ?? '',
        available_at: availableAt(r),
        report_record_id: r.id,
      });
  }
  return rows.sort((a, b) => String(a.fund_code).localeCompare(String(b.fund_code)) || String(a.report_month).localeCompare(String(b.report_month)) || Number(b.weight_percent || 0) - Number(a.weight_percent || 0));
}

export const ISSUER_COLUMNS = ['bist_code', 'issuer_names', 'isins', 'free_float_shares', 'free_float_source', 'first_available_at', 'report_record_ids'] as const;

/** Why free float is empty: no public point-in-time source (docs/history-spike.md, section 4). */
export const NO_FREE_FLOAT = 'none: no public point-in-time source before 2026-09-14';

/** One row per BIST code seen in the holdings, with the reports it appears in. */
export function issuerTable(holdings: readonly Record<string, string | number>[]): Record<string, string>[] {
  const by = new Map<string, { names: Set<string>; isins: Set<string>; first: string; ids: Set<string> }>();
  for (const h of holdings) {
    const code = String(h.bist_code || '');
    if (!code) continue;
    const e = by.get(code) ?? { names: new Set<string>(), isins: new Set<string>(), first: String(h.available_at), ids: new Set<string>() };
    if (h.issuer) e.names.add(String(h.issuer).replace(/\s+/g, ' ').trim());
    if (h.isin) e.isins.add(String(h.isin));
    if (String(h.available_at) < e.first) e.first = String(h.available_at);
    e.ids.add(String(h.report_record_id));
    by.set(code, e);
  }
  return [...by.keys()].sort().map((code) => {
    const e = by.get(code)!;
    return {
      bist_code: code,
      issuer_names: [...e.names].sort().slice(0, 3).join(' | '),
      isins: [...e.isins].sort().join(';'),
      free_float_shares: '',
      free_float_source: NO_FREE_FLOAT,
      first_available_at: e.first,
      report_record_ids: [...e.ids].sort().join(';'),
    };
  });
}
