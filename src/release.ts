/**
 * Releases (spec fund-dataset-release: "Release manifest", "Documented
 * schema", "Machine-readable table format", "Legal entities only",
 * "Licences stated").
 *
 * A release directory holds texts, tables and a `manifest.json` that lists
 * every file with its SHA-256, size and, for tables, row count; `verify`
 * recomputes them. Raw source bodies are never part of a release in v0.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseCsv } from './csv.ts';
import { checkSchemas, checkTable, parseSchemas } from './schema.ts';
import { checkWording } from './wording.ts';
import type { Term } from './wording.ts';

export interface ManifestFile {
  path: string;
  sha256: string;
  bytes: number;
  rows?: number;
  licence: string;
}

export interface Manifest {
  release: string;
  createdAt: string;
  method: { version: string; sha256: string };
  licences: { code: string; data: string };
  files: ManifestFile[];
}

export const CODE_LICENCE = 'MIT';
export const DATA_LICENCE = 'CC BY 4.0 (our derived data; source data stays under its source\'s terms, docs/sources/terms.md)';

const hash = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

export function listFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else out.push(relative(dir, p));
    }
  };
  walk(dir);
  return out.filter((p) => p !== 'manifest.json');
}

const rowsOf = (path: string, text: string) => (path.endsWith('.csv') ? Math.max(0, parseCsv(text).length - 1) : undefined);

export function buildManifest(dir: string, release: string, createdAt: string, method: { version: string; sha256: string }): Manifest {
  const files = listFiles(dir).map((path) => {
    const bytes = readFileSync(join(dir, path));
    const rows = rowsOf(path, bytes.toString('utf8'));
    const licence = path.endsWith('.csv') || path.startsWith('case-file/') ? DATA_LICENCE : path === 'LICENSE' || path === 'LICENSE-DATA' ? 'licence text' : 'CC BY 4.0';
    return { path, sha256: hash(bytes), bytes: bytes.length, ...(rows === undefined ? {} : { rows }), licence };
  });
  return { release, createdAt, method, licences: { code: CODE_LICENCE, data: DATA_LICENCE }, files };
}

/** Problems between the manifest and the files on disk. */
export function verifyRelease(dir: string): string[] {
  const m = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as Manifest;
  const errors: string[] = [];
  const listed = new Set(m.files.map((f) => f.path));
  for (const f of m.files) {
    const p = join(dir, f.path);
    if (!existsSync(p)) {
      errors.push(`${f.path}: missing`);
      continue;
    }
    const bytes = readFileSync(p);
    if (hash(bytes) !== f.sha256) errors.push(`${f.path}: SHA-256 does not match the manifest`);
    const rows = rowsOf(f.path, bytes.toString('utf8'));
    if (f.rows !== undefined && rows !== f.rows) errors.push(`${f.path}: ${rows} rows, manifest says ${f.rows}`);
  }
  for (const p of listFiles(dir)) if (!listed.has(p)) errors.push(`${p}: not in the manifest`);
  return errors;
}

const NUMBER = /^-?\d+(\.\d+)?(e[-+]?\d+)?$/i;

/** Release rules on a directory: schemas, number format, entity marks, raw bodies, licences, wording. */
export function checkRelease(dir: string, terms: readonly Term[] = []): string[] {
  const errors: string[] = [];
  const schemaPath = join(dir, 'docs/schema.md');
  if (!existsSync(schemaPath)) return ['docs/schema.md: missing'];
  const schemas = parseSchemas(readFileSync(schemaPath, 'utf8'));
  errors.push(...checkSchemas(schemas));
  const byFile = new Map(schemas.map((s) => [s.file, s]));
  for (const path of listFiles(dir)) {
    if (path.startsWith('raw/')) errors.push(`${path}: raw body from a hash-only source (raw bodies are not released in v0)`);
    if (path.endsWith('.md')) errors.push(...checkWording(path, readFileSync(join(dir, path), 'utf8'), terms));
    if (!path.endsWith('.csv')) continue;
    const schema = byFile.get(path);
    if (!schema) {
      errors.push(`${path}: no schema in docs/schema.md`);
      continue;
    }
    const text = readFileSync(join(dir, path), 'utf8');
    errors.push(...checkTable(schema, text));
    const [header, ...rows] = parseCsv(text);
    const numeric = header.map((h) => ['number', 'integer'].includes(schema.columns.find((c) => c.name === h)?.type ?? ''));
    rows.forEach((row, i) =>
      row.forEach((v, j) => {
        if (numeric[j] && v !== '' && !NUMBER.test(v)) errors.push(`${path}: row ${i + 1}, column ${header[j]}: "${v}" is not a plain number`);
      }),
    );
  }
  for (const l of ['LICENSE', 'LICENSE-DATA']) if (!existsSync(join(dir, l))) errors.push(`${l}: missing`);
  return errors;
}
