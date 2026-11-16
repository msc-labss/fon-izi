/**
 * CSV per RFC 4180: comma separator, double-quote quoting, CRLF or LF line
 * ends. Enough for the repository's own tables; no dependency.
 */

/** Parses CSV text into rows of strings. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;
  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };
  while (i < text.length) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i += 2;
        continue;
      }
      if (c === '"') quoted = false;
      else field += c;
      i++;
      continue;
    }
    if (c === '"' && field === '') quoted = true;
    else if (c === ',') endField();
    else if (c === '\n') endRow();
    else if (c === '\r' && text[i + 1] === '\n') {
      endRow();
      i++;
    } else field += c;
    i++;
  }
  if (quoted) throw new Error('CSV: unterminated quoted field');
  if (field !== '' || row.length) endRow();
  return rows;
}

/** Parses CSV with a header row into records keyed by column name. */
export function parseCsvRecords(text: string): { header: string[]; records: Record<string, string>[] } {
  const [header, ...rows] = parseCsv(text);
  if (!header) return { header: [], records: [] };
  return { header, records: rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? '']))) };
}

const quote = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** Writes rows as CSV with LF line ends and a final newline. */
export function toCsv(header: readonly string[], records: readonly Record<string, string | number>[]): string {
  return [header, ...records.map((r) => header.map((h) => String(r[h] ?? '')))].map((row) => row.map(quote).join(',')).join('\n') + '\n';
}
