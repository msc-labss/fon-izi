# Fon İzi

A point-in-time archive of public data about Turkish investment funds, for
journalists and researchers.

On 17 September 2026 the Capital Markets Board (SPK) closed and liquidated
131 investment funds (SPK bulletins 2026/60 and 2026/61). Much of the
public data about those funds has since changed or gone from the pages that
showed it. Fon İzi records what public sources show each day, with enough
provenance that every record can be cited and checked later.

> **Status:** the first release, `data-2026.11.16`, is out: a case file on
> the 2026 fund liquidations in English and Turkish, with its method, event
> set, SPK timeline and backtest tables (`releases/2026.11.16/`). The daily
> archive itself is not part of the release and stays private for now
> (`docs/sources/terms.md`).

## Releases

Each release is a folder under `releases/` with a `manifest.json` that lists
every file with its SHA-256, size and row count. To check a copy:

```sh
node --experimental-strip-types src/cli.ts verify-release releases/2026.11.16
node --experimental-strip-types src/cli.ts release-check releases/2026.11.16
```

- Case file: `case-file/en.md` and `case-file/tr.md`; every number in them
  comes from `case-file/figures.json`.
- Tables: `tables/backtest-leadtimes.csv` (per liquidated fund and flag) and
  `tables/backtest-control-weekly.csv` (control-group counts per Friday),
  documented in `docs/schema.md`.
- Not included: raw pages, the daily archive, and rows of the public dataset
  the backtest used for April to September 2026 (only figures derived from it).

## What the archive holds

- **TEFAS fund figures, once a day:** for every fund on TEFAS's fund list:
  code, title, category, unit price, total value, share count, investor
  count, asset allocation and risk value, exactly as the pages show them.
- **Provenance for every record:**
  - source URL;
  - capture time (UTC);
  - HTTP status;
  - SHA-256 of the response;
  - tool version;
  - where possible, an archive.org copy taken at the same time.
- **Append only:** records are never edited or deleted. A correction is a
  new record that names the one it corrects.

## What it does not hold

- **No personal data.** Records name funds, portfolio managers and issuers
  only.
- **No raw pages from sources whose terms we have not cleared.** For those
  sources we keep the extracted fields and the response hash. See
  `docs/sources/terms.md`.
- **No advice.** Fon İzi describes what public data showed and when. It
  does not rank funds, score them or tell anyone to buy or sell.

## How it collects

- It reads only public, server-rendered pages and follows each site's
  robots.txt. It does not use a site's API where robots.txt disallows it.
- It sends at most one request per second to each host, and identifies
  itself as `fon-izi` with a link to this repository.
- A day that cannot be read fails loudly and stays empty. It is never
  filled with an earlier value.

## Licences

- Code: MIT (`LICENSE`).
- Our derived data, method and case file: CC BY 4.0 (`LICENSE-DATA`).
- Source data stays under its source's terms.

## Maintainer

Fon İzi is maintained by [MSC Labs](https://msclabs.tr), an independent
software studio in Türkiye.

---

**Türkçe özet.** Fon İzi, Türkiye'deki yatırım fonlarına ait kamuya açık
verilerin, yayımlandıkları gün kaydedildiği açık kaynaklı bir arşivdir.
Gazeteciler ve araştırmacılar için hazırlanır. Her kayıt kaynağını, alınma
zamanını ve içerik özetini (SHA-256) taşır. Kişisel veri tutmaz, yatırım
tavsiyesi vermez, fonları sıralamaz.
