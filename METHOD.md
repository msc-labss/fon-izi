# Method v0

Fon İzi computes **descriptive flags**. A flag says that a measured
quantity crossed a stated threshold on a stated date, using only data that
was public on that date. It does not say anything about the intent,
conduct or soundness of a fund, its manager or anyone else.

## Rules that apply to every flag

1. **Point in time.** A flag evaluated for date D uses only records
   available on D: records whose publication time is on or before D or,
   when the source states no publication time, whose capture time is on or
   before D. TEFAS daily figures are published on the date they are for.
2. **Missing input is not a pass.** When any input is unavailable on D the
   result is `insufficient-data`, never "not triggered".
3. **Every result shows its inputs.** A result row lists the archive record
   ids of every input it used.
4. **No score, grade, colour or ranking.** Flags are reported one by one.
5. **Thresholds were chosen with hindsight.** The people who set them knew
   about the 2026 fund crisis. For example, `repo-borrowing` at −5% was set
   knowing that TLY showed −7.61%. The safeguard is the control group: for
   every flag, the backtest reports how often it fires for funds outside
   the event set. Read every lead time next to that rate.
6. **Frozen version.** This document is v0. Its thresholds do not change
   without a new version, and every backtest run records the SHA-256 of the
   document it used.

## Definitions

- **Price:** the TEFAS unit price for a date. The price used on a date is
  the last one on or before it.
- **r90:** trailing 90-calendar-day return, P(D) / P(D − 90) − 1.
- **Size:** total fund value (TL). **Investors:** TEFAS investor count.
- **Category:** the fund's TEFAS category on the latest record available
  on D.
- **Manager:** the portfolio manager named at the start of the fund's
  title (up to "Portföy").
- **Value on a date:** the value used "on date X" is the last observation
  for a date on or before X, at most 31 days older than X and available on
  D. An older one counts as missing.
- **Holdings on D:** the latest monthly portfolio report available on D
  whose month ended at most 62 days before D. A holding is identified by
  its BIST code, else its ISIN.

## Flags

### return-vs-peers

The fund's 90-day return against every TEFAS fund with prices on both
dates.

```json flag
{ "id": "return-vs-peers", "version": "v0", "measure": "percentile of r90 among all funds with prices on D and D-90", "formula": "percentile_rank(r90(fund), r90(all funds priced on D and D-90))", "inputs": ["price"], "window_days": 90, "threshold": { "op": ">=", "value": 99 } }
```

Peers are all funds, not the fund's category: categories before November
2026 are on record only for the funds studied, and taking today's
categories for earlier dates would break the point-in-time rule.

### investor-growth

How many times the investor count grew in 90 days, for funds with at least
1,000 investors.

```json flag
{ "id": "investor-growth", "version": "v0", "measure": "investors(D) / investors(D-90)", "formula": "investors(D) / max(investors(D-90), 1); not triggered when investors(D) < 1000", "inputs": ["investors"], "window_days": 90, "threshold": { "op": ">=", "value": 5 }, "min_investors": 1000 }
```

### net-inflow

Growth in fund value over 90 days that the fund's own return does not
explain, as a share of the starting value.

```json flag
{ "id": "net-inflow", "version": "v0", "measure": "net inflow over 90 days as a share of starting size", "formula": "(size(D) - size(D-90) * (1 + r90)) / size(D-90)", "inputs": ["size", "price"], "window_days": 90, "threshold": { "op": ">=", "value": 2 } }
```

### repo-borrowing

Borrowing through repo, which TEFAS shows as a negative "Repo" share of the
asset allocation.

```json flag
{ "id": "repo-borrowing", "version": "v0", "measure": "Repo share of asset allocation, percent", "formula": "allocation['Repo']", "inputs": ["allocation"], "window_days": 0, "threshold": { "op": "<", "value": -5 } }
```

### free-float-share

How much of an issuer's free float the funds of one manager held together.

```json flag
{ "id": "free-float-share", "version": "v0", "measure": "same-manager funds' combined shares in one issuer / issuer free-float shares", "formula": "max over issuers of sum(nominal) / free_float_shares", "inputs": ["holdings", "free_float"], "window_days": 0, "threshold": { "op": ">=", "value": 0.5 } }
```

No public point-in-time free-float series exists before 14 Sep 2026
(`docs/history-spike.md`, section 4), so this flag reports
`insufficient-data` throughout v0.

### manager-cluster

How many funds of one manager each held at least 10% of their value in the
same issuer.

```json flag
{ "id": "manager-cluster", "version": "v0", "measure": "largest number of same-manager funds each holding >= 10% of value in one issuer", "formula": "max over issuers of count(funds of the manager with weight(issuer) >= 10)", "inputs": ["holdings"], "window_days": 0, "threshold": { "op": ">=", "value": 3 }, "min_weight_percent": 10 }
```

### days-to-exit

How many days of normal trading a holding would take to sell, for holdings
of at least 5% of the fund.

```json flag
{ "id": "days-to-exit", "version": "v0", "measure": "largest holding / 20-day average daily volume, in days, for holdings >= 5% of fund value", "formula": "max over holdings of nominal / avg_daily_volume_20d", "inputs": ["holdings", "volume"], "window_days": 20, "threshold": { "op": ">=", "value": 20 }, "min_weight_percent": 5 }
```

Daily per-share volume is not available for reuse
(`docs/history-spike.md`, section 4), so this flag reports
`insufficient-data` throughout v0.

### reach-vs-type

A qualified-investor ("Serbest") fund with at least 1,000 investors.

```json flag
{ "id": "reach-vs-type", "version": "v0", "measure": "investor count of a fund whose category contains 'Serbest'", "formula": "investors(D) when category(D) contains 'Serbest'", "inputs": ["investors", "category"], "window_days": 0, "threshold": { "op": ">=", "value": 1000 } }
```
