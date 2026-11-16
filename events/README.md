# Event sets

## 2026-fund-crisis.csv

The 131 investment funds that SPK ordered liquidated on 17 Sep 2026, with
two events each:

- **`guideline-amended`, 2026-08-28.**
  - Source: SPK decision 52/1589, which amended the Investment Fund
    Guideline (Yatırım Fonlarına İlişkin Rehber).
  - Published in bulletin 2026/54, dated 28/08/2026, which SPK's listing
    gives as published on 29 Aug 2026; page 1.
- **`liquidation-ordered`, 2026-09-17.**
  - Source: SPK decisions 57/1706 and 57/1707.
  - Bulletin 2026/60 (page 1) announces the decision and lists the funds
    by title.
  - Bulletin 2026/61 gives the numbered list of all 131. Each row cites
    the 2026/61 page its fund appears on and its number in that list.

### How it was made (16 Nov 2026)

| Bulletin | URL | SHA-256 of the PDF |
|---|---|---|
| 2026/54 | https://spk.gov.tr/data/6a91fe798f95db1fb01ff364/2026-54.pdf | `9e55a8bebe1f43e3507a460b58260209d58d27b97d8d2ebe926e9414759e805e` |
| 2026/60 | https://spk.gov.tr/data/6aab8e7b8f95db07100fd7b4/2026-60.pdf | `15e02072509f830294816bdc8056e6e41a21f5e71f7502dbe9d30683a8ec7f2e` |
| 2026/61 | https://spk.gov.tr/data/6aac56ff8f95db07100fd82d/2026-61.pdf | `420650196a94ad4bb3343d65ebc57076a256f6263049138713276f3ce0dff96c` |

1. **Text:** extracted with `pdftotext -layout`. The numbered list in
   2026/61 gives 131 titles. Per manager: Pardus 42, Hedef 31, Atlas 16,
   Bulls 15, Pusula 12, A1 Capital 9, Tera 6.
   - Bulletin 2026/60's own list has 130 titles. It omits "TERA PORTFÖY
     HİSSE SENEDİ (TL) FONU (HİSSE SENEDİ YOĞUN FON)" (THF), which 2026/61
     includes as number 128.
2. **Matching:** each title was matched to a TEFAS fund code by comparing
   folded titles (case and Turkish diacritics removed) with TEFAS's fund
   list of 16 Nov 2026 (`/tr/fon-getirileri`, response SHA-256
   `9c47445f…cea62a`, 2,136 funds).
   - **130 exact matches.**
   - **One near match:** number 59, "HEDEF PORTFÖY KISA VADELİ SERBEST
     FON", is KSA ("HEDEF PORTFÖY KISA VADELİ SERBEST (TL) FON"). It is
     the only Hedef fund with that title, and its TEFAS page read "Fon
     Alımına Kapalı, Fon Bozumuna Kapalı" on 16 Nov 2026. The `match`
     column says so.
3. **Cross-check:** the six Tera codes (TLY, DOH, THF, TP2, TLV, T3B) agree
   with published reporting.

Check the file with:

```
node --experimental-strip-types src/cli.ts validate-events
```
