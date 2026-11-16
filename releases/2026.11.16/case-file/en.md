# The September 2026 fund liquidations: what public data showed before

*Fon İzi case file · method v0*

## What happened

On September 17, 2026 the Capital Markets Board (SPK) closed every fund of 7 portfolio managers to buying and selling on TEFAS and ordered 131 of them liquidated [SPK Bulletin 2026/60, p. 1] [SPK Bulletin 2026/61, pp. 2–6]. On August 28, 2026 SPK had amended its investment fund guideline (Yatırım Fonlarına İlişkin Rehber), changing several sections and adding new ones [SPK Bulletin 2026/54, p. 1].

Fon İzi's timeline (`events/2026-timeline.csv`) lists 31 SPK decisions on these managers and their funds from February 2025 to November 2026, among them 11 trading bans tied to specific shares. Every row cites the bulletin and page.

This case file asks one question: **what did public data show about these funds before the liquidation, and how often did the same signals appear for other funds?**

## What was measured

Fon İzi keeps a point-in-time archive of public fund data: TEFAS fund pages, Internet Archive copies of the old TEFAS pages, a public dataset of daily TEFAS figures and monthly holdings, and SPK bulletins. Every record carries its source, capture time and a content hash.

The method (`METHOD.md`, version v0, frozen before the backtest) defines descriptive flags. Four of them could be measured for nearly every fund:

- **return-vs-peers**: the fund's return over 90 days was at or above the 99th percentile of all TEFAS funds.
- **investor-growth**: the number of investors grew at least 5-fold in 90 days, in a fund with at least 1,000 investors.
- **net-inflow**: over 90 days the fund's value grew, beyond its own return, by at least 2 times its starting value.
- **repo-borrowing**: the fund's asset allocation showed repo borrowing beyond 5 percent of its value.

Each flag was evaluated every Friday from January 3, 2025 to September 11, 2026 (89 dates), using only data that was public on that date. The same flags were evaluated for 1,546 other funds of the same fund types, the control group.

**The thresholds were set with hindsight.** The people who chose them knew about the liquidations. The control group is the safeguard: a flag that fires as often for other funds tells little.

## Results

| Flag | Liquidated funds it fired for at least once | Other funds it fired for at least once | Times as often | Liquidated funds with data | Other funds with data |
|---|---|---|---|---|---|
| return-vs-peers | 44.5% | 4.8% | 9.2 | 128 | 1,514 |
| investor-growth | 13.8% | 5.1% | 2.7 | 130 | 1,518 |
| repo-borrowing | 9.3% | 3.4% | 2.7 | 129 | 1,527 |
| net-inflow | 72.7% | 30.4% | 2.4 | 128 | 1,514 |

- **Unusual returns separated most clearly:** the flag fired for 44.5% of the liquidated funds and 4.8% of the other funds.
- **Investor growth and repo borrowing also separated:** investor growth fired 2.7 times as often for liquidated funds, repo borrowing 2.7 times.
- **Net inflow fired for a large share of other funds as well** (30.4%); on its own it says little.
- **Many liquidated funds show none of these signals.** The liquidation took in every fund of the 7 managers, including money market funds.

## How early

A flag has a lead when it stayed triggered every Friday, without a break, until the liquidation. A single week without data or below the threshold ends the streak, so leads here are conservative.

- 26 liquidated funds had at least one of the four flags held into September 17, 2026.
- The longest: `PDG`'s return flag, held from February 6, 2026, 223 days before.
- `TLY`: repo borrowing held from July 31, 2026 (48 days before) and the return flag from August 21, 2026 (27 days before).
- Median leads by flag: return-vs-peers 16.5 days, investor-growth 27, repo-borrowing 48, net-inflow 34.

## Context and limits

- **Holdings and fund type barely separate here.** manager-cluster fired for 20.7% of the liquidated funds with data and 15.0% of other funds, but holdings were available for only 29 liquidated funds and only for August and September 2026. reach-vs-type (a qualified-investor fund with many investors) fired for 15.4% against 13.2%.
- **Two flags could not be measured.** No public point-in-time free-float series exists before September 2026, and Borsa İstanbul's terms do not allow reusing daily volume. free-float-share and days-to-exit are reported as insufficient data, not as "no signal".
- **Coverage.** Internet Archive copies of TEFAS pages end in March 2026; April to September 2026 comes from the public dataset, whose earlier rows were collected after the fact from TEFAS.
- **Descriptive only.** These flags describe measured quantities against stated thresholds. They say nothing about intent or conduct and are not investment advice.

## Sources and credits

- TEFAS (Takasbank) fund pages; SPK weekly bulletins; Internet Archive.
- Daily TEFAS figures and monthly holdings: the public dataset [sercannnnn/fon-analiz-veri](https://github.com/sercannnnn/fon-analiz-veri), used for analysis; its rows are not republished.
- Method, data tables, schemas and code: [github.com/msc-labss/fon-izi](https://github.com/msc-labss/fon-izi). Maintained by MSC Labs.
