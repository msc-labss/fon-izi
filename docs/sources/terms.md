# Terms check per source

Checked on 16 Nov 2026. This record sets each source's raw-body policy in
`sources.json`:

- `publish`: raw responses may be committed.
- `hash-only`: only extracted fields and the SHA-256 of the response are
  committed.

A source stays `hash-only` until its terms clearly allow republishing.

| Source | robots.txt | Terms found | Policy |
|---|---|---|---|
| TEFAS | pages allowed, `/api/` disallowed | none published; site disclaimer only | `hash-only` |
| KAP | unreadable (HTTP 666 block page, twice) | none for data reuse found | not captured yet |
| SPK | none (404) | none found | not captured yet |
| Internet Archive | none on web.archive.org (404) | terms page needs JavaScript; not read | witness off |

## TEFAS

- **Operator:** Takasbank, at https://www.tefas.gov.tr.
- **robots.txt (16 Nov 2026):** allows `/` and disallows `/api/`,
  `/private/`, `/tefasbuild`, `/_next/` and `/static/` for every agent.
  Fon İzi reads only `/tr/fon-getirileri` and
  `/tr/fon-detayli-analiz/{CODE}`; see `tefas.md`.
- **Terms:** the sitemap lists no terms-of-use page, only a personal data
  notice (`/tr/kisisel-verilerin-korunmasi`) and a cookie notice. Every fund
  page carries a disclaimer, which says that:
  - the data is published by Takasbank, partly from other sources;
  - the information is not investment advice;
  - Takasbank does not guarantee that it is accurate, sufficient, complete
    or current;
  - historical data uses each fund's current title, category and type.
- **Policy:** `hash-only`. Nothing grants permission to republish the
  pages.
- **Open legal question, before the first push:** the archive publishes
  extracted fields for every TEFAS fund every day. Turkish copyright law
  (5846 sayılı FSEK) gives database makers rights against extracting or
  reusing a substantial part of a database. Whether daily extraction of
  these fields counts, and whether the facts themselves are free to
  publish, is a question for a lawyer. Until it is answered, the founder
  decides on the first push (task 1.11).

## KAP

- **Operator:** MKK, at https://www.kap.org.tr.
- **robots.txt:** both requests on 16 Nov 2026 returned HTTP 666 with a
  block page ("erişim problemi", with an error number to report to MKK
  support), while the home page and a fund page returned 200 to the same
  client.
- **What we do about it:** the rules cannot be read, so Fon İzi does not
  capture KAP automatically. Group 2 of the plan decides whether to ask
  MKK; that would be an outward message, so the founder decides.
- **Terms:** no data-use or automated-access terms found. The documents
  KAP publishes for members (the membership and filing directive, a new
  member guide, an e-signature guide) cover filing, not reuse of published
  data.
- **Policy:** not in `sources.json`.

## SPK

- **Operator:** the Capital Markets Board, at https://spk.gov.tr.
- **robots.txt:** none; the request returns SPK's 404 page.
- **Terms:** no terms-of-use page found.
- **Policy:** not in `sources.json` yet. Weekly bulletins are added when
  the crisis fund list is transcribed (task 1.8), as `hash-only` unless a
  legal check clears republishing official bulletins.

## Internet Archive (witness)

- **Role:** used only as a witness through Save Page Now, and only when
  the founder switches witnessing on.
- **robots.txt:** none on web.archive.org (404).
- **Terms:** https://archive.org/about/terms.php renders only with
  JavaScript and could not be read with our tools on 16 Nov 2026.
- **Help page:** the Save Page Now help page
  (https://help.archive.org/help/save-pages-in-the-wayback-machine/) says
  that:
  - it saves a single page per request;
  - it is not for crawling whole sites;
  - submissions are anonymous;
  - Archive-It is the paid service for regular, organised collection.
- **Before witnessing is switched on,** the founder reads the terms in a
  browser and decides (task 1.11).
