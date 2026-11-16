# Source: TEFAS (tefas.gov.tr)

Findings of the capture spike, 16 Nov 2026, 13:35–13:39 UTC. TEFAS is the
national fund trading platform run by Takasbank.

## robots.txt

Fetched 16 Nov 2026 (SHA-256 `43d64247…f007162`):

```
User-Agent: *
Allow: /
Disallow: /api/
Disallow: /private/
Disallow: /tefasbuild
Disallow: /_next/
Disallow: /static/
```

**Consequence:** the JSON API under `/api/` is out of bounds for this
project. That includes the endpoints `tefas-crawler` uses since the 2026
rewrite. We read server-rendered pages only. TEFAS's own price history is
therefore not available to us: history comes from backfill (archive.org
captures, public dumps), never from `/api/`.

## Chosen path: one list page plus one page per fund

No single page carries investors, size and allocation for every fund:
`/tr/tefas-fonlar` and `/tr/fon-verileri` fill their tables in the browser
from `/api/`. Two kinds of page do carry the data in the server response.

| What | URL | Per day |
|---|---|---|
| Fund list | `https://www.tefas.gov.tr/tr/fon-getirileri` | 1 request, about 0.9 MB |
| Fund detail | `https://www.tefas.gov.tr/tr/fon-detayli-analiz/{CODE}` | 1 request per fund, about 230 KB |

- **Fund list:** the payload key `initialFundListingData` holds 2,136 funds
  (16 Nov 2026), of which 1,075 have `tefasDurum: true` and 1,061 `false`.
  Each entry has the code, title, umbrella type, TEFAS status, returns over
  1 month to 5 years, and risk value.
- **Fund detail:** the old address `/FonAnaliz.aspx?FonKod={CODE}`
  answers 301 to this page.
- **Load:** about 2,136 × 230 KB, roughly 490 MB a day, which takes about
  36 minutes at 1 request per second.

## How the data is embedded

- The site is a Next.js App Router app. A
  `<script>self.__next_f.push([1,"…"])</script>` holds the payload as a JS
  string literal, which is JSON-compatible.
- **Reading a value:** decode the literal, find `"key":` followed by `{`
  or `[`, and read the balanced value.
- **Repeats:** a repeated object appears later as a reference string, for
  example `"profilData":"$a:4:props:…"`. Take the occurrence whose value is
  an object or an array.
- **No data date:** the payload names no date for its figures. Records
  carry capture time only, and publication time stays empty.
- **Investor count:** the fund data page (`/tr/fon-verileri`) warns that
  "Kişi Sayısı" (investor count) in today's report is the previous day's
  figure, updated at the end of the day.

## Field map

| Spec field | TEFAS key | Notes |
|---|---|---|
| code | `bilgiData.fonKodu` | |
| title | `bilgiData.fonUnvan` | |
| category | `bilgiData.fonKategori` | e.g. `Serbest Fon` |
| unit price | `bilgiData.sonFiyat` | TL |
| total value | `bilgiData.portBuyukluk` | TL |
| share count | `bilgiData.payAdet` | |
| investor count | `bilgiData.yatirimciSayi` | previous day's figure |
| asset allocation | `varlikData[].kiymetTip`, `varlikData[].portfoyOrani` | percent; can be negative (`Repo`) |
| risk value | `profilData.riskDegeri` | string `"1"`–`"7"` |

These are kept as well:

- from `profilData`: `isinKodu`, `tefasDurum` (text), `kapLink`;
- from `bilgiData`: `kategoriDerece`, `kategoriFonSay`, `pazarPayi`,
  `gunlukGetiri`;
- `periyodikData` (returns) and `fonTipi`.

## TLY on 16 Nov 2026 (values in the fixture)

- **Detail page:**
  - `fonUnvan` TERA PORTFÖY BİRİNCİ SERBEST FON, `isinKodu`
    TRYTRPY00025;
  - `fonKategori` Serbest Fon, `kategoriDerece` 1284 of
    `kategoriFonSay` 1315;
  - `sonFiyat` 0, `portBuyukluk` 0, `payAdet` 0, `yatirimciSayi` 104210,
    `pazarPayi` 0;
  - `riskDegeri` "7", `tefasDurum` "Fon Alımına Kapalı, Fon Bozumuna
    Kapalı";
  - every `periyodikData` return 0.
- **Allocation:** Hisse Senedi 87.43, Yatırım Fonları Katılma Payları
  8.90, Finansman Bonosu 4.49, Özel Sektör Kira Sertifikaları 3.41,
  Ters-Repo 2.67, Mevduat (TL) 0.53, Vadeli İşlemler Nakit Teminatları
  0.18, Repo −7.61.
- **List entry:** `tefasDurum: true`, `getiri1a` null, other returns 0,
  `riskDegeri` "7".
- **KAP page:**
  `https://www.kap.org.tr/tr/fon-bilgileri/genel/tly-tera-portfoy-birinci-serbest-fon`.
  This is the per-fund KAP address pattern for task 2.2.

**AAL, the active fund fixture:** `sonFiyat` 3.746686, `portBuyukluk`
1438509937.03, `payAdet` 383941976, `yatirimciSayi` 4092, Para Piyasası
Fonu 65 of 86, `riskDegeri` "1".

## Fixtures

Committed under `test/fixtures/tefas/` are trimmed excerpts: the decoded
payload objects, re-wrapped in a minimal page with the same `push` script.

Raw responses are not committed while TEFAS's raw-body policy is
`hash-only`; the terms check is task 1.2. The full responses stay in
`fixtures-local/`, which git ignores, and tests that need them skip when it
is absent.

| Full response | SHA-256 |
|---|---|
| `tr/fon-getirileri` | `9c47445fc3424919dc7634a51d669b3446d70f663eecd2d4104112917deee83d` |
| `tr/fon-detayli-analiz/TLY` | `6249f7621dcd37817cbca23010c6ce8912fd371747470811f0557a30754afa15` |
| `tr/fon-detayli-analiz/AAL` | `0732f9942edb06eef78aaaac7bfc874dce7eacbb599b3528c8e0b0aa93cea62a` |
| `robots.txt` | `43d6424794435e7be213d0eaec53ec7f933eef46659311a46c57914c0f007162` |
