/**
 * METHOD.md parsing (spec fund-risk-metrics, "Flags are defined in the
 * method document"). Each flag is one fenced block with the info string
 * `json flag`; the code reads thresholds from these blocks only.
 */
import { sha256 } from './fetch.ts';

export interface Threshold {
  op: '>=' | '>' | '<=' | '<';
  value: number;
}

export interface FlagDefinition {
  id: string;
  version: string;
  measure: string;
  formula: string;
  inputs: string[];
  window_days: number;
  threshold: Threshold;
  [extra: string]: unknown;
}

export interface Method {
  version: string;
  sha256: string;
  flags: FlagDefinition[];
}

const OPS = ['>=', '>', '<=', '<'];

export function parseMethod(text: string): Method {
  const head = /^# Method (v\d+)\b/m.exec(text);
  if (!head) throw new Error('METHOD.md: no "# Method vN" heading');
  const flags: FlagDefinition[] = [];
  for (const m of text.matchAll(/```json flag\n([\s\S]*?)```/g)) {
    const f = JSON.parse(m[1]) as FlagDefinition;
    const where = `METHOD.md flag ${f.id ?? '(no id)'}`;
    if (typeof f.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(f.id)) throw new Error(`${where}: bad id`);
    if (f.version !== head[1]) throw new Error(`${where}: version ${f.version} is not ${head[1]}`);
    for (const k of ['measure', 'formula'] as const) if (typeof f[k] !== 'string' || !f[k]) throw new Error(`${where}: ${k} missing`);
    if (!Array.isArray(f.inputs) || f.inputs.length === 0) throw new Error(`${where}: inputs missing`);
    if (!Number.isInteger(f.window_days) || f.window_days < 0) throw new Error(`${where}: window_days must be a whole number`);
    if (!f.threshold || !OPS.includes(f.threshold.op) || typeof f.threshold.value !== 'number') throw new Error(`${where}: threshold must be {op, value}`);
    if (flags.some((g) => g.id === f.id)) throw new Error(`${where}: defined twice`);
    flags.push(f);
  }
  return { version: head[1], sha256: sha256(text), flags };
}

export function crosses(value: number, t: Threshold): boolean {
  switch (t.op) {
    case '>=':
      return value >= t.value;
    case '>':
      return value > t.value;
    case '<=':
      return value <= t.value;
    case '<':
      return value < t.value;
  }
}

/**
 * Frozen versions (spec fund-flag-backtest, "Frozen method version"):
 * `method-versions.json` maps each method version to the SHA-256 of its
 * METHOD.md. A document whose version is recorded must have that hash; a
 * changed document needs a new version.
 */
export function checkFrozen(method: Method, versions: Record<string, string>): string[] {
  const recorded = versions[method.version];
  if (!recorded) return [`METHOD.md: version ${method.version} is not recorded in method-versions.json`];
  if (recorded !== method.sha256) return [`METHOD.md: content changed but version is still ${method.version} (recorded ${recorded.slice(0, 12)}, now ${method.sha256.slice(0, 12)})`];
  return [];
}
