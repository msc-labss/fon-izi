/**
 * Command line entry.
 *
 *   node --experimental-strip-types src/cli.ts check [--registry sources.json]
 *   node --experimental-strip-types src/cli.ts validate-archive [--archive archive]
 *   node --experimental-strip-types src/cli.ts snapshot [--archive archive] [--day YYYY-MM-DD] [--limit N]
 *   node --experimental-strip-types src/cli.ts validate-events [--events events/2026-fund-crisis.csv]
 *
 * `check` validates the source registry; `validate-archive` validates every
 * record line; `snapshot` captures the day's TEFAS figures;
 * `validate-events` checks that every event row cites an official source.
 * Each exits 1 naming the problem. `--limit` is for local trials only.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { validateArchive } from './archive.ts';
import { validateEvents } from './events.ts';
import { createFetcher, realClock } from './fetch.ts';
import { validateRegistry } from './registry.ts';
import type { Source } from './registry.ts';
import { runSnapshot } from './snapshot.ts';

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

async function snapshot(registryPath: string, archiveDir: string, day: string, limit: number | undefined): Promise<number> {
  const { sources, errors } = loadRegistry(registryPath);
  for (const e of errors) console.error(e);
  if (errors.length) return 1;
  const { exitCode } = await runSnapshot({ root: archiveDir, day, sources, fetcher: createFetcher(), clock: realClock, limit });
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
    },
  });
  switch (positionals[0]) {
    case 'check':
      return check(values.registry as string);
    case 'validate-archive':
      return validate(values.archive as string);
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
      return snapshot(values.registry as string, values.archive as string, values.day as string, limit);
    }
    default:
      console.error('usage: cli.ts check | validate-archive | snapshot [--archive <dir>] [--day YYYY-MM-DD] [--limit N]');
      return 2;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = await main(process.argv.slice(2));
