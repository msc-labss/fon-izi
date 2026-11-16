/**
 * Table schemas (spec fund-dataset-release: "Documented schema", "Legal
 * entities only"). `docs/schema.md` holds one fenced block per table with
 * the info string `json schema`.
 */
import { parseCsv } from './csv.ts';

export const ENTITIES = ['fund', 'manager', 'issuer'] as const;

export interface ColumnSchema {
  name: string;
  type: 'string' | 'number' | 'integer' | 'boolean' | 'date' | 'datetime' | 'list';
  unit: string;
  source: string;
  nullable: boolean;
  /** True when the column names or codes an entity. */
  identifies: boolean;
  /** Which kind of entity an identifying column names. */
  entity?: string;
}

export interface TableSchema {
  table: string;
  file: string;
  columns: ColumnSchema[];
}

export function parseSchemas(text: string): TableSchema[] {
  return [...text.matchAll(/```json schema\n([\s\S]*?)```/g)].map((m) => JSON.parse(m[1]) as TableSchema);
}

/** Problems in the schema documents themselves (entity marks). */
export function checkSchemas(schemas: readonly TableSchema[]): string[] {
  const errors: string[] = [];
  for (const s of schemas)
    for (const c of s.columns) {
      if (c.entity === 'person') errors.push(`${s.table}.${c.name}: identifies a natural person`);
      else if (c.identifies && !c.entity) errors.push(`${s.table}.${c.name}: identifying column without an entity mark`);
      else if (c.entity && !(ENTITIES as readonly string[]).includes(c.entity)) errors.push(`${s.table}.${c.name}: unknown entity ${c.entity}`);
    }
  return errors;
}

/** Columns of a CSV that its schema does not list. */
export function checkTable(schema: TableSchema, csv: string): string[] {
  const [header] = parseCsv(csv);
  const known = new Set(schema.columns.map((c) => c.name));
  return (header ?? []).filter((h) => !known.has(h)).map((h) => `${schema.table}: undocumented column ${h}`);
}
