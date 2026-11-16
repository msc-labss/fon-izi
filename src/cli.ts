/**
 * Command line entry.
 *
 *   node --experimental-strip-types src/cli.ts check [--registry sources.json]
 *   node --experimental-strip-types src/cli.ts validate-archive [--archive archive]
 *
 * `check` validates the source registry; `validate-archive` validates every
 * record line. Both exit 1 naming each problem.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { validateArchive } from './archive.ts';
import { validateRegistry } from './registry.ts';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');

function check(registryPath: string): number {
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(registryPath, 'utf8'));
  } catch (e) {
    console.error(`${registryPath}: ${(e as Error).message}`);
    return 1;
  }
  const { sources, errors } = validateRegistry(data, { fileExists: (p) => existsSync(resolve(ROOT, p)) });
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

export function main(argv: string[]): number {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      registry: { type: 'string', default: resolve(ROOT, 'sources.json') },
      archive: { type: 'string', default: resolve(ROOT, 'archive') },
    },
  });
  switch (positionals[0]) {
    case 'check':
      return check(values.registry as string);
    case 'validate-archive':
      return validate(values.archive as string);
    default:
      console.error('usage: cli.ts check [--registry <file>] | validate-archive [--archive <dir>]');
      return 2;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = main(process.argv.slice(2));
