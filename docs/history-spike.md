# History spike: what was public before 17 Sep 2026

Plan group 2, done on 16 Nov 2026. Question: for the 131 liquidated funds
and a control sample, which data from January 2025 to September 2026 can
still be recovered, from which source, and on what terms?

## 1. TEFAS's own history (task 2.1)

**TEFAS itself:** its robots.txt disallows `/api/` (`docs/sources/tefas.md`),
and the pages show only the current day. Fon İzi cannot read TEFAS's own
history.

**Public dumps of the retired API.** Searched Kaggle, GitHub, Hugging
Face, Zenodo and data.world on 16 Nov 2026:

| Source | Fields | Range | Licence | Verdict |
|---|---|---|---|---|
| [sercannnnn/fon-analiz-veri](https://github.com/sercannnnn/fon-analiz-veri) (GitHub) | date, code, price, investors, portfolio size, units in circulation; allocation only 2026-07 onward | 3 Feb 2025 to now. Gaps (README): 27 Feb–1 Sep 2025, 27–29 May 2026 | **none stated** | Best coverage. **Used privately for research; its rows are not republished.** |
| [kemalersin/fonparam-database](https://github.com/kemalersin/fonparam-database) | investor count, AUM, shares (`fund_historical_values`) | "last 1 year" per README, dates unstated | MIT | Probably too short; not checked |
| [hakyemezi/turkeyfundsdata](https://github.com/hakyemezi/turkeyfundsdata) | scraper only, no data committed | — | MIT | Column reference only |
| Hugging Face, Zenodo | nothing in range | — | — | — |
| Kaggle, data.world | could not be searched with our tools | — | — | not verified |

**Check of the first dump (16 Nov 2026):** two monthly files,
`arsiv/tefas_2025-09.csv.gz` (40,470 rows) and
`arsiv/tefas_2026-09.csv.gz` (44,869 rows), downloaded and searched.
The crisis funds are present daily:

- TLY: 22 rows in each month.
- DOH, KSA and T3B: present on 2025-09-01 and 2026-09-01.
- Columns: `tarih, fonKodu, fiyat, kisiSayisi, portfoyBuyukluk, tedPaySayisi`.

**Private use (decided 16 Nov 2026):** the dump is cloned on the
maintainer's machine with a manifest of every file's SHA-256 (commit
`48751f0`), and is not part of this repository.

- **Fund holdings (`fon_icerik`):** monthly, taken from KAP: BIST code,
  ISIN, nominal, market value and weight per holding. 2026-08 covers 733
  funds, 30 of them crisis funds; 2026-09 covers 9 crisis funds.
- **Share prices (`hisse`):** daily closes and volume from İş Yatırım, for
  BIST 100 shares only.
- **Provenance:** the repository was created on 5 Sep 2026, so rows dated
  earlier were collected from TEFAS afterwards, not on the day.

## 2. Internet Archive captures of TEFAS pages (task 2.4)

TEFAS has had two page addresses per fund:

- **Old:** `FonAnaliz.aspx?FonKod={CODE}`, until about May 2026.
- **New:** `/tr/fon-detayli-analiz/{CODE}`.

What one old page holds, from TLY's capture of 18 Aug 2025 (1.29 MB):

- **The fund card:** price, daily return, shares, total value, category,
  category rank, investor count, market share, returns and risk value.
  On that day TLY showed price 0 and total value empty, with 11,121
  investors and rank 954 of 1,288.
- **The asset allocation pie** ("Varlık Dağılımı").
- **A one-year daily price series** ("Fiyat"), starting 19.08.2024.

So each usable old capture gives one point for the card fields and a year
of prices.

Captures after about May 2026 are not usable:

- TLY's old page on 20 May 2026 is a WAF "Request Rejected" page.
- TLY's new page on 7 Jun 2026 is a bot-challenge page.

The coverage tool therefore counts a capture as usable only with status
200 and at least 20 KB archived (`src/cdx.ts`).

Coverage per fund and month: `docs/history-coverage.csv`, made by
`src/cli.ts archive-coverage`. The study set is the 131 funds plus a
control sample of 200:

- drawn per umbrella type in proportion to the crisis funds: 179 Serbest,
  14 Para Piyasası, 4 Katılım and 3 Hisse Senedi;
- seed 20261116, from TEFAS's fund list of 16 Nov 2026.

Results are in section 5.

## 3. KAP monthly portfolio reports (task 2.2)

- **Holdings come only from KAP.** Each fund's monthly portfolio report
  is a KAP disclosure.
- **Disclosure pages** (`/tr/Bildirim/{index}`) are Next.js pages whose
  payload carries structured fields: `disclosureType`, `summary`,
  `attachmentCount` and `publishDate` to the second (e.g.
  `2026.07.13 18:57:28`). They are parseable without a PDF library, as far
  as the one disclosure read shows.
- **Two blocks:**
  1. KAP's robots.txt returns an HTTP 666 block page, so under our rules
     (RFC 9309, an unreachable robots.txt means disallow everything) Fon
     İzi does not read KAP automatically.
  2. The list of a fund's portfolio reports sits behind KAP's disclosure
     search, not on the fund's page.
- **Requests made:** we read three KAP pages by hand on 16 Nov 2026 and
  stopped there.
- **Mirror:** ekofin.net shows fund portfolios, but it loads them in the
  browser, is a commercial service and its terms are unread. Not used.

**Decided 16 Nov 2026:** KAP is read slowly with an honest User-Agent
(`terms.md`, KAP).

- **What we know:** a fund's KAP page lists its expected weekly
  "Portföy Dağılım Raporu" filings, but not the published ones.
- **Manager filings:** the manager's disclosure list
  (`/tr/bildirim-sorgu-sonuc?member={manager}`) is server-rendered and
  returns about a year of filings. Tera's includes 148 "Pay Alım Satım
  Bildirimi" share-trade notices naming its funds.
- **Still open:** how to query published portfolio reports by fund.

## 4. Free float and daily volume (task 2.3)

| Series | Source | Status |
|---|---|---|
| Free-float share count and ratio | MKK Veri Analiz Platformu, [Fiili Dolaşım Raporu](https://www.vap.org.tr/fiili-dolasim-raporu) | Daily, free to view, limit of 5 reports per 10 minutes. robots.txt allows report pages. |
| Daily volume per share | Borsa İstanbul [Pay Piyasası Verileri](https://borsaistanbul.com/veriler/pay-piyasasi-verileri) and DataStore | robots.txt allows all. Terms: copying, distribution or storage need Borsa İstanbul's prior written consent. Free per-share daily volume not confirmed. |

On the MKK free-float report:

- The method changed on 11 Sep 2026 (SPK decision of 3 Sep 2026; MKK
  publishes daily from 14 Sep 2026). Earlier values used another
  definition.
- Whether VAP serves 2025 history is unverified.
- Its copyright PDF is unread.

On Borsa İstanbul: its copyright notice
(<https://www.borsaistanbul.com/en/copyright-and-disclaimer-notice>)
forbids copying, distributing or storing its information without prior
written consent. **Without that consent, `days-to-exit` stays
`insufficient-data`.**

## 5. Coverage results

Pending the coverage run.

## 6. Decisions (16 Nov 2026)

1. **The dump owner:** not asked for now. The dump is used privately, and
   the owner is asked only if we want to republish its rows.
2. **MKK (KAP operator):** not asked. KAP is read slowly with an honest
   User-Agent.
3. **Borsa İstanbul:** not asked. `days-to-exit` stays `insufficient-data`
   except for BIST 100 shares covered by the dump's private `hisse`
   series.
