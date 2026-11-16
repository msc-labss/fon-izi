/**
 * Internet Archive capture index (CDX API) for TEFAS fund pages.
 *
 * TEFAS has had two page addresses per fund:
 *   old  https://www.tefas.gov.tr/FonAnaliz.aspx?FonKod={CODE}   (until about May 2026)
 *   new  https://www.tefas.gov.tr/tr/fon-detayli-analiz/{CODE}
 * The CDX index treats www and bare host as one URL.
 *
 * A capture is "usable" when its status is 200 and its archived record is
 * at least 20 KB: smaller ones seen so far are WAF rejections ("Request
 * Rejected") or bot-challenge pages, not fund pages.
 */
import type { Fetcher } from './fetch.ts';

export const CDX_ENDPOINT = 'https://web.archive.org/cdx/search/cdx';
export const MIN_USABLE_BYTES = 20_000;

export const OLD_PAGE = (code: string) => `https://www.tefas.gov.tr/FonAnaliz.aspx?FonKod=${encodeURIComponent(code)}`;
export const NEW_PAGE = (code: string) => `https://www.tefas.gov.tr/tr/fon-detayli-analiz/${encodeURIComponent(code)}`;

export interface Capture {
  timestamp: string;
  original: string;
  status: string;
  mimetype: string;
  length: number;
}

export function cdxQuery(target: string, from: string, to: string): string {
  const q = new URLSearchParams({ url: target, from, to, output: 'json', fl: 'timestamp,original,statuscode,mimetype,length' });
  return `${CDX_ENDPOINT}?${q}`;
}

/** Parses CDX JSON output (a header row, then one row per capture). */
export function parseCdx(text: string): Capture[] {
  if (text.trim() === '') return [];
  const rows = JSON.parse(text) as string[][];
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const [header, ...data] = rows;
  const at = (name: string) => header.indexOf(name);
  return data.map((r) => ({
    timestamp: r[at('timestamp')],
    original: r[at('original')],
    status: r[at('statuscode')],
    mimetype: r[at('mimetype')],
    length: Number(r[at('length')]),
  }));
}

export const isUsable = (c: Capture) => c.status === '200' && c.length >= MIN_USABLE_BYTES;

/** The raw archived body of a capture (the `id_` form, without the Wayback toolbar). */
export const rawCaptureUrl = (c: Pick<Capture, 'timestamp' | 'original'>) => `https://web.archive.org/web/${c.timestamp}id_/${c.original}`;

export async function captures(fetcher: Fetcher, target: string, from: string, to: string): Promise<Capture[]> {
  const res = await fetcher.get(cdxQuery(target, from, to), { timeoutMs: 60_000 });
  if (res.kind !== 'response') throw new Error(`CDX ${target}: ${res.kind}${res.kind === 'network-error' ? ` (${res.error})` : ''}`);
  if (res.status !== 200) throw new Error(`CDX ${target}: HTTP ${res.status}`);
  return parseCdx(res.body);
}
