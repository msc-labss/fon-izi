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

## 2026-timeline.csv

A curated timeline of SPK decisions on the seven managers and their funds, 2025–2026: licences, ownership and capital changes, administrative fines, trading bans, measures, suspensions and liquidation steps. One row per decision; every row cites the bulletin URL and page.

- Built 16 Nov 2026 from all SPK weekly bulletins of 2025 and 2026 (146 PDFs; 2025/64 and 2026/13 are not on SPK's lists), text extracted with `pdftotext -layout` and searched for the seven managers; each candidate passage read and stated in a neutral English description.
- Routine approvals (fund launches, prospectus approvals and amendments) are left out.
- **Legal entities only.** Several decisions name natural persons; the timeline records the companies, the share and the legal basis, never a person.
- Check with `node --experimental-strip-types src/cli.ts validate-timeline`.

Bulletins cited (SHA-256 of the PDF as fetched on 16 Nov 2026):

| Bulletin | SHA-256 |
|---|---|
| 2025/8 | `dbcacc955e232d6f8b768aebfbbe220c10e74a63904743909819e944ffa6967e` |
| 2025/38 | `97ee3b2c8500606cee2c1add8335368e027eb17076f92f488f057e801f2146e1` |
| 2026/28 | `a365bb0fb2b997db65af7fe51b32778100f8a00d109e44d22652df34d44dcdff` |
| 2026/36 | `cda6a2ea523f3de1863455df27c0dec4531c5098401dfc5e93be25de974c273a` |
| 2026/39 | `252fad17cb915518d9e887dd02b84f9558cd673864c0d3f4f52ed7bf31dadfd8` |
| 2026/54 | `9e55a8bebe1f43e3507a460b58260209d58d27b97d8d2ebe926e9414759e805e` |
| 2026/58 | `0810e7a5618ca8b91ed6ec39f5650e639c832adfaa98120174c58b463ff953f2` |
| 2026/59 | `c89ba57c2f065da5f943151d6f4126cdacf1166913f6ac256c008ed80cfeca33` |
| 2026/60 | `15e02072509f830294816bdc8056e6e41a21f5e71f7502dbe9d30683a8ec7f2e` |
| 2026/61 | `420650196a94ad4bb3343d65ebc57076a256f6263049138713276f3ce0dff96c` |
| 2026/65 | `d549ef36f8a6128c6e8d59a08ad34052253c5453d38f5ded09e2b1e171ef9911` |
| 2026/66 | `00a7f721e3df67305ca4e35a601219ebde3f7fedaf9d3ae4c260e3641bf890ce` |
| 2026/67 | `b60039a0d66620f86865a4434c94d45e53ffb7cb882bb0f9c9ab13fdcd90c8d4` |
| 2026/70 | `c3cae11541f4683ce3d3464a51322505ca7a66a2cf46c49d5284d85f997aa990` |
| 2026/71 | `039dd4effe6db268e08f7d90096fd47afcacb4e59f9c4bc4d6d0e2a9eb661007` |
| 2026/73 | `ac7c557031bbb72c9ce2e135391d65a2d4a74b879466b220892b2dc6d9c02cc0` |
| 2026/75 | `030178b836aa2c1efeddd9155ff78b8b18bf2740857e779d44165835a277b3c5` |
| 2026/76 | `b05bdee82148f2751bfa77659507ead881a7a72b05b97faf0c04b9753f190734` |
| 2026/77 | `f310d1a90c4088087b8add78e944ebf8650739dc253042b90775e20435b94027` |
| 2026/79 | `fd9eb8a059398a68322b460cae45b6056e595327960de2d9de24b8b465fff98e` |
| 2026/80 | `8d6ae5a1dab5167d5664d04cf123d2ffae819c44281f0d672397e835a92c5314` |
