/**
 * Descriptive wording (spec fund-dataset-release, "Descriptive wording").
 *
 * Release texts may not contain the evaluative terms in `wording.json`,
 * except inside a quotation that is followed by an official citation:
 *   "…" [SPK Bülten 2026/65, s. 2]   or   "…" [SPK Bulletin 2026/65, p. 2]
 * Matching is on Turkish-folded text at word boundaries.
 */
import { foldTurkish } from './text.ts';

export interface Term {
  text: string;
  stem?: boolean;
}

const CITATION = String.raw`\s*\[(?:SPK Bülten|SPK Bulletin) \d{4}/\d+, (?:s\.|p\.) \d+\]`;
const QUOTED = new RegExp(String.raw`(?:"[^"\n]*"|“[^”\n]*”)` + CITATION, 'g');

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function termPatterns(terms: readonly Term[]): { term: string; re: RegExp }[] {
  return terms.map((t) => {
    const f = foldTurkish(t.text);
    return { term: t.text, re: new RegExp(`(?<![a-z0-9])${escape(f)}${t.stem ? '[a-z0-9]*' : '(?![a-z0-9])'}`, 'g') };
  });
}

/** Problems as `<file>:<line>: "<term>"`, ignoring cited official quotations. */
export function checkWording(file: string, text: string, terms: readonly Term[]): string[] {
  const patterns = termPatterns(terms);
  const errors: string[] = [];
  text.split('\n').forEach((raw, i) => {
    const line = foldTurkish(raw.replace(QUOTED, (m) => ' '.repeat(m.length)));
    for (const { term, re } of patterns) {
      re.lastIndex = 0;
      if (re.test(line)) errors.push(`${file}:${i + 1}: "${term}"`);
    }
  });
  return errors;
}
