/**
 * TEFAS page extraction (docs/sources/tefas.md).
 *
 * The pages are Next.js App Router pages: the data sits in
 * `self.__next_f.push([1,"…"])` script strings. We decode those strings,
 * then read a key's value where it is an object or an array; a repeated
 * object appears later as a reference string ("$a:4:props:…") and is
 * skipped.
 *
 * Values are kept as shown: a 0 stays 0. A field the page does not show at
 * all is null, with `missing[field] = 'not-shown'`.
 */

export class ExtractError extends Error {}

/** The concatenated RSC payload of a page. */
export function decodePayload(html: string): string {
  const parts: string[] = [];
  for (const m of html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) parts.push(JSON.parse(m[1]));
  if (parts.length === 0) throw new ExtractError('no Next.js payload in page');
  return parts.join('');
}

/** End index (inclusive) of the JSON object or array that starts at `start`. */
function balancedEnd(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** The first value of `"key":` that is an object or array, parsed; undefined if none. */
export function valueAt(payload: string, key: string): unknown {
  const needle = `${JSON.stringify(key)}:`;
  for (let i = payload.indexOf(needle); i !== -1; i = payload.indexOf(needle, i + 1)) {
    const start = i + needle.length;
    const c = payload[start];
    if (c !== '{' && c !== '[') continue;
    const end = balancedEnd(payload, start);
    if (end === -1) continue;
    return JSON.parse(payload.slice(start, end + 1));
  }
  return undefined;
}

type Obj = Record<string, unknown>;

/** Reads `map` (ours ← theirs) from `src`, recording fields the page does not show. */
function pick(src: Obj | undefined, map: Record<string, string>, missing: Record<string, string>): Obj {
  const out: Obj = {};
  for (const [ours, theirs] of Object.entries(map)) {
    if (src && theirs in src) out[ours] = src[theirs];
    else {
      out[ours] = null;
      missing[ours] = 'not-shown';
    }
  }
  return out;
}

const riskNumber = (v: unknown) => (typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : v);

const DETAIL_INFO = {
  code: 'fonKodu',
  title: 'fonUnvan',
  category: 'fonKategori',
  unitPrice: 'sonFiyat',
  totalValue: 'portBuyukluk',
  shareCount: 'payAdet',
  investorCount: 'yatirimciSayi',
  categoryRank: 'kategoriDerece',
  categorySize: 'kategoriFonSay',
  marketShare: 'pazarPayi',
  dailyReturn: 'gunlukGetiri',
};
const DETAIL_PROFILE = { isin: 'isinKodu', tradingStatus: 'tefasDurum', kapUrl: 'kapLink', riskValue: 'riskDegeri' };
const RETURNS = { m1: 'getiri1a', m3: 'getiri3a', m6: 'getiri6a', y1: 'getiri1y', y3: 'getiri3y', y5: 'getiri5y' };

export interface FundDetail {
  [field: string]: unknown;
  code: string;
  allocation: { assetType: unknown; percent: unknown }[] | null;
  missing: Record<string, string>;
}

/** Extracts one fund detail page. Throws ExtractError when the page is not a fund page for `expectedCode`. */
export function extractFundDetail(html: string, expectedCode: string): FundDetail {
  const payload = decodePayload(html);
  const info = valueAt(payload, 'bilgiData') as Obj | undefined;
  if (!info || typeof info !== 'object') throw new ExtractError(`${expectedCode}: no bilgiData on page`);
  if (info.fonKodu !== expectedCode) throw new ExtractError(`${expectedCode}: page is for ${String(info.fonKodu)}`);
  const profile = valueAt(payload, 'profilData') as Obj | undefined;
  const periodic = valueAt(payload, 'periyodikData') as Obj | undefined;
  const assets = valueAt(payload, 'varlikData');
  const missing: Record<string, string> = {};
  const fundTypeMatch = /"fonTipi":"([^"]*)"/.exec(payload);
  const detail: FundDetail = {
    ...pick(info, DETAIL_INFO, missing),
    ...pick(profile, DETAIL_PROFILE, missing),
    fundType: fundTypeMatch ? fundTypeMatch[1] : null,
    returns: periodic ? pick(periodic, RETURNS, missing) : null,
    allocation: Array.isArray(assets)
      ? (assets as Obj[]).map((a) => ({ assetType: a.kiymetTip ?? null, percent: a.portfoyOrani ?? null }))
      : null,
    missing,
  } as unknown as FundDetail;
  if (detail.fundType === null) missing.fundType = 'not-shown';
  if (!periodic) missing.returns = 'not-shown';
  if (!Array.isArray(assets)) missing.allocation = 'not-shown';
  detail.riskValue = riskNumber(detail.riskValue);
  return detail;
}

export interface FundListEntry {
  code: string;
  title: unknown;
  umbrellaType: unknown;
  tefasListed: unknown;
  riskValue: unknown;
  returns: Obj;
  missing: Record<string, string>;
}

/** Extracts the fund list from `/tr/fon-getirileri`. Throws ExtractError when there is no list. */
export function extractFundList(html: string): FundListEntry[] {
  const list = valueAt(decodePayload(html), 'initialFundListingData');
  if (!Array.isArray(list)) throw new ExtractError('no initialFundListingData on page');
  return (list as Obj[])
    .filter((e) => typeof e?.fonKodu === 'string' && e.fonKodu !== '')
    .map((e) => {
      const missing: Record<string, string> = {};
      const base = pick(e, { title: 'fonUnvan', umbrellaType: 'fonTurAciklama', tefasListed: 'tefasDurum', riskValue: 'riskDegeri' }, missing);
      return {
        code: e.fonKodu as string,
        ...base,
        riskValue: riskNumber(base.riskValue),
        returns: pick(e, { ...RETURNS, ytd: 'getiriyb' }, missing),
        missing,
      } as FundListEntry;
    });
}
