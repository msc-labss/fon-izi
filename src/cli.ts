/**
 * Command line entry.
 *
 *   node --experimental-strip-types src/cli.ts check [--registry sources.json]
 *   node --experimental-strip-types src/cli.ts validate-archive [--archive archive]
 *   node --experimental-strip-types src/cli.ts snapshot [--archive archive] [--day YYYY-MM-DD] [--limit N] [--no-witness]
 *   node --experimental-strip-types src/cli.ts validate-events [--events events/2026-fund-crisis.csv]
 *   node --experimental-strip-types src/cli.ts validate-timeline [--timeline events/2026-timeline.csv]
 *   node --experimental-strip-types src/cli.ts archive-coverage --fund-list <fon-getirileri.html> [--from 2025-01] [--to 2026-09] [--out docs/history-coverage.csv]
 *   node --experimental-strip-types src/cli.ts backfill --fund-list <fon-getirileri.html> [--archive <dir>] [--from 2025-01] [--to 2026-09] [--codes A,B] [--cache <dir>]
 *     [--retry-failures <earlier run summary> --group <new group>]   re-extract only the captures that failed
 *   node --experimental-strip-types src/cli.ts record-coverage [--archive <dir>] [--events <csv> | --codes A,B] [--from 2026-01] [--to 2026-09] --out <csv>
 *
 * `check` validates the source registry; `validate-archive` validates every
 * record line; `snapshot` captures the day's TEFAS figures;
 * `validate-events` checks that every event row cites an official source.
 * Each exits 1 naming the problem. `--limit` and `--no-witness` are for
 * local trials only.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { validateArchive } from './archive.ts';
import { runBackfill } from './backfill.ts';
import { recordCoverage } from './record-coverage.ts';
import { parseCsvRecords } from './csv.ts';
import { archiveCoverage, studyFunds } from './coverage.ts';
import { toCsv } from './csv.ts';
import { validateEvents, validateTimeline } from './events.ts';
import { createFetcher, realClock } from './fetch.ts';
import { validateRegistry } from './registry.ts';
import type { Source } from './registry.ts';
import { runSnapshot } from './snapshot.ts';
import { createWitness, parseWitnessConfig } from './witness.ts';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');

function loadRegistry(registryPath: string): { sources: Source[]; errors: string[] } {
  try {
    const data = JSON.parse(readFileSync(registryPath, 'utf8'));
    return validateRegistry(data, { fileExists: (p) => existsSync(resolve(ROOT, p)) });
  } catch (e) {
    return { sources: [], errors: [`${registryPath}: ${(e as Error).message}`] };
  }
}

function check(registryPath: string): number {
  const { sources, errors } = loadRegistry(registryPath);
  for (const e of errors) console.error(e);
  if (errors.length) return 1;
  console.log(`${registryPath}: ${sources.length} sources valid`);
  return 0;
}

function validate(archiveDir: string): number {
  const { records, errors } = validateArchive(archiveDir);
  for (const e of errors) console.error(e);
  if (errors.length) return 1;
  console.log(`${archiveDir}: ${records} records valid`);
  return 0;
}

async function snapshot(registryPath: string, archiveDir: string, day: string, limit: number | undefined, noWitness: boolean): Promise<number> {
  const { sources, errors } = loadRegistry(registryPath);
  for (const e of errors) console.error(e);
  if (errors.length) return 1;
  const fetcher = createFetcher({ hostIntervalMs: { 'web.archive.org': 5000 } });
  const listed = parseWitnessConfig(readFileSync(resolve(ROOT, 'witness-list.json'), 'utf8'));
  const config = noWitness ? { ...listed, enabled: false } : listed;
  const { witness, rest } = createWitness(config, fetcher);
  const { exitCode } = await runSnapshot({ root: archiveDir, day, sources, fetcher, clock: realClock, limit, witness, witnessRest: rest });
  return exitCode;
}

export async function main(argv: string[]): Promise<number> {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      registry: { type: 'string', default: resolve(ROOT, 'sources.json') },
      archive: { type: 'string', default: resolve(ROOT, 'archive') },
      day: { type: 'string', default: new Date().toISOString().slice(0, 10) },
      limit: { type: 'string' },
      events: { type: 'string', default: resolve(ROOT, 'events/2026-fund-crisis.csv') },
      timeline: { type: 'string', default: resolve(ROOT, 'events/2026-timeline.csv') },
      'no-witness': { type: 'boolean', default: false },
      'fund-list': { type: 'string' },
      from: { type: 'string', default: '2025-01' },
      to: { type: 'string', default: '2026-09' },
      out: { type: 'string', default: resolve(ROOT, 'docs/history-coverage.csv') },
      codes: { type: 'string' },
      cache: { type: 'string' },
      group: { type: 'string' },
      'retry-failures': { type: 'string' },
    },
  });
  switch (positionals[0]) {
    case 'check':
      return check(values.registry as string);
    case 'validate-archive':
      return validate(values.archive as string);
    case 'validate-timeline': {
      const file = values.timeline as string;
      const { rows, errors } = validateTimeline(readFileSync(file, 'utf8'));
      for (const e of errors) console.error(`${file}: ${e}`);
      if (errors.length) return 1;
      console.log(`${file}: ${rows} rows valid`);
      return 0;
    }
    case 'validate-events': {
      const file = values.events as string;
      const { rows, errors } = validateEvents(readFileSync(file, 'utf8'));
      for (const e of errors) console.error(`${file}: ${e}`);
      if (errors.length) return 1;
      console.log(`${file}: ${rows} rows valid`);
      return 0;
    }
    case 'snapshot': {
      const limit = values.limit === undefined ? undefined : Number(values.limit);
      if (limit !== undefined && !(Number.isInteger(limit) && limit > 0)) {
        console.error('--limit must be a positive integer');
        return 2;
      }
      return snapshot(values.registry as string, values.archive as string, values.day as string, limit, values['no-witness'] as boolean);
    }
    case 'archive-coverage': {
      if (!values['fund-list']) {
        console.error('--fund-list <saved /tr/fon-getirileri page> is required');
        return 2;
      }
      const funds = studyFunds(readFileSync(values['fund-list'] as string, 'utf8'), readFileSync(values.events as string, 'utf8'));
      const fetcher = createFetcher({ hostIntervalMs: { 'web.archive.org': 1500 } });
      const rows = await archiveCoverage(fetcher, funds, values.from as string, values.to as string);
      const out = values.out as string;
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, toCsv(['fund_code', 'group', 'stratum', 'month', 'old_captures', 'old_usable', 'new_captures', 'new_usable', 'first_usable'], rows as unknown as Record<string, string>[]));
      console.log(`${out}: ${rows.length} rows for ${funds.length} funds`);
      return 0;
    }
    case 'backfill': {
      const { sources, errors } = loadRegistry(values.registry as string);
      for (const e of errors) console.error(e);
      if (errors.length) return 1;
      let codes: string[];
      let only: Set<string> | undefined;
      if (values['retry-failures']) {
        const failures = JSON.parse(readFileSync(values['retry-failures'] as string, 'utf8')).failures as { code: string; capture: string }[];
        only = new Set(failures.map((f) => `${f.code}|${f.capture}`));
        codes = [...new Set(failures.map((f) => f.code))].sort();
        if (!values.group) {
          console.error('--retry-failures needs --group (a retry pass writes into its own group)');
          return 2;
        }
      } else if (values.codes) codes = (values.codes as string).split(',').filter(Boolean);
      else if (values['fund-list']) codes = studyFunds(readFileSync(values['fund-list'] as string, 'utf8'), readFileSync(values.events as string, 'utf8')).map((f) => f.code);
      else {
        console.error('--codes or --fund-list is required');
        return 2;
      }
      const fetcher = createFetcher({ hostIntervalMs: { 'web.archive.org': 2000 } });
      const { exitCode } = await runBackfill({ root: values.archive as string, codes, from: (values.from as string).replace('-', ''), to: (values.to as string).replace('-', ''), sources, fetcher, clock: realClock, cacheDir: values.cache as string | undefined, group: values.group as string | undefined, only });
      return exitCode;
    }
    case 'record-coverage': {
      const codes = values.codes ? (values.codes as string).split(',').filter(Boolean) : [...new Set(parseCsvRecords(readFileSync(values.events as string, 'utf8')).records.map((r) => r.fund_code))];
      const rows = recordCoverage(values.archive as string, codes, values.from as string, values.to as string);
      const out = values.out as string;
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, toCsv(['fund_code', 'field', 'month', 'records'], rows as unknown as Record<string, string>[]));
      console.log(`${out}: ${rows.length} rows for ${codes.length} funds`);
      return 0;
    }
    default:
      console.error('usage: cli.ts check | validate-archive | validate-events | snapshot | archive-coverage | backfill | record-coverage (see the header of src/cli.ts)');
      return 2;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = await main(process.argv.slice(2));
