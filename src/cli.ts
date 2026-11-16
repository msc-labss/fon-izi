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
 *   node --experimental-strip-types src/cli.ts import-dump-holdings --dump <clone of the dump> --archive <dir>
 *   node --experimental-strip-types src/cli.ts import-dump-daily --dump <clone of the dump> --archive <dir>
 *   node --experimental-strip-types src/cli.ts build-tables --archive <dir> --tables <dir>
 *   node --experimental-strip-types src/cli.ts flags --archive <dir> --day YYYY-MM-DD [--codes A,B | --events <csv>] --out <csv>
 *   node --experimental-strip-types src/cli.ts validate-method [--method METHOD.md]
 *   node --experimental-strip-types src/cli.ts check-wording [files…]   (default: the repository's release texts)
 *   node --experimental-strip-types src/cli.ts build-figures --reports <dir> --out <figures.json>
 *   node --experimental-strip-types src/cli.ts render-case-file --figures <figures.json> --out <dir>
 *   node --experimental-strip-types src/cli.ts backtest --archive <dir> --fund-list <fon-getirileri.html> --reports <dir> [--events <csv>]
 *   node --experimental-strip-types src/cli.ts record-coverage [--archive <dir>] [--events <csv> | --codes A,B] [--from 2026-01] [--to 2026-09] --out <csv>
 *
 * `check` validates the source registry; `validate-archive` validates every
 * record line; `snapshot` captures the day's TEFAS figures;
 * `validate-events` checks that every event row cites an official source.
 * Each exits 1 naming the problem. `--limit` and `--no-witness` are for
 * local trials only.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { validateArchive } from './archive.ts';
import { runBackfill } from './backfill.ts';
import { DAILY_GROUP, dailyRecords, fileVersions, holdingsRecords, HOLDINGS_GROUP, readAt } from './dump-import.ts';
import { buildIndex, evaluate, RESULT_COLUMNS } from './flags.ts';
import { checkFrozen, parseMethod } from './method.ts';
import { reportSection, runBacktest } from './backtest.ts';
import { sha256 } from './fetch.ts';
import { extractFundList } from './tefas.ts';
import { checkWording } from './wording.ts';
import { buildFigures } from './case-figures.ts';
import { handTypedNumbers, render } from './figures.ts';
import { archiveRecords, HOLDINGS_COLUMNS, holdingsTable, ISSUER_COLUMNS, issuerTable } from './tables.ts';
import { dayPath, writeDay } from './archive.ts';
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

/** The texts a release carries (spec: README, method, schema documents, case file). */
function releaseTexts(): string[] {
  const dirTexts = (d: string, ext: RegExp) => (existsSync(join(ROOT, d)) ? readdirSync(join(ROOT, d)).filter((f) => ext.test(f)).map((f) => `${d}/${f}`) : []);
  return ['README.md', 'METHOD.md', 'docs/schema.md', 'events/README.md', ...dirTexts('docs/sources', /\.md$/), 'docs/history-spike.md', ...dirTexts('case-file', /\.(md|tmpl)$/)].filter((f) => existsSync(join(ROOT, f)));
}

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
      method: { type: 'string', default: resolve(ROOT, 'METHOD.md') },
      reports: { type: 'string' },
      figures: { type: 'string' },
      'fund-list': { type: 'string' },
      from: { type: 'string', default: '2025-01' },
      to: { type: 'string', default: '2026-09' },
      out: { type: 'string', default: resolve(ROOT, 'docs/history-coverage.csv') },
      codes: { type: 'string' },
      cache: { type: 'string' },
      group: { type: 'string' },
      'retry-failures': { type: 'string' },
      dump: { type: 'string' },
      tables: { type: 'string' },
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
    case 'import-dump-holdings': {
      const repo = values.dump as string | undefined;
      if (!repo) {
        console.error('--dump <clone of the dump> is required');
        return 2;
      }
      const files = readdirSync(join(repo, 'arsiv')).filter((f) => /^fon_icerik_\d{4}-\d{2}\.csv\.gz$/.test(f)).sort();
      let written = 0;
      let skipped = 0;
      for (const f of files) {
        const path = `arsiv/${f}`;
        const byDay = holdingsRecords(path, fileVersions(repo, path), readAt(repo, path));
        for (const [day, lines] of [...byDay].sort()) {
          if (existsSync(dayPath(values.archive as string, HOLDINGS_GROUP, day))) {
            // A second file can reach the same capture day: keep it in its own day file.
            const alt = `${HOLDINGS_GROUP}-${f.slice(11, 18)}`;
            if (existsSync(dayPath(values.archive as string, alt, day))) {
              skipped++;
              continue;
            }
            writeDay(values.archive as string, alt, day, [...lines].sort());
          } else writeDay(values.archive as string, HOLDINGS_GROUP, day, [...lines].sort());
          written += lines.length;
        }
      }
      console.log(`import-dump-holdings: ${written} holdings reports written, ${skipped} day files skipped (already present)`);
      return 0;
    }
    case 'import-dump-daily': {
      const repo = values.dump as string | undefined;
      if (!repo) {
        console.error('--dump <clone of the dump> is required');
        return 2;
      }
      const byDay = new Map<string, string[]>();
      for (const f of readdirSync(join(repo, 'arsiv')).sort()) {
        const kind = /^tefas_\d{4}-\d{2}\.csv\.gz$/.test(f) ? 'daily-figures' : /^tefas_dagilim_\d{4}-\d{2}\.csv\.gz$/.test(f) ? 'daily-allocation' : null;
        if (!kind) continue;
        const path = `arsiv/${f}`;
        dailyRecords(kind, path, fileVersions(repo, path), readAt(repo, path), byDay);
      }
      let written = 0;
      let skipped = 0;
      for (const [day, lines] of [...byDay].sort()) {
        if (existsSync(dayPath(values.archive as string, DAILY_GROUP, day))) {
          skipped++;
          continue;
        }
        writeDay(values.archive as string, DAILY_GROUP, day, [...lines].sort());
        written += lines.length;
      }
      console.log(`import-dump-daily: ${written} daily records written, ${skipped} capture days skipped (already present)`);
      return 0;
    }
    case 'build-figures': {
      const dir = values.reports as string | undefined;
      if (!dir || !values.out) {
        console.error('--reports <dir> and --out <figures.json> are required');
        return 2;
      }
      const latest = (re: RegExp) => readdirSync(dir).filter((f) => re.test(f)).sort().at(-1);
      const runFile = latest(/^backtest-.*Z\.json$/);
      const leadFile = latest(/^backtest-.*Z-leadtimes\.csv$/);
      if (!runFile || !leadFile) {
        console.error(`${dir}: no backtest run`);
        return 1;
      }
      const figures = buildFigures({
        run: JSON.parse(readFileSync(join(dir, runFile), 'utf8')),
        runFile: `reports/${runFile}`,
        leadTimes: parseCsvRecords(readFileSync(join(dir, leadFile), 'utf8')).records as never,
        leadTimesFile: `reports/${leadFile}`,
        eventSet: parseCsvRecords(readFileSync(values.events as string, 'utf8')).records as never,
        timeline: parseCsvRecords(readFileSync(values.timeline as string, 'utf8')).records as never,
        method: parseMethod(readFileSync(values.method as string, 'utf8')),
      });
      mkdirSync(dirname(values.out as string), { recursive: true });
      writeFileSync(values.out as string, `${JSON.stringify(figures, null, 2)}\n`);
      console.log(`build-figures: ${Object.keys(figures).length} figures from ${runFile}`);
      return 0;
    }
    case 'render-case-file': {
      const figures = JSON.parse(readFileSync(values.figures as string, 'utf8'));
      const terms = JSON.parse(readFileSync(resolve(ROOT, 'wording.json'), 'utf8')).terms;
      const out = values.out as string;
      mkdirSync(out, { recursive: true });
      const errors: string[] = [];
      for (const lang of ['en', 'tr'] as const) {
        const tmplPath = `case-file/${lang}.md.tmpl`;
        const tmpl = readFileSync(join(ROOT, tmplPath), 'utf8');
        errors.push(...handTypedNumbers(tmplPath, tmpl), ...checkWording(tmplPath, tmpl, terms));
        const text = render(tmpl, figures, lang);
        errors.push(...checkWording(`${lang}.md`, text, terms));
        writeFileSync(join(out, `${lang}.md`), text);
      }
      for (const e of errors) console.error(e);
      if (errors.length) return 1;
      console.log(`render-case-file: en.md and tr.md written to ${out}; numbers and wording checked`);
      return 0;
    }
    case 'check-wording': {
      const terms = JSON.parse(readFileSync(resolve(ROOT, 'wording.json'), 'utf8')).terms;
      const files = positionals.length > 1 ? positionals.slice(1) : releaseTexts();
      const errors = files.flatMap((f) => checkWording(relative(ROOT, resolve(f)), readFileSync(resolve(ROOT, f), 'utf8'), terms));
      for (const e of errors) console.error(e);
      if (errors.length) return 1;
      console.log(`check-wording: ${files.length} files clean`);
      return 0;
    }
    case 'validate-method': {
      const file = values.method as string;
      const errors = checkFrozen(parseMethod(readFileSync(file, 'utf8')), JSON.parse(readFileSync(resolve(ROOT, 'method-versions.json'), 'utf8')));
      for (const e of errors) console.error(`${file}: ${e}`);
      if (errors.length) return 1;
      console.log(`${file}: frozen version matches`);
      return 0;
    }
    case 'backtest': {
      const method = parseMethod(readFileSync(values.method as string, 'utf8'));
      const frozen = checkFrozen(method, JSON.parse(readFileSync(resolve(ROOT, 'method-versions.json'), 'utf8')));
      if (frozen.length) {
        for (const e of frozen) console.error(e);
        return 1;
      }
      if (!values.reports || !values['fund-list']) {
        console.error('--reports <dir> and --fund-list <saved /tr/fon-getirileri page> are required');
        return 2;
      }
      const records = [...archiveRecords(values.archive as string)];
      const archiveDigest = sha256(records.map((r) => r.id).sort().join('\n'));
      const ix = buildIndex(records);
      const events = parseCsvRecords(readFileSync(values.events as string, 'utf8')).records.map((r) => ({ code: r.fund_code, event: r.event, date: r.event_date }));
      const eventCodes = new Set(events.map((e) => e.code));
      const list = extractFundList(readFileSync(values['fund-list'] as string, 'utf8'));
      const types = new Set(list.filter((e) => eventCodes.has(e.code)).map((e) => String(e.umbrellaType)));
      const controls = list.filter((e) => !eventCodes.has(e.code) && types.has(String(e.umbrellaType)) && ix.price.has(e.code)).map((e) => e.code).sort();
      const runAt = new Date().toISOString();
      const run = runBacktest({ ix, method, events, controls, runAt, archiveDigest, log: (m) => console.error(m) });
      const dir = values.reports as string;
      mkdirSync(dir, { recursive: true });
      const report = join(dir, 'backtest.md');
      if (!existsSync(report)) writeFileSync(report, '# Backtest runs\n\nEvery run is appended; earlier runs are never removed.\n\n');
      writeFileSync(report, `${readFileSync(report, 'utf8')}${reportSection(run)}\n`);
      const stamp = runAt.replace(/[:.]/g, '');
      writeFileSync(join(dir, `backtest-${stamp}-leadtimes.csv`), toCsv(['code', 'flag', 'event', 'status', 'since', 'days'], run.leadTimes));
      writeFileSync(join(dir, `backtest-${stamp}-control-weekly.csv`), toCsv(['flag', 'date', 'ok', 'triggered'], run.flags.flatMap((f) => f.control.byDate.map((d) => ({ flag: f.flag, ...d })))));
      writeFileSync(join(dir, `backtest-${stamp}.json`), `${JSON.stringify({ ...run, leadTimes: undefined }, null, 2)}\n`);
      console.log(`backtest: ${run.eventFunds} event funds, ${run.controlFunds} controls, ${run.grid.dates} grid dates; report appended to ${report}`);
      return 0;
    }
    case 'flags': {
      const method = parseMethod(readFileSync(resolve(ROOT, 'METHOD.md'), 'utf8'));
      const ix = buildIndex(archiveRecords(values.archive as string));
      const codes = values.codes ? (values.codes as string).split(',').filter(Boolean) : [...new Set(parseCsvRecords(readFileSync(values.events as string, 'utf8')).records.map((r) => r.fund_code))].sort();
      const rows = codes.flatMap((c) => evaluate(ix, method, c, values.day as string));
      const out = values.out as string;
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, toCsv(RESULT_COLUMNS, rows as unknown as Record<string, string>[]));
      console.log(`flags: ${rows.length} results for ${codes.length} funds on ${values.day} (method ${method.version}, ${method.sha256.slice(0, 12)})`);
      return 0;
    }
    case 'build-tables': {
      const out = values.tables as string | undefined;
      if (!out) {
        console.error('--tables <dir> is required');
        return 2;
      }
      mkdirSync(out, { recursive: true });
      const rows = holdingsTable(archiveRecords(values.archive as string));
      writeFileSync(join(out, 'holdings.csv'), toCsv(HOLDINGS_COLUMNS, rows));
      const issuers = issuerTable(rows);
      writeFileSync(join(out, 'issuers.csv'), toCsv(ISSUER_COLUMNS, issuers));
      console.log(`build-tables: holdings.csv ${rows.length} rows, issuers.csv ${issuers.length} rows`);
      return 0;
    }
    default:
      console.error('usage: cli.ts check | validate-archive | validate-events | validate-timeline | snapshot | archive-coverage | backfill | record-coverage | import-dump-holdings | build-tables (see the header of src/cli.ts)');
      return 2;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = await main(process.argv.slice(2));
