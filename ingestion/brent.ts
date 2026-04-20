#!/usr/bin/env tsx
// Pulls Brent (DCOILBRENTEU) and WTI (DCOILWTICO) daily closes from the FRED API
// and upserts into petrodollar_daily with source='fred'.
// Usage: pnpm ingest:brent [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--dry-run]

import { makeLogger } from '../lib/ingestion/logger';
import { getServiceClient } from '../lib/db/service-client';

const log = makeLogger('brent');

function parseArgs() {
  const args = process.argv.slice(2);
  const today = new Date().toISOString().slice(0, 10) as string;
  let from = '2025-12-01';
  let to = today;
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue;
    if ((arg === '--from' || arg === '--to') && i + 1 < args.length) {
      const val = args[i + 1];
      if (val) {
        if (arg === '--from') from = val;
        else to = val;
        i++;
      }
    } else if (arg === '--dry-run') {
      dryRun = true;
    }
  }
  return { from, to, dryRun };
}

interface FredObs { date: string; value: string }
interface FredResponse { observations: FredObs[] }

async function fetchSeries(
  seriesId: string,
  apiKey: string,
  from: string,
  to: string,
): Promise<FredObs[]> {
  const url = new URL('https://api.stlouisfed.org/fred/series/observations');
  url.searchParams.set('series_id', seriesId);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('file_type', 'json');
  url.searchParams.set('observation_start', from);
  url.searchParams.set('observation_end', to);
  url.searchParams.set('sort_order', 'asc');
  url.searchParams.set('limit', '10000');
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`FRED ${seriesId} HTTP ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as FredResponse;
  return body.observations;
}

async function main() {
  const { from, to, dryRun } = parseArgs();
  const apiKey = process.env['FRED_API_KEY'];
  if (!apiKey) throw new Error('Missing env var: FRED_API_KEY');

  log.info('start', { from, to, dry_run: dryRun });

  const [brentRaw, wtiRaw] = await Promise.all([
    fetchSeries('DCOILBRENTEU', apiKey, from, to),
    fetchSeries('DCOILWTICO', apiKey, from, to),
  ]);
  log.info('fetched', { brent_obs: brentRaw.length, wti_obs: wtiRaw.length });

  // Merge both series by date, skipping FRED sentinel '.' (missing data).
  const byDate = new Map<string, { brent_usd: number | null; wti_usd: number | null }>();
  for (const obs of brentRaw) {
    if (obs.value === '.') continue;
    byDate.set(obs.date, { brent_usd: parseFloat(obs.value), wti_usd: null });
  }
  for (const obs of wtiRaw) {
    if (obs.value === '.') continue;
    const row = byDate.get(obs.date);
    if (row) {
      row.wti_usd = parseFloat(obs.value);
    } else {
      byDate.set(obs.date, { brent_usd: null, wti_usd: parseFloat(obs.value) });
    }
  }

  const rows = [...byDate.entries()].map(([date, v]) => ({
    date,
    brent_usd: v.brent_usd,
    wti_usd: v.wti_usd,
    source: 'fred',
  }));
  log.info('rows_ready', { count: rows.length });

  if (dryRun) {
    for (const row of rows.slice(0, 3)) log.info('dry_run_sample', { row });
    log.info('dry_run_done', { would_upsert: rows.length });
    return;
  }

  const db = getServiceClient();
  const BATCH = 200;
  let upserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await db
      .from('petrodollar_daily')
      .upsert(batch, { onConflict: 'date' });
    if (error) throw new Error(`Upsert failed at offset ${i}: ${error.message}`);
    upserted += batch.length;
    log.info('batch_done', { upserted, total: rows.length });
  }
  log.info('done', { upserted });
}

main().catch((err: unknown) => {
  log.error('fatal', { message: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
