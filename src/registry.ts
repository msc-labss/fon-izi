/**
 * Source registry (spec fund-data-archive, "Source registry").
 *
 * Every source the archive captures is listed in `sources.json` with its URL
 * prefix, capture cadence, the fields extracted and a raw-body policy. An
 * entry without a terms reference is `hash-only`; `publish` needs one.
 *
 * Pure module: file access is injected so tests need no disk.
 */

export type RawPolicy = 'publish' | 'hash-only';
export type Cadence = 'daily' | 'weekly' | 'monthly' | 'once';

export interface Source {
  id: string;
  urlPrefix: string;
  cadence: Cadence;
  fields: string[];
  rawPolicy: RawPolicy;
  termsRef?: string;
  note?: string;
}

const CADENCES: readonly string[] = ['daily', 'weekly', 'monthly', 'once'];
const POLICIES: readonly string[] = ['publish', 'hash-only'];
const KEYS: readonly string[] = ['id', 'urlPrefix', 'cadence', 'fields', 'rawPolicy', 'termsRef', 'note'];
const ID = /^[a-z0-9][a-z0-9-]*$/;

export interface ValidateOptions {
  /** Returns whether a repository-relative file exists; used to check `termsRef`. */
  fileExists?: (path: string) => boolean;
}

/** Validates the parsed `sources.json`. Errors name the entry. */
export function validateRegistry(data: unknown, { fileExists }: ValidateOptions = {}): { sources: Source[]; errors: string[] } {
  const list = (data as { sources?: unknown } | null)?.sources;
  if (!Array.isArray(list) || list.length === 0) return { sources: [], errors: ['sources.json: "sources" must be a non-empty list'] };
  const errors: string[] = [];
  const sources: Source[] = [];
  const seen = new Set<string>();
  for (const [index, raw] of list.entries()) {
    const entry = (raw ?? {}) as Record<string, unknown>;
    const name = typeof entry.id === 'string' ? entry.id : `#${index}`;
    const problems: string[] = [];
    for (const key of Object.keys(entry)) if (!KEYS.includes(key)) problems.push(`unknown field "${key}"`);
    if (typeof entry.id !== 'string' || !ID.test(entry.id)) problems.push('id must be lower-case letters, digits and hyphens');
    else if (seen.has(entry.id)) problems.push('duplicate id');
    else seen.add(entry.id);
    let url: URL | null = null;
    try {
      url = new URL(String(entry.urlPrefix));
    } catch {
      problems.push('urlPrefix must be an absolute URL');
    }
    if (url && url.protocol !== 'https:') problems.push('urlPrefix must use https');
    if (!CADENCES.includes(entry.cadence as string)) problems.push(`cadence must be one of ${CADENCES.join(', ')}`);
    if (!Array.isArray(entry.fields) || entry.fields.some((f) => typeof f !== 'string' || f === '')) problems.push('fields must be a list of names');
    const rawPolicy = entry.rawPolicy ?? 'hash-only';
    if (!POLICIES.includes(rawPolicy as string)) problems.push('rawPolicy must be "publish" or "hash-only"');
    const termsRef = entry.termsRef;
    if (termsRef !== undefined && (typeof termsRef !== 'string' || termsRef.trim() === '')) problems.push('termsRef must be a non-empty string');
    if (rawPolicy === 'publish' && !termsRef) problems.push('rawPolicy "publish" needs a termsRef');
    if (typeof termsRef === 'string' && termsRef.trim() !== '' && fileExists) {
      const file = termsRef.split('#')[0];
      if (!fileExists(file)) problems.push(`termsRef file not found: ${file}`);
    }
    if (problems.length) errors.push(...problems.map((p) => `${name}: ${p}`));
    else sources.push({ ...(entry as unknown as Source), rawPolicy: rawPolicy as RawPolicy });
  }
  return { sources, errors };
}

/** True when `url` starts with `prefix` at a path boundary. */
function matchesPrefix(url: string, prefix: string): boolean {
  if (!url.startsWith(prefix)) return false;
  const rest = url.slice(prefix.length);
  return rest === '' || prefix.endsWith('/') || /^[/?#]/.test(rest);
}

/** The registry entry with the longest prefix matching `url`, or null. */
export function matchSource(url: string, sources: readonly Source[]): Source | null {
  let best: Source | null = null;
  for (const s of sources) if (matchesPrefix(url, s.urlPrefix) && (!best || s.urlPrefix.length > best.urlPrefix.length)) best = s;
  return best;
}

/** Like `matchSource`, but an unregistered URL is an error that names it. */
export function requireSource(url: string, sources: readonly Source[]): Source {
  const source = matchSource(url, sources);
  if (!source) throw new Error(`unregistered source: ${url}`);
  return source;
}
