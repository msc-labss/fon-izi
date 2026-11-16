/**
 * Archive files (design D4).
 *
 *   archive/<group>/<YYYY>/<MM>/<YYYY-MM-DD>.jsonl       one record per line
 *   archive/<group>/<YYYY>/<MM>/<YYYY-MM-DD>.run.json    run summary (not a record)
 *   archive/corrections/<YYYY-MM-DD>.jsonl              correction records
 *   archive/raw/<aa>/<sha256>                           raw bodies, `publish` sources only
 *
 * Every write creates a new file and refuses an existing one: the archive
 * is append-only. Raw bodies are content-addressed, so an existing file with
 * that hash already holds the same bytes.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { validateRecord } from './record.ts';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function dayPath(root: string, group: string, day: string, suffix = '.jsonl'): string {
  if (!DAY.test(day)) throw new Error(`bad day: ${day}`);
  return join(root, group, day.slice(0, 4), day.slice(5, 7), `${day}${suffix}`);
}

/** Creates `path` with `content`; throws when it already exists. */
export function writeNew(path: string, content: string | Uint8Array): void {
  mkdirSync(dirname(path), { recursive: true });
  try {
    writeFileSync(path, content, { flag: 'wx' });
  } catch (e) {
    if ((e as { code?: string }).code === 'EEXIST') throw new Error(`refusing to overwrite ${path}`);
    throw e;
  }
}

export function writeDay(root: string, group: string, day: string, lines: readonly string[]): string {
  const path = dayPath(root, group, day);
  writeNew(path, lines.map((l) => `${l}\n`).join(''));
  return path;
}

export function writeCorrections(root: string, day: string, lines: readonly string[]): string {
  return writeDay(root, 'corrections', day, lines);
}

/** Stores a raw body under its hash; a second write of the same hash is a no-op. */
export function writeRaw(root: string, hash: string, body: string | Uint8Array): string {
  const path = join(root, 'raw', hash.slice(0, 2), hash);
  if (!existsSync(path)) writeNew(path, body);
  return path;
}

function* jsonlFiles(dir: string): Generator<string> {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== 'raw') yield* jsonlFiles(p);
    } else if (name.endsWith('.jsonl')) yield p;
  }
}

/** Validates every record line under `root`. Errors read `<file>:<line> <id>: <problem>`. */
export function validateArchive(root: string): { records: number; errors: string[] } {
  const errors: string[] = [];
  let records = 0;
  for (const file of jsonlFiles(root)) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (line === '') return;
      records++;
      const where = `${relative(root, file)}:${i + 1}`;
      let rec: unknown;
      try {
        rec = JSON.parse(line);
      } catch {
        errors.push(`${where}: not JSON`);
        return;
      }
      const id = typeof (rec as { id?: unknown }).id === 'string' ? (rec as { id: string }).id.slice(0, 12) : '(no id)';
      for (const p of validateRecord(rec)) errors.push(`${where} ${id}: ${p}`);
    });
  }
  return { records, errors };
}
