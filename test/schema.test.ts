import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { EVENT_COLUMNS, TIMELINE_COLUMNS } from '../src/events.ts';
import { RESULT_COLUMNS } from '../src/flags.ts';
import { RECORD_COVERAGE_COLUMNS } from '../src/record-coverage.ts';
import { checkSchemas, checkTable, parseSchemas } from '../src/schema.ts';
import type { TableSchema } from '../src/schema.ts';
import { HOLDINGS_COLUMNS, ISSUER_COLUMNS } from '../src/tables.ts';

const ROOT = resolve(import.meta.dirname, '..');
const schemas = parseSchemas(readFileSync(join(ROOT, 'docs/schema.md'), 'utf8'));
const byName = Object.fromEntries(schemas.map((s) => [s.table, s]));
const cols = (t: string) => byName[t].columns.map((c) => c.name);

test('every table the code writes has its columns documented, in order', () => {
  assert.deepEqual(cols('event-set'), [...EVENT_COLUMNS]);
  assert.deepEqual(cols('timeline'), [...TIMELINE_COLUMNS]);
  assert.deepEqual(cols('holdings'), [...HOLDINGS_COLUMNS]);
  assert.deepEqual(cols('issuers'), [...ISSUER_COLUMNS]);
  assert.deepEqual(cols('flag-results'), [...RESULT_COLUMNS]);
  assert.deepEqual(cols('record-coverage'), [...RECORD_COVERAGE_COLUMNS]);
  assert.deepEqual(checkSchemas(schemas), []);
});

test('the committed tables match their schemas', () => {
  for (const t of ['event-set', 'timeline', 'history-coverage']) assert.deepEqual(checkTable(byName[t], readFileSync(join(ROOT, byName[t].file), 'utf8')), [], t);
});

test('undocumented column', () => {
  assert.deepEqual(checkTable(byName.timeline, `${TIMELINE_COLUMNS.join(',')},extra\n`), ['timeline: undocumented column extra']);
});

const one = (over: Record<string, unknown>): TableSchema[] => [{ table: 't', file: 'x.csv', columns: [{ name: 'c', type: 'string', unit: '', source: '', nullable: false, identifies: true, entity: 'fund', ...over } as TableSchema['columns'][number]] }];

test('person column', () => {
  assert.deepEqual(checkSchemas(one({ entity: 'person' })), ['t.c: identifies a natural person']);
});

test('unmarked identifier', () => {
  assert.deepEqual(checkSchemas(one({ entity: undefined })), ['t.c: identifying column without an entity mark']);
});
