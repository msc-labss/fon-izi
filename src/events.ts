/**
 * Event set (spec fund-flag-backtest, "Event set cites official sources").
 *
 * One row per fund and event. Every row cites an official source: an
 * https URL plus a page or a bulletin number.
 */
import { parseCsvRecords } from './csv.ts';

export const EVENT_COLUMNS = [
  'fund_code',
  'list_number',
  'fund_title',
  'manager',
  'event',
  'event_date',
  'source_published',
  'source_url',
  'source_bulletin',
  'source_page',
  'match',
] as const;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Problems in an event-set CSV; each names its row (1 = first data row). */
export function validateEvents(text: string): { rows: number; errors: string[] } {
  const { header, records } = parseCsvRecords(text);
  const errors: string[] = [];
  const missing = EVENT_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) return { rows: 0, errors: [`header: missing ${missing.join(', ')}`] };
  const seen = new Set<string>();
  records.forEach((r, i) => {
    const where = `row ${i + 1} (${r.fund_code || 'no code'}, ${r.event || 'no event'})`;
    if (!/^[A-Z0-9]{2,4}$/.test(r.fund_code)) errors.push(`${where}: fund_code must be a TEFAS code`);
    if (!r.event) errors.push(`${where}: event is empty`);
    if (!DAY.test(r.event_date)) errors.push(`${where}: event_date must be YYYY-MM-DD`);
    let url: URL | null = null;
    try {
      url = new URL(r.source_url);
    } catch {
      // reported below
    }
    if (!url || url.protocol !== 'https:') errors.push(`${where}: no source citation (source_url must be an https URL)`);
    if (!r.source_page && !r.source_bulletin) errors.push(`${where}: no source citation (needs source_page or source_bulletin)`);
    if (r.source_page && !/^\d+$/.test(r.source_page)) errors.push(`${where}: source_page must be a number`);
    const key = `${r.fund_code}|${r.event}`;
    if (seen.has(key)) errors.push(`${where}: duplicate fund and event`);
    seen.add(key);
  });
  return { rows: records.length, errors };
}
