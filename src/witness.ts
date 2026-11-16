/**
 * Third-party witness (spec fund-data-archive, "Third-party witness").
 *
 * When `witness-list.json` has `"enabled": true`, each captured URL on its
 * list is sent to the Internet Archive's Save Page Now as an anonymous GET,
 * and the capture URL it reports is stored with the record. A failed
 * witness never fails the run. When `enabled` is false, no request goes to
 * archive.org.
 *
 * Switching it on is the founder's decision (red step); see
 * docs/sources/terms.md, "Internet Archive".
 */
import type { Fetcher } from './fetch.ts';
import type { Witness } from './record.ts';

export const SAVE_PREFIX = 'https://web.archive.org/save/';
export const SAVE_TIMEOUT_MS = 120_000;
/** Witnessing stops after this long so the day file is always written. */
export const WITNESS_BUDGET_MS = 90 * 60_000;

export interface WitnessConfig {
  enabled: boolean;
  urls: string[];
}

export function parseWitnessConfig(text: string): WitnessConfig {
  const data = JSON.parse(text) as Partial<WitnessConfig>;
  if (typeof data.enabled !== 'boolean') throw new Error('witness-list.json: "enabled" must be true or false');
  if (!Array.isArray(data.urls) || data.urls.some((u) => typeof u !== 'string' || !u.startsWith('https://')))
    throw new Error('witness-list.json: "urls" must be a list of https URLs');
  return { enabled: data.enabled, urls: data.urls };
}

/** The archive.org capture URL in a Save Page Now response header, or null. */
export function captureUrl(header: string | null): string | null {
  if (!header) return null;
  const m = /\/web\/(\d{14})\/(.+)$/.exec(header);
  return m ? `https://web.archive.org/web/${m[1]}/${m[2]}` : null;
}

export function createWitness(config: WitnessConfig, fetcher: Fetcher, { budgetMs = WITNESS_BUDGET_MS, now = () => Date.now() } = {}) {
  const listed = new Set(config.urls);
  const results = new Map<string, Witness>();
  let startedAt: number | null = null;
  async function witness(url: string): Promise<Witness> {
    if (!config.enabled) return { url: null, reason: 'off' };
    if (!listed.has(url)) return { url: null, reason: 'not-listed' };
    const known = results.get(url);
    if (known) return known;
    startedAt ??= now();
    if (now() - startedAt > budgetMs) {
      const skipped = { url: null, reason: 'not-attempted: witness time budget spent' };
      results.set(url, skipped);
      return skipped;
    }
    const res = await fetcher.get(SAVE_PREFIX + url, { timeoutMs: SAVE_TIMEOUT_MS });
    let w: Witness;
    if (res.kind === 'network-error') w = { url: null, reason: `error: ${res.error}` };
    else if (res.kind === 'robots-disallowed') w = { url: null, reason: 'error: robots-disallowed' };
    else {
      const capture = captureUrl(res.contentLocation) ?? captureUrl(res.location);
      w = capture && res.status < 400 ? { url: capture, reason: null } : { url: null, reason: `error: HTTP ${res.status}` };
    }
    results.set(url, w);
    return w;
  }
  /** Witnesses listed URLs the run did not capture (e.g. SPK bulletins). */
  async function rest(): Promise<Record<string, Witness>> {
    if (config.enabled) for (const url of config.urls) if (!results.has(url)) await witness(url);
    return Object.fromEntries(results);
  }
  return { witness, rest };
}
