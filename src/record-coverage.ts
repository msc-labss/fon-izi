/**
 * Coverage of archived records (spec fund-data-archive, "Coverage report").
 *
 * For a list of fund codes and a month range: one row per fund, field and
 * month with the number of records that hold a value for that field,
 * counted by capture month. `prices` counts daily price points from
 * `price-history` records by the month the price is for (non-zero prices).
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { readLines } from './archive.ts';
import { months } from './coverage.ts';
import type { ArchiveRecord } from './record.ts';

export const COVERAGE_FIELDS = ['unitPrice', 'totalValue', 'shareCount', 'investorCount', 'allocation', 'riskValue', 'category', 'prices'] as const;

export const RECORD_COVERAGE_COLUMNS = ['fund_code', 'field', 'month', 'records'] as const;

export interface RecordCoverageRow {
  fund_code: string;
  field: string;
  month: string;
  records: number;
}

function* dayFiles(dir: string): Generator<string> {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== 'raw' && name !== 'corrections') yield* dayFiles(p);
    } else if (name.endsWith('.jsonl.gz') || name.endsWith('.jsonl')) yield p;
  }
}

const has = (v: unknown) => v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0);

export function recordCoverage(root: string, codes: readonly string[], from: string, to: string): RecordCoverageRow[] {
  const monthList = months(from, to);
  const wanted = new Set(codes);
  const counts = new Map<string, number>(); // code|field|month
  const bump = (code: string, field: string, month: string) => counts.set(`${code}|${field}|${month}`, (counts.get(`${code}|${field}|${month}`) ?? 0) + 1);
  for (const file of dayFiles(root)) {
    for (const line of readLines(file)) {
      if (!line) continue;
      const rec = JSON.parse(line) as ArchiveRecord;
      const data = rec.data as Record<string, unknown>;
      const code = data.code as string;
      if (!wanted.has(code)) continue;
      if (rec.kind === 'fund') {
        const month = rec.capturedAt.slice(0, 7);
        for (const field of COVERAGE_FIELDS) if (field !== 'prices' && has(data[field])) bump(code, field, month);
      } else if (rec.kind === 'price-history') {
        for (const [date, price] of data.prices as [string, number][]) if (price) bump(code, 'prices', date.slice(0, 7));
      }
    }
  }
  const rows: RecordCoverageRow[] = [];
  for (const code of [...wanted].sort())
    for (const field of COVERAGE_FIELDS) for (const month of monthList) rows.push({ fund_code: code, field, month, records: counts.get(`${code}|${field}|${month}`) ?? 0 });
  return rows;
}
