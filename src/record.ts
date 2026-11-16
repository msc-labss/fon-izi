/**
 * Archive records (spec fund-data-archive: "Provenance on every record",
 * "Publication time kept apart from capture time", "Append-only archive").
 *
 * A record is one JSON line. Its `id` is the SHA-256 of the canonical JSON
 * of the record without `id` (keys sorted at every depth, no spaces), so
 * anyone can recompute it.
 */
import { sha256 } from './fetch.ts';

export type Origin = 'snapshot' | 'backfill';

export interface Witness {
  /** archive.org capture URL, or null when none was made. */
  url: string | null;
  /** Why there is no witness: `off`, `not-listed`, `error: …`. */
  reason: string | null;
}

export interface ArchiveRecord {
  id: string;
  source: string;
  kind: string;
  sourceUrl: string;
  capturedAt: string;
  /** The source's own publication time; null when the source states none. Never the capture time. */
  publishedAt: string | null;
  httpStatus: number;
  sha256: string;
  toolVersion: string;
  origin: Origin;
  witness: Witness;
  /** Record id this record corrects, for corrections only. */
  corrects?: string;
  data: Record<string, unknown>;
}

export const PROVENANCE_FIELDS = ['source', 'kind', 'sourceUrl', 'capturedAt', 'publishedAt', 'httpStatus', 'sha256', 'toolVersion', 'origin', 'witness'] as const;

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const HEX64 = /^[0-9a-f]{64}$/;

/** JSON with keys sorted at every depth and no whitespace. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Builds a record and its line. `publishedAt` comes only from the source. */
export function makeRecord(fields: Omit<ArchiveRecord, 'id'>): { record: ArchiveRecord; line: string } {
  const body = canonicalJson(fields);
  const id = sha256(body);
  const line = `{"id":${JSON.stringify(id)},${body.slice(1)}`;
  return { record: { id, ...fields }, line };
}

/** Problems with one parsed record line; empty when valid. */
export function validateRecord(rec: unknown): string[] {
  const r = (rec ?? {}) as Record<string, unknown>;
  const problems: string[] = [];
  for (const f of PROVENANCE_FIELDS) if (!(f in r)) problems.push(`missing ${f}`);
  if (!('data' in r) || typeof r.data !== 'object' || r.data === null) problems.push('missing data');
  if (problems.length) return problems;
  if (typeof r.source !== 'string' || r.source === '') problems.push('source must be a non-empty string');
  if (typeof r.kind !== 'string' || r.kind === '') problems.push('kind must be a non-empty string');
  try {
    new URL(String(r.sourceUrl));
  } catch {
    problems.push('sourceUrl must be an absolute URL');
  }
  if (typeof r.capturedAt !== 'string' || !ISO_UTC.test(r.capturedAt)) problems.push('capturedAt must be ISO 8601 UTC');
  if (r.publishedAt !== null && (typeof r.publishedAt !== 'string' || r.publishedAt === '')) problems.push('publishedAt must be null or a time');
  if (!Number.isInteger(r.httpStatus)) problems.push('httpStatus must be an integer');
  if (typeof r.sha256 !== 'string' || !HEX64.test(r.sha256)) problems.push('sha256 must be 64 hex characters');
  if (typeof r.toolVersion !== 'string' || r.toolVersion === '') problems.push('toolVersion must be a non-empty string');
  if (r.origin !== 'snapshot' && r.origin !== 'backfill') problems.push('origin must be snapshot or backfill');
  const w = r.witness as Record<string, unknown> | null;
  if (!w || typeof w !== 'object' || !('url' in w) || !('reason' in w)) problems.push('witness must have url and reason');
  else if (w.url === null && (typeof w.reason !== 'string' || w.reason === '')) problems.push('witness without url needs a reason');
  if ('corrects' in r && (typeof r.corrects !== 'string' || !HEX64.test(r.corrects))) problems.push('corrects must be a record id');
  if (typeof r.id !== 'string' || !HEX64.test(r.id)) problems.push('missing id');
  else {
    const { id, ...rest } = r;
    if (sha256(canonicalJson(rest)) !== id) problems.push('id does not match content');
  }
  return problems;
}
