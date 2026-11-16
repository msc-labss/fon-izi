/**
 * Case-file figures (spec fund-dataset-release: "Figures from one source",
 * "Locale formats in the case file").
 *
 * Every number in the English and Turkish case files comes from one
 * `figures.json`, built from release tables and the backtest report, and is
 * written in the text as `{{fig:<id>}}`. A number typed by hand in body text
 * fails the check.
 */

export type FigureKind = 'integer' | 'decimal' | 'percent' | 'date' | 'days';

export interface Figure {
  value: number | string;
  kind: FigureKind;
  digits?: number;
  /** Where the value comes from: release table and row key, or report section. */
  source: string;
}

export type Figures = Record<string, Figure>;

const LOCALES = { en: 'en-US', tr: 'tr-TR' } as const;
export type Lang = keyof typeof LOCALES;

export function formatFigure(f: Figure, lang: Lang): string {
  const locale = LOCALES[lang];
  switch (f.kind) {
    case 'integer':
      return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Number(f.value));
    case 'decimal':
      return new Intl.NumberFormat(locale, { minimumFractionDigits: f.digits ?? 1, maximumFractionDigits: f.digits ?? 1 }).format(Number(f.value));
    case 'percent':
      return new Intl.NumberFormat(locale, { style: 'percent', minimumFractionDigits: f.digits ?? 1, maximumFractionDigits: f.digits ?? 1 }).format(Number(f.value) / 100);
    case 'days':
      return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(Number(f.value));
    case 'date':
      return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${f.value}T00:00:00Z`));
  }
}

const REF = /\{\{fig:([a-z0-9][a-z0-9._-]*)\}\}/g;

/** Replaces every `{{fig:id}}`; an unknown id is an error. */
export function render(template: string, figures: Figures, lang: Lang): string {
  return template.replace(REF, (_, id: string) => {
    const f = figures[id];
    if (!f) throw new Error(`unknown figure ${id}`);
    return formatFigure(f, lang);
  });
}

const MONTHS = '(?:January|February|March|April|May|June|July|August|September|October|November|December|Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)';
/** Text that may hold digits: figure refs, citations, dates, law and decision numbers, code. */
const ALLOWED = [
  REF.source,
  String.raw`\[[^\]\n]*\]`, // citations and link text
  String.raw`\([^)\s]*://[^)\s]*\)`, // link targets
  String.raw`` + '`[^`\n]*`', // inline code, codes such as `T3B`
  String.raw`\d{4}-\d{2}-\d{2}`,
  String.raw`\d{1,2} ${MONTHS} \d{4}`,
  String.raw`${MONTHS} \d{4}`,
  String.raw`\d{4}/\d+`, // bulletin numbers
  String.raw`\d+/\d+(?:/\d+)?`, // decision and article numbers
  String.raw`(?:Law|Kanun|SPKn|art\.|madde|Communiqué|Tebliğ|no\.|No\.|sayılı)\s*[\dIVX.\-/]+`,
  String.raw`\d+ sayılı`,
  String.raw`\bv\d+\b`,
];
const ALLOWED_RE = new RegExp(ALLOWED.join('|'), 'g');
const NUMBER = /(?<![\p{L}\d])\d+(?:[.,]\d+)*%?(?![\p{L}\d])/u;

/** Numbers typed by hand in a template, as `<file>:<line>: <text>`. Headings and code blocks are checked too. */
export function handTypedNumbers(file: string, template: string): string[] {
  const errors: string[] = [];
  let inFence = false;
  template.split('\n').forEach((line, i) => {
    if (line.startsWith('```')) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    const rest = line.replace(ALLOWED_RE, ' ');
    const m = NUMBER.exec(rest);
    if (m) errors.push(`${file}:${i + 1}: ${m[0]}`);
  });
  return errors;
}
