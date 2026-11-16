import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { gzipSync } from 'node:zlib';
import { validateArchive, writeDay } from '../src/archive.ts';
import { fileVersions, holdingsRecords, HOLDINGS_GROUP, readAt } from '../src/dump-import.ts';
import { archiveRecords, holdingsTable } from '../src/tables.ts';

const HEADER = 'fonKodu,raporTarihi,kiymetAdi,kiymetAdiHam,bistKodu,ihracci,isin,tur,nominal,rayicDeger,agirlik,kurucuDuzeni,kaynak,listeTam,satirTuru,veriGunu,raporBasligi';
const row = (code: string, bist: string, w: number) => `${code},2026-08,Şirket ${bist},Şirket ${bist},${bist},Şirket ${bist} AŞ,TRE${bist}00011,A) HİSSE SENETLERİ,1000.0,${w * 100}.0,${w},standart,kap,true,,,`;

/** A small git repository shaped like the dump: two versions of one holdings file. */
function fakeDump() {
  const repo = mkdtempSync(join(tmpdir(), 'fon-izi-dump-'));
  const g = (...args: string[]) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t.invalid', ...args], { stdio: 'pipe' });
  g('init', '-q');
  mkdirSync(join(repo, 'arsiv'));
  const path = 'arsiv/fon_icerik_2026-08.csv.gz';
  writeFileSync(join(repo, path), gzipSync([HEADER, row('TLY', 'OZATD', 60), row('TLY', 'SKBNK', 40)].join('\n') + '\n'));
  g('add', '.');
  execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t.invalid', 'commit', '-q', '-m', 'first'], { env: { ...process.env, GIT_COMMITTER_DATE: '2026-09-08T01:29:24Z', GIT_AUTHOR_DATE: '2026-09-08T01:29:24Z' } });
  writeFileSync(join(repo, path), gzipSync([HEADER, row('TLY', 'OZATD', 55), row('TLY', 'SKBNK', 45), row('DOH', 'OZATD', 90)].join('\n') + '\n'));
  g('add', '.');
  execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t.invalid', 'commit', '-q', '-m', 'second'], { env: { ...process.env, GIT_COMMITTER_DATE: '2026-09-20T10:00:00Z', GIT_AUTHOR_DATE: '2026-09-20T10:00:00Z' } });
  return { repo, path };
}

test('each fund-month is imported once, at the first commit that contains it', () => {
  const { repo, path } = fakeDump();
  const versions = fileVersions(repo, path);
  assert.deepEqual(versions.map((v) => v.time), ['2026-09-08T01:29:24.000Z', '2026-09-20T10:00:00.000Z']);
  const byDay = holdingsRecords(path, versions, readAt(repo, path));
  const recs = [...byDay.values()].flat().map((l) => JSON.parse(l));
  assert.deepEqual(recs.map((r) => `${r.data.code}@${r.capturedAt}`).sort(), ['DOH@2026-09-20T10:00:00.000Z', 'TLY@2026-09-08T01:29:24.000Z']);
  const tly = recs.find((r) => r.data.code === 'TLY');
  assert.equal(tly.data.holdings[0].weight, 60); // the first version, not the later revision
  assert.equal(tly.origin, 'backfill');
  assert.equal(tly.publishedAt, null);
  assert.match(tly.sourceUrl, /^https:\/\/raw\.githubusercontent\.com\/sercannnnn\/fon-analiz-veri\/[0-9a-f]{40}\/arsiv\/fon_icerik_2026-08\.csv\.gz$/);
  assert.match(tly.witness.url, /^https:\/\/github\.com\/sercannnnn\/fon-analiz-veri\/blob\/[0-9a-f]{40}\//);
});

test('holding traced to its report: every row carries a record id that resolves in the archive', () => {
  const { repo, path } = fakeDump();
  const root = mkdtempSync(join(tmpdir(), 'fon-izi-arch-'));
  for (const [day, lines] of holdingsRecords(path, fileVersions(repo, path), readAt(repo, path))) writeDay(root, HOLDINGS_GROUP, day, lines);
  assert.deepEqual(validateArchive(root).errors, []);
  const ids = new Set([...archiveRecords(root)].map((r) => r.id));
  const rows = holdingsTable(archiveRecords(root));
  assert.equal(rows.length, 3);
  for (const r of rows) assert.ok(ids.has(String(r.report_record_id)));
  assert.deepEqual(rows.filter((r) => r.fund_code === 'TLY').map((r) => [r.bist_code, r.weight_percent, r.available_at]), [
    ['OZATD', 60, '2026-09-08T01:29:24.000Z'],
    ['SKBNK', 40, '2026-09-08T01:29:24.000Z'],
  ]);
});

test('a BIST code missing from an early report is filled from the ISIN, and marked so', () => {
  const rec = (code: string, holdings: unknown[]) => ({ id: code, kind: 'holdings-report', capturedAt: '2026-09-08T06:17:16.000Z', publishedAt: null, data: { code, reportMonth: '2026-08', holdings } });
  const rows = holdingsTable([
    rec('TLY', [{ issuer: 'raw text', bistCode: null, isin: 'TREOZAT00023', assetType: 'Hisse', nominal: 1, marketValue: 1, weight: 26.43 }]),
    rec('DOH', [{ issuer: 'Özata', bistCode: 'OZATD', isin: 'TREOZAT00023', assetType: 'Hisse', nominal: 1, marketValue: 1, weight: 50 }]),
  ] as never);
  const tly = rows.find((r) => r.fund_code === 'TLY')!;
  assert.equal(tly.bist_code, 'OZATD');
  assert.equal(tly.bist_code_source, 'isin-map');
  assert.equal(rows.find((r) => r.fund_code === 'DOH')!.bist_code_source, 'report');
});
