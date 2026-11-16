/**
 * Turkish folding for matching (not for display): case and diacritics are
 * removed and every form of i meets. Same rules as `katla` in MSC Labs'
 * Resmî Gazete monitor and `foldTr` in its turkish_text package.
 */
const FOLD: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', ș: 's', ț: 't' };

export function foldTurkish(text: string): string {
  return [...text.replace(/I/g, 'ı').replace(/İ/g, 'i')]
    .map((ch) => ch.toLowerCase())
    .filter((ch) => ch !== '̇')
    .map((ch) => FOLD[ch] ?? ch)
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}
