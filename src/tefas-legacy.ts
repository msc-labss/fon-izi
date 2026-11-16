/**
 * The old TEFAS fund page, `FonAnaliz.aspx?FonKod={CODE}` (until about May
 * 2026), as kept by the Internet Archive (docs/history-spike.md).
 *
 * One page holds:
 * - the fund card (`ul.top-list`, `div.price-indicators`), in tr-TR number
 *   format;
 * - the profile table (`fund-profile-header` / `fund-profile-item`): code,
 *   ISIN, trading status, risk value;
 * - a Highcharts price chart (`chartMainContent_FonFiyatGrafik`): one year
 *   of daily prices as `categories` (dd.mm.yyyy) and the `Fiyat` series;
 * - an allocation pie (`"name":"Varlık Dağılımı"`).
 *
 * Values are kept as shown. A card value shown empty is null with
 * `missing[field] = 'empty'`; a field not on the page is null with
 * `'not-shown'`.
 */
import { ExtractError } from './tefas.ts';

const decode = (s: string) =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .trim();

/** tr-TR number as shown: "11.121" → 11121, "%-12,5" → -12.5, "" or "-" → null. */
export function trNumber(shown: string): number | null {
  const s = decode(shown).replace(/^%/, '').replace(/\s/g, '');
  if (s === '' || s === '-') return null;
  const n = Number(s.replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(n)) throw new ExtractError(`not a number: ${JSON.stringify(shown)}`);
  return n;
}

/** dd.mm.yyyy → yyyy-mm-dd. */
export function trDate(shown: string): string {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(shown);
  if (!m) throw new ExtractError(`not a date: ${JSON.stringify(shown)}`);
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** Card items: `<li>LABEL<br /> ... <span ...>VALUE</span>`. */
function cardItems(html: string): Map<string, string> {
  const items = new Map<string, string>();
  for (const m of html.matchAll(/<li[^>]*>\s*([^<]+?)\s*<br\s*\/?>(?:\s*<br\s*\/?>)?\s*<span[^>]*>([^<]*)<\/span>/g)) items.set(decode(m[1]), m[2]);
  return items;
}

function profileItems(html: string): Map<string, string> {
  const items = new Map<string, string>();
  for (const m of html.matchAll(/<td class="fund-profile-header">([^<]*)<\/td>\s*<td class="fund-profile-item">([^<]*)<\/td>/g)) items.set(decode(m[1]), decode(m[2]));
  return items;
}

/** The JSON array that follows `"key":` at or after `from`. */
function arrayAfter(text: string, key: string, from: number): unknown[] | null {
  const i = text.indexOf(`"${key}":[`, from);
  if (i === -1) return null;
  const start = i + key.length + 3;
  let depth = 0;
  for (let j = start; j < text.length; j++) {
    if (text[j] === '[') depth++;
    else if (text[j] === ']' && --depth === 0) return JSON.parse(text.slice(start, j + 1));
  }
  return null;
}

export interface LegacyFundPage {
  [field: string]: unknown;
  code: string;
  priceSeries: [string, number][] | null;
  allocation: { assetType: string; percent: number }[] | null;
  missing: Record<string, string>;
}

const CARD: Record<string, string> = {
  unitPrice: 'Son Fiyat (TL)',
  dailyReturn: 'Günlük Getiri (%)',
  shareCount: 'Pay (Adet)',
  totalValue: 'Fon Toplam Değer (TL)',
  investorCount: 'Yatırımcı Sayısı (Kişi)',
  marketShare: 'Pazar Payı',
};
const RETURNS: Record<string, string> = { m1: 'Son 1 Ay Getirisi', m3: 'Son 3 Ay Getirisi', m6: 'Son 6 Ay Getirisi', y1: 'Son 1 Yıl Getirisi' };

export function extractLegacyFundPage(html: string, expectedCode: string): LegacyFundPage {
  const profile = profileItems(html);
  const code = profile.get('Kodu');
  if (!code) throw new ExtractError(`${expectedCode}: no fund profile on page`);
  if (code !== expectedCode) throw new ExtractError(`${expectedCode}: page is for ${code}`);
  const card = cardItems(html);
  const missing: Record<string, string> = {};
  const num = (field: string, label: string) => {
    if (!card.has(label)) {
      missing[field] = 'not-shown';
      return null;
    }
    const v = trNumber(card.get(label)!);
    if (v === null) missing[field] = 'empty';
    return v;
  };
  const out: LegacyFundPage = { code, priceSeries: null, allocation: null, missing };
  const title = /id="MainContent_FormViewMainIndicators_LabelFund">([^<]*)</.exec(html);
  out.title = title ? decode(title[1]) : null;
  if (!title) missing.title = 'not-shown';
  for (const [field, label] of Object.entries(CARD)) out[field] = num(field, label);
  const category = card.get('Kategorisi');
  out.category = category === undefined ? null : decode(category);
  if (category === undefined) missing.category = 'not-shown';
  const rank = card.get('Son Bir Yıllık Kategori Derecesi');
  const rm = rank ? /^\s*([\d.]+)\s*\/\s*([\d.]+)\s*$/.exec(decode(rank)) : null;
  out.categoryRank = rm ? trNumber(rm[1]) : null;
  out.categorySize = rm ? trNumber(rm[2]) : null;
  if (!rm) missing.categoryRank = missing.categorySize = rank === undefined ? 'not-shown' : 'empty';
  const returns: Record<string, number | null> = {};
  for (const [field, label] of Object.entries(RETURNS)) returns[field] = num(`returns.${field}`, label);
  out.returns = returns;
  out.isin = profile.get('ISIN Kodu') || null;
  out.tradingStatus = profile.get('Platform İşlem Durumu') || null;
  const risk = profile.get('Fonun Risk Değeri');
  out.riskValue = risk === undefined ? null : trNumber(risk);
  if (out.riskValue === null) missing.riskValue = risk === undefined ? 'not-shown' : 'empty';

  const chart = html.indexOf('chartMainContent_FonFiyatGrafik = new');
  if (chart !== -1) {
    const dates = arrayAfter(html, 'categories', chart) as string[] | null;
    const fiyat = html.indexOf('{"name":"Fiyat"', chart);
    const prices = fiyat === -1 ? null : (arrayAfter(html, 'data', fiyat) as number[] | null);
    if (dates && prices && dates.length === prices.length) out.priceSeries = dates.map((d, i) => [trDate(d), prices[i]]);
    else throw new ExtractError(`${expectedCode}: price chart without matching dates and prices`);
  } else missing.priceSeries = 'not-shown';

  const pie = html.indexOf('"name":"Varlık Dağılımı"');
  const slices = pie === -1 ? null : (arrayAfter(html, 'data', pie) as [string, number][] | null);
  if (slices) out.allocation = slices.map(([assetType, percent]) => ({ assetType, percent }));
  else missing.allocation = 'not-shown';
  return out;
}
