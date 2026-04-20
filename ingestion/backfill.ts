#!/usr/bin/env tsx
// GFW historical backfill for the Strait of Hormuz.
//
// Data source: GFW 4Wings presence report (POST /v3/4wings/report).
// One API call per day yields ~3000 vessel-day records for the Hormuz bbox.
//
// Position resolution: daily centroids, NOT raw AIS pings.
//   Each row in `positions` (source='gfw') represents one vessel's presence
//   centroid on a given day. ts=entryTimestamp, lat/lon=GFW-reported centroid.
//   sog and cog are null — GFW does not expose per-ping speed/course in the
//   presence dataset. The live AIS feed (source='ais_live') populates positions
//   at full ping resolution; the two sources are intentionally mixed.
//
// Vessel type filtering: keeps vesselType === 'CARGO' only.
//   GFW's presence dataset has no TANKER subtype. 'CARGO' is the narrowest
//   available filter and includes bulk carriers alongside crude tankers.
//   DWT filtering is not possible: the identity API does not expose DWT, and
//   tonnageGt coverage is ~20% of vessels. Documented limitation.
//
// Usage: pnpm ingest:backfill [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--dry-run]

import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { makeLogger } from '../lib/ingestion/logger';
import { getServiceClient } from '../lib/db/service-client';
import { normalizeFlag } from '../lib/util/flags';

const log = makeLogger('backfill');

const GFW_BASE         = 'https://gateway.api.globalfishingwatch.org/v3';
const GFW_DATASET      = 'public-global-presence:latest';
const RATE_LIMIT_MS    = 250;        // 4 req/s
const FETCH_TIMEOUT_MS = 60_000;
const BATCH_SIZE       = 500;
const CURSOR_PATH      = '.backfill-cursor.json';

// Confirmed 4Wings vesselType taxonomy for this bbox:
//   OTHER(~1534), CARGO(~929), GEAR(~295), FISHING(~214), PASSENGER(~83), BUNKER(~16)
// We keep only CARGO; all others are clearly non-tanker.
const KEEP_VESSEL_TYPE = 'CARGO';

// Hormuz GeoJSON polygon (lon, lat order per spec, closing ring)
const HORMUZ_GEOJSON = {
  type: 'Polygon' as const,
  coordinates: [
    [[55.5, 25.5], [58.5, 25.5], [58.5, 27.0], [55.5, 27.0], [55.5, 25.5]],
  ],
};

// ── Types ─────────────────────────────────────────────────────────────────────

// Confirmed field set from 4Wings response (verified 2026-04-20):
// callsign, dataset, date, entryTimestamp, exitTimestamp, firstTransmissionDate,
// flag (ISO3), geartype, hours, imo, lastTransmissionDate, lat, lon, mmsi,
// shipName, vesselId, vesselType
interface FourWingsEntry {
  vesselId?: string;
  mmsi?: string;
  imo?: string;
  shipName?: string;
  callsign?: string;
  flag?: string;
  geartype?: string;
  vesselType?: string;
  date?: string;
  entryTimestamp?: string;
  exitTimestamp?: string;
  lat?: number;
  lon?: number;
  hours?: number;
}

interface Cursor {
  processed_dates: string[];
}

// ── Args ──────────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  let from   = '2026-01-01';
  let to     = '2026-02-27';
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

// ── Cursor ────────────────────────────────────────────────────────────────────

function loadCursor(): Cursor {
  if (existsSync(CURSOR_PATH)) {
    try {
      return JSON.parse(readFileSync(CURSOR_PATH, 'utf-8')) as Cursor;
    } catch {
      log.warn('cursor_parse_failed', { path: CURSOR_PATH });
    }
  }
  return { processed_dates: [] };
}

function saveCursor(cursor: Cursor): void {
  writeFileSync(CURSOR_PATH, JSON.stringify(cursor, null, 2));
}

// ── Rate-limited fetch ────────────────────────────────────────────────────────

let lastGfwRequestAt = 0;

async function gfwFetch(
  path: string,
  token: string,
  options: { method?: 'GET' | 'POST'; body?: unknown } = {},
): Promise<unknown> {
  const elapsed = Date.now() - lastGfwRequestAt;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise<void>((r) => setTimeout(r, RATE_LIMIT_MS - elapsed));
  }
  lastGfwRequestAt = Date.now();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const method = options.method ?? 'GET';
    const res = await fetch(`${GFW_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });

    if (res.status === 429) {
      log.warn('rate_limited', { path, retry_in_ms: 2000 });
      await new Promise<void>((r) => setTimeout(r, 2000));
      return gfwFetch(path, token, options);
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GFW HTTP ${res.status} ${path}: ${text.slice(0, 200)}`);
    }
    return res.json();
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`GFW request timed out after ${FETCH_TIMEOUT_MS}ms: ${path}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ── 4Wings report ─────────────────────────────────────────────────────────────

// Confirmed response shape (verified 2026-04-20):
//   { entries: [ { "public-global-presence:v4.0": FourWingsEntry[] } ], total: 1 }
// All ~3071 records for a 1-day bbox query arrive in a single response (total=1,
// no nextOffset). URLSearchParams encodes '[' as '%5B' which GFW accepts.
function parseFourWingsEntries(raw: unknown): FourWingsEntry[] {
  if (!raw || typeof raw !== 'object') {
    log.warn('four_wings_parse_not_object', { type: typeof raw });
    return [];
  }
  const obj = raw as Record<string, unknown>;
  const outerEntries = obj['entries'];
  if (Array.isArray(outerEntries) && outerEntries.length > 0) {
    const first = outerEntries[0] as Record<string, unknown>;
    for (const key of Object.keys(first)) {
      const val = first[key];
      if (Array.isArray(val) && val.length > 0) return val as FourWingsEntry[];
      if (Array.isArray(val)) return [];  // empty inner array — GFW data not yet available
    }
  }
  if (Array.isArray(raw)) return raw as FourWingsEntry[];
  log.warn('four_wings_parse_unknown_shape', { keys: Object.keys(obj).join(',') });
  return [];
}

function nextDateStr(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function fetchDayReport(date: string, token: string): Promise<FourWingsEntry[]> {
  const end = nextDateStr(date);
  const params = new URLSearchParams({
    format: 'JSON',
    'date-range': `${date},${end}`,
    'spatial-resolution': 'HIGH',
    'temporal-resolution': 'DAILY',
    'group-by': 'VESSEL_ID',
  });
  params.set('datasets[0]', GFW_DATASET);

  const raw = await gfwFetch(
    `/4wings/report?${params.toString()}`,
    token,
    { method: 'POST', body: { geojson: HORMUZ_GEOJSON } },
  );
  return parseFourWingsEntries(raw);
}

// ── Per-entry processing ──────────────────────────────────────────────────────

interface ReadyEntry {
  mmsi: string;
  imo: string | null;
  name: string | null;
  callsign: string | null;
  flagIso2: string;
  vesselType: string;
  ts: string;
  lat: number;
  lon: number;
}

function toReadyEntry(e: FourWingsEntry): ReadyEntry | null {
  if (!e.mmsi) return null;
  if (e.vesselType !== KEEP_VESSEL_TYPE) return null;
  if (e.lat === undefined || e.lon === undefined) return null;

  const ts = e.entryTimestamp
    ? new Date(e.entryTimestamp).toISOString()
    : (e.date ? `${e.date}T00:00:00.000Z` : new Date().toISOString());

  return {
    mmsi:       e.mmsi,
    imo:        e.imo        ?? null,
    name:       e.shipName   ?? null,
    callsign:   e.callsign   ?? null,
    flagIso2:   normalizeFlag(e.flag),
    vesselType: e.vesselType,
    ts,
    lat:        e.lat,
    lon:        e.lon,
  };
}

// ── Database writes ───────────────────────────────────────────────────────────

async function upsertVessels(entries: ReadyEntry[], dryRun: boolean): Promise<number> {
  const seen = new Map<string, typeof rows[number]>();
  const rows = entries.map((e) => ({
    mmsi:        e.mmsi,
    imo:         e.imo,
    name:        e.name,
    flag:        e.flagIso2,
    vessel_type: e.vesselType,
    updated_at:  new Date().toISOString(),
  }));
  for (const r of rows) seen.set(r.mmsi, r);
  const deduped = [...seen.values()];

  if (dryRun) {
    log.info('dry_run_vessel_upsert', { count: deduped.length });
    return deduped.length;
  }

  const db = getServiceClient();
  for (let i = 0; i < deduped.length; i += BATCH_SIZE) {
    const batch = deduped.slice(i, i + BATCH_SIZE);
    const { error } = await db.from('vessels').upsert(batch, { onConflict: 'mmsi' });
    if (error) log.warn('vessel_upsert_warn', { batch_start: i, error: error.message });
  }
  return deduped.length;
}

async function insertPositions(entries: ReadyEntry[], dryRun: boolean): Promise<number> {
  if (entries.length === 0) return 0;
  const rows = entries.map((e) => ({
    mmsi:   e.mmsi,
    ts:     e.ts,
    lat:    e.lat,
    lon:    e.lon,
    sog:    null as number | null,
    cog:    null as number | null,
    draft:  null as number | null,
    source: 'gfw' as const,
  }));

  if (dryRun) {
    log.info('dry_run_positions', { count: rows.length });
    return rows.length;
  }

  const db = getServiceClient();
  let written = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await db.from('positions').insert(batch);
    if (error) {
      log.warn('position_insert_warn', { batch_start: i, error: error.message });
    } else {
      written += batch.length;
    }
  }
  return written;
}

async function upsertRollups(date: string, entries: ReadyEntry[], dryRun: boolean): Promise<void> {
  if (entries.length === 0) return;

  const byMmsi = new Map<string, string>();   // mmsi → flagIso2
  for (const e of entries) {
    if (!byMmsi.has(e.mmsi)) byMmsi.set(e.mmsi, e.flagIso2);
  }

  const vessel_count = byMmsi.size;
  const rawByFlag: Record<string, number> = {};
  for (const flag of byMmsi.values()) {
    rawByFlag[flag] = (rawByFlag[flag] ?? 0) + 1;
  }
  // Sort keys alphabetically so JSON diffs are stable across runs
  const by_flag: Record<string, number> = Object.fromEntries(
    Object.keys(rawByFlag).sort().map((k) => [k, rawByFlag[k] as number]),
  );

  if (dryRun) {
    log.info('dry_run_rollup', { date, vessel_count, flag_keys: Object.keys(by_flag) });
    return;
  }

  const db = getServiceClient();
  const { error: te } = await db
    .from('daily_transits')
    .upsert({ date, vessel_count, by_flag, avg_draft: null }, { onConflict: 'date' });
  if (te) log.warn('daily_transits_warn', { date, error: te.message });

  const flagRows = Object.entries(by_flag).map(([flag, count]) => ({
    date, flag, count,
    share: vessel_count > 0 ? count / vessel_count : 0,
  }));
  const { error: fe } = await db
    .from('flag_mix_daily')
    .upsert(flagRows, { onConflict: 'date,flag' });
  if (fe) log.warn('flag_mix_daily_warn', { date, error: fe.message });
}

// ── Date range helper ─────────────────────────────────────────────────────────

function dateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const cur = new Date(from + 'T00:00:00Z');
  const end = new Date(to   + 'T00:00:00Z');
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const { from, to, dryRun } = parseArgs();
  const token = process.env['GFW_API_TOKEN'];
  if (!token) throw new Error('Missing env var: GFW_API_TOKEN');

  log.info('start', { from, to, dry_run: dryRun });

  const cursor       = loadCursor();
  const processedSet = new Set(cursor.processed_dates);
  const days         = dateRange(from, to);

  let totalPositions = 0;
  let totalVessels   = 0;

  for (const date of days) {
    if (processedSet.has(date)) {
      log.debug('date_skip', { date });
      continue;
    }

    let raw: FourWingsEntry[] = [];
    try {
      raw = await fetchDayReport(date, token);
    } catch (err) {
      log.warn('report_fetch_failed', {
        date,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;   // leave date unprocessed so it retries on next run
    }

    const kept: ReadyEntry[] = [];
    for (const e of raw) {
      const r = toReadyEntry(e);
      if (r) kept.push(r);
    }

    const vesselsUpserted = await upsertVessels(kept, dryRun);
    const positionsWritten = await insertPositions(kept, dryRun);
    await upsertRollups(date, kept, dryRun);

    totalPositions += positionsWritten;
    totalVessels   += vesselsUpserted;

    // Top-5 flags by vessel count — spot-check that real ISO2 codes appear (PA, LR, CN, etc.)
    const flagCounts: Record<string, number> = {};
    for (const e of kept) flagCounts[e.flagIso2] = (flagCounts[e.flagIso2] ?? 0) + 1;
    const top5Flags = Object.entries(flagCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([flag, count]) => `${flag}:${count}`)
      .join(' ');

    // Per-day spot-check signal
    log.info('day_summary', {
      day:                        date,
      vessels_received:           raw.length,
      vessels_kept_after_filter:  kept.length,
      positions_written:          positionsWritten,
      vessels_upserted:           vesselsUpserted,
      top5_flags:                 top5Flags,
    });

    if (!dryRun) {
      cursor.processed_dates.push(date);
      saveCursor(cursor);
    }
    processedSet.add(date);
  }

  log.info('done', {
    days_processed:   processedSet.size,
    total_positions:  totalPositions,
    total_vessels:    totalVessels,
  });
}

main().catch((err: unknown) => {
  log.error('fatal', { message: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
