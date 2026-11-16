# Table schemas

One block per table: each column's name, type, unit, source, whether it can be empty, and, for a column that names or codes an entity, which kind (fund, manager, issuer). Tables name legal entities only; a column for a natural person is not allowed. `npm test` checks every committed table against its block.

### event-set

`events/2026-fund-crisis.csv`

```json schema
{
 "table": "event-set",
 "file": "events/2026-fund-crisis.csv",
 "columns": [
  {
   "name": "fund_code",
   "type": "string",
   "unit": "",
   "source": "TEFAS fund list, matched by title",
   "nullable": false,
   "identifies": true,
   "entity": "fund"
  },
  {
   "name": "list_number",
   "type": "integer",
   "unit": "",
   "source": "SPK bulletin 2026/61 numbered list",
   "nullable": false,
   "identifies": false
  },
  {
   "name": "fund_title",
   "type": "string",
   "unit": "",
   "source": "SPK bulletin 2026/61",
   "nullable": false,
   "identifies": true,
   "entity": "fund"
  },
  {
   "name": "manager",
   "type": "string",
   "unit": "",
   "source": "fund title, up to \"PORTFÖY\"",
   "nullable": false,
   "identifies": true,
   "entity": "manager"
  },
  {
   "name": "event",
   "type": "string",
   "unit": "",
   "source": "curated",
   "nullable": false,
   "identifies": false
  },
  {
   "name": "event_date",
   "type": "date",
   "unit": "",
   "source": "SPK decision date",
   "nullable": false,
   "identifies": false
  },
  {
   "name": "source_published",
   "type": "date",
   "unit": "",
   "source": "SPK bulletin list",
   "nullable": false,
   "identifies": false
  },
  {
   "name": "source_url",
   "type": "string",
   "unit": "",
   "source": "SPK",
   "nullable": false,
   "identifies": false
  },
  {
   "name": "source_bulletin",
   "type": "string",
   "unit": "",
   "source": "SPK",
   "nullable": false,
   "identifies": false
  },
  {
   "name": "source_page",
   "type": "integer",
   "unit": "",
   "source": "SPK bulletin PDF page",
   "nullable": false,
   "identifies": false
  },
  {
   "name": "match",
   "type": "string",
   "unit": "",
   "source": "how the code was matched",
   "nullable": false,
   "identifies": false
  }
 ]
}
```

### timeline

`events/2026-timeline.csv`

```json schema
{
 "table": "timeline",
 "file": "events/2026-timeline.csv",
 "columns": [
  {
   "name": "event_date",
   "type": "date",
   "unit": "",
   "source": "SPK bulletin date",
   "nullable": false,
   "identifies": false
  },
  {
   "name": "published_on",
   "type": "date",
   "unit": "",
   "source": "SPK bulletin list",
   "nullable": true,
   "identifies": false
  },
  {
   "name": "entity_type",
   "type": "string",
   "unit": "",
   "source": "curated: manager, fund, issuer or market",
   "nullable": false,
   "identifies": false
  },
  {
   "name": "entity",
   "type": "string",
   "unit": "",
   "source": "SPK bulletin",
   "nullable": false,
   "identifies": true,
   "entity": "manager"
  },
  {
   "name": "fund_codes",
   "type": "list",
   "unit": "",
   "source": "TEFAS codes, ';'-separated",
   "nullable": true,
   "identifies": true,
   "entity": "fund"
  },
  {
   "name": "issuer_code",
   "type": "string",
   "unit": "",
   "source": "BIST code",
   "nullable": true,
   "identifies": true,
   "entity": "issuer"
  },
  {
   "name": "event",
   "type": "string",
   "unit": "",
   "source": "curated slug",
   "nullable": false,
   "identifies": false
  },
  {
   "name": "description",
   "type": "string",
   "unit": "",
   "source": "curated, neutral English",
   "nullable": false,
   "identifies": false
  },
  {
   "name": "decision_ref",
   "type": "string",
   "unit": "",
   "source": "SPK decision number",
   "nullable": true,
   "identifies": false
  },
  {
   "name": "source_url",
   "type": "string",
   "unit": "",
   "source": "SPK",
   "nullable": false,
   "identifies": false
  },
  {
   "name": "source_bulletin",
   "type": "string",
   "unit": "",
   "source": "SPK",
   "nullable": false,
   "identifies": false
  },
  {
   "name": "source_page",
   "type": "integer",
   "unit": "",
   "source": "SPK bulletin PDF page",
   "nullable": false,
   "identifies": false
  }
 ]
}
```

### history-coverage

`docs/history-coverage.csv`

```json schema
{
 "table": "history-coverage",
 "file": "docs/history-coverage.csv",
 "columns": [
  {
   "name": "fund_code",
   "type": "string",
   "unit": "",
   "source": "TEFAS",
   "nullable": false,
   "identifies": true,
   "entity": "fund"
  },
  {
   "name": "group",
   "type": "string",
   "unit": "",
   "source": "event or control",
   "nullable": false,
   "identifies": false
  },
  {
   "name": "stratum",
   "type": "string",
   "unit": "",
   "source": "TEFAS umbrella type",
   "nullable": false,
   "identifies": false
  },
  {
   "name": "month",
   "type": "string",
   "unit": "YYYY-MM",
   "source": "",
   "nullable": false,
   "identifies": false
  },
  {
   "name": "old_captures",
   "type": "integer",
   "unit": "count",
   "source": "Internet Archive CDX",
   "nullable": false,
   "identifies": false
  },
  {
   "name": "old_usable",
   "type": "integer",
   "unit": "count",
   "source": "Internet Archive CDX",
   "nullable": false,
   "identifies": false
  },
  {
   "name": "new_captures",
   "type": "integer",
   "unit": "count",
   "source": "Internet Archive CDX",
   "nullable": false,
   "identifies": false
  },
  {
   "name": "new_usable",
   "type": "integer",
   "unit": "count",
   "source": "Internet Archive CDX",
   "nullable": false,
   "identifies": false
  },
  {
   "name": "first_usable",
   "type": "string",
   "unit": "archive timestamp",
   "source": "Internet Archive CDX",
   "nullable": true,
   "identifies": false
  }
 ]
}
```

### holdings

`tables/holdings.csv`

```json schema
{
 "table": "holdings",
 "file": "tables/holdings.csv",
 "columns": [
  {
   "name": "fund_code",
   "type": "string",
   "unit": "",
   "source": "holdings report",
   "nullable": false,
   "identifies": true,
   "entity": "fund"
  },
  {
   "name": "report_month",
   "type": "string",
   "unit": "YYYY-MM",
   "source": "holdings report",
   "nullable": false,
   "identifies": false
  },
  {
   "name": "issuer",
   "type": "string",
   "unit": "",
   "source": "holdings report text",
   "nullable": true,
   "identifies": true,
   "entity": "issuer"
  },
  {
   "name": "bist_code",
   "type": "string",
   "unit": "",
   "source": "holdings report, or ISIN map",
   "nullable": true,
   "identifies": true,
   "entity": "issuer"
  },
  {
   "name": "bist_code_source",
   "type": "string",
   "unit": "",
   "source": "report or isin-map",
   "nullable": true,
   "identifies": false
  },
  {
   "name": "isin",
   "type": "string",
   "unit": "",
   "source": "holdings report",
   "nullable": true,
   "identifies": true,
   "entity": "issuer"
  },
  {
   "name": "asset_type",
   "type": "string",
   "unit": "",
   "source": "holdings report",
   "nullable": true,
   "identifies": false
  },
  {
   "name": "nominal",
   "type": "number",
   "unit": "units",
   "source": "holdings report",
   "nullable": true,
   "identifies": false
  },
  {
   "name": "market_value",
   "type": "number",
   "unit": "TL",
   "source": "holdings report",
   "nullable": true,
   "identifies": false
  },
  {
   "name": "weight_percent",
   "type": "number",
   "unit": "percent of fund value",
   "source": "holdings report",
   "nullable": true,
   "identifies": false
  },
  {
   "name": "available_at",
   "type": "datetime",
   "unit": "ISO 8601 UTC",
   "source": "record publication or capture time",
   "nullable": false,
   "identifies": false
  },
  {
   "name": "report_record_id",
   "type": "string",
   "unit": "SHA-256",
   "source": "archive record id",
   "nullable": false,
   "identifies": false
  }
 ]
}
```

### issuers

`tables/issuers.csv`

```json schema
{
 "table": "issuers",
 "file": "tables/issuers.csv",
 "columns": [
  {
   "name": "bist_code",
   "type": "string",
   "unit": "",
   "source": "holdings",
   "nullable": false,
   "identifies": true,
   "entity": "issuer"
  },
  {
   "name": "issuer_names",
   "type": "string",
   "unit": "",
   "source": "holdings report text",
   "nullable": true,
   "identifies": true,
   "entity": "issuer"
  },
  {
   "name": "isins",
   "type": "list",
   "unit": "",
   "source": "';'-separated",
   "nullable": true,
   "identifies": true,
   "entity": "issuer"
  },
  {
   "name": "free_float_shares",
   "type": "number",
   "unit": "shares",
   "source": "none in v0",
   "nullable": true,
   "identifies": false
  },
  {
   "name": "free_float_source",
   "type": "string",
   "unit": "",
   "source": "why free float is empty",
   "nullable": false,
   "identifies": false
  },
  {
   "name": "first_available_at",
   "type": "datetime",
   "unit": "ISO 8601 UTC",
   "source": "holdings",
   "nullable": false,
   "identifies": false
  },
  {
   "name": "report_record_ids",
   "type": "list",
   "unit": "SHA-256",
   "source": "archive record ids, ';'-separated",
   "nullable": false,
   "identifies": false
  }
 ]
}
```

### flag-results

`tables/flags-<date>.csv`

```json schema
{
 "table": "flag-results",
 "file": "tables/flags-<date>.csv",
 "columns": [
  {
   "name": "fund_code",
   "type": "string",
   "unit": "",
   "source": "TEFAS",
   "nullable": false,
   "identifies": true,
   "entity": "fund"
  },
  {
   "name": "date",
   "type": "date",
   "unit": "",
   "source": "evaluation date",
   "nullable": false,
   "identifies": false
  },
  {
   "name": "flag",
   "type": "string",
   "unit": "",
   "source": "METHOD.md flag id",
   "nullable": false,
   "identifies": false
  },
  {
   "name": "method_version",
   "type": "string",
   "unit": "",
   "source": "METHOD.md",
   "nullable": false,
   "identifies": false
  },
  {
   "name": "status",
   "type": "string",
   "unit": "",
   "source": "ok or insufficient-data",
   "nullable": false,
   "identifies": false
  },
  {
   "name": "value",
   "type": "number",
   "unit": "see METHOD.md",
   "source": "flag engine",
   "nullable": true,
   "identifies": false
  },
  {
   "name": "threshold",
   "type": "string",
   "unit": "",
   "source": "METHOD.md",
   "nullable": false,
   "identifies": false
  },
  {
   "name": "triggered",
   "type": "boolean",
   "unit": "",
   "source": "flag engine",
   "nullable": true,
   "identifies": false
  },
  {
   "name": "inputs",
   "type": "list",
   "unit": "SHA-256",
   "source": "archive record ids, ';'-separated",
   "nullable": true,
   "identifies": false
  },
  {
   "name": "note",
   "type": "string",
   "unit": "",
   "source": "flag engine",
   "nullable": true,
   "identifies": false
  }
 ]
}
```

### record-coverage

`tables/record-coverage.csv`

```json schema
{
 "table": "record-coverage",
 "file": "tables/record-coverage.csv",
 "columns": [
  {
   "name": "fund_code",
   "type": "string",
   "unit": "",
   "source": "TEFAS",
   "nullable": false,
   "identifies": true,
   "entity": "fund"
  },
  {
   "name": "field",
   "type": "string",
   "unit": "",
   "source": "archive field",
   "nullable": false,
   "identifies": false
  },
  {
   "name": "month",
   "type": "string",
   "unit": "YYYY-MM",
   "source": "",
   "nullable": false,
   "identifies": false
  },
  {
   "name": "records",
   "type": "integer",
   "unit": "count",
   "source": "archive",
   "nullable": false,
   "identifies": false
  }
 ]
}
```

### backtest-leadtimes

`tables/backtest-leadtimes.csv`

```json schema
{
 "table": "backtest-leadtimes",
 "file": "tables/backtest-leadtimes.csv",
 "columns": [
  {
   "name": "code",
   "type": "string",
   "unit": "",
   "source": "event set",
   "nullable": false,
   "identifies": true,
   "entity": "fund"
  },
  {
   "name": "flag",
   "type": "string",
   "unit": "",
   "source": "METHOD.md flag id",
   "nullable": false,
   "identifies": false
  },
  {
   "name": "event",
   "type": "string",
   "unit": "",
   "source": "event set",
   "nullable": false,
   "identifies": false
  },
  {
   "name": "status",
   "type": "string",
   "unit": "",
   "source": "lead, never or insufficient-data",
   "nullable": false,
   "identifies": false
  },
  {
   "name": "since",
   "type": "date",
   "unit": "",
   "source": "first grid date of the streak",
   "nullable": true,
   "identifies": false
  },
  {
   "name": "days",
   "type": "integer",
   "unit": "days",
   "source": "event date minus since",
   "nullable": true,
   "identifies": false
  }
 ]
}
```

### backtest-control-weekly

`tables/backtest-control-weekly.csv`

```json schema
{
 "table": "backtest-control-weekly",
 "file": "tables/backtest-control-weekly.csv",
 "columns": [
  {
   "name": "flag",
   "type": "string",
   "unit": "",
   "source": "METHOD.md flag id",
   "nullable": false,
   "identifies": false
  },
  {
   "name": "date",
   "type": "date",
   "unit": "",
   "source": "grid date",
   "nullable": false,
   "identifies": false
  },
  {
   "name": "ok",
   "type": "integer",
   "unit": "count",
   "source": "control funds with data on the date",
   "nullable": false,
   "identifies": false
  },
  {
   "name": "triggered",
   "type": "integer",
   "unit": "count",
   "source": "control funds the flag fired for on the date",
   "nullable": false,
   "identifies": false
  }
 ]
}
```
