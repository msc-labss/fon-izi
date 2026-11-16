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
