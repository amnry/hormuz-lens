import 'server-only';
import { z } from 'zod/v4';
import { getServiceClient } from './service-client';
import { toIsoDate, subtractDays, todayUtc } from '../util/date-range';
import { GULF_FLAGS_UI } from '../util/flags';

const db = () => getServiceClient();

// ── Schemas ───────────────────────────────────────────────────────────────────

const DailyTransitRow = z.object({
  date:         z.string(),
  vessel_count: z.number(),
  by_flag:      z.record(z.string(), z.number()),
});
export type DailyTransitRow = z.infer<typeof DailyTransitRow>;

const BrentRow = z.object({
  date:      z.string(),
  brent_usd: z.number().nullable(),
});
export type BrentRow = z.infer<typeof BrentRow>;

const FlagMixRow = z.object({
  flag_iso2: z.string(),
  count:     z.number(),
  share:     z.number(),
});
export type FlagMixRow = z.infer<typeof FlagMixRow>;

const PositionRow = z.object({
  mmsi:      z.string(),
  lat:       z.number(),
  lon:       z.number(),
  ts:        z.string(),
  flag_iso2: z.string().nullable(),
  name:      z.string().nullable(),
});
export type PositionRow = z.infer<typeof PositionRow>;

const KpiSnapshot = z.object({
  active_vessels:       z.number(),
  transits_24h:         z.number(),
  transits_24h_delta:   z.number().nullable(),
  avg_daily_30d:        z.number().nullable(),
  avg_daily_30d_delta:  z.number().nullable(),
  crude_mbd_est:        z.number(),
  closure_status:       z.enum(['OPEN', 'PARTIAL', 'CLOSED']).nullable(),
  closure_since:        z.string().nullable(),
});
export type KpiSnapshot = z.infer<typeof KpiSnapshot>;

const ClosureEvent = z.object({
  id:          z.string(),
  kind:        z.string(),
  title:       z.string(),
  ts:          z.string(),
  description: z.string().nullable(),
});
export type ClosureEvent = z.infer<typeof ClosureEvent>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function throwOnError<T>(data: T | null, error: { message: string } | null): T {
  if (error) throw new Error(error.message);
  if (data === null) throw new Error('Query returned null');
  return data;
}

// ── Queries ───────────────────────────────────────────────────────────────────

export async function getDailyTransits(from: Date, to: Date): Promise<DailyTransitRow[]> {
  const { data, error } = await db()
    .from('daily_transits')
    .select('date, vessel_count, by_flag')
    .gte('date', toIsoDate(from))
    .lte('date', toIsoDate(to))
    .order('date', { ascending: true });

  throwOnError(data, error);
  return z.array(DailyTransitRow).parse(
    (data ?? []).map((r) => ({ ...r, by_flag: r.by_flag as Record<string, number> })),
  );
}

export async function getBrentSeries(from: Date, to: Date): Promise<BrentRow[]> {
  const { data, error } = await db()
    .from('petrodollar_daily')
    .select('date, brent_usd')
    .gte('date', toIsoDate(from))
    .lte('date', toIsoDate(to))
    .order('date', { ascending: true });

  throwOnError(data, error);
  return z.array(BrentRow).parse(data ?? []);
}

export async function getFlagMixForRange(from: Date, to: Date): Promise<FlagMixRow[]> {
  // Fetches flag_mix_daily rows and collapses non-Gulf flags into 'OT' in JS.
  //
  // The SQL equivalent would use:
  //   CASE WHEN flag IN (...gulf list...) THEN flag ELSE 'OT' END AS flag_iso2,
  //   SUM(count) AS count,
  //   SUM(SUM(count)) OVER () as grand_total   -- window on top of aggregate
  // with HAVING SUM(count) > 0 to drop zero-transit artifact rows.
  //
  // Implemented in JS to avoid requiring a DB migration for the RPC function.
  return getFlagMixFallback(from, to);
}

// Fetches flag_mix_daily rows and aggregates in JS.
async function getFlagMixFallback(from: Date, to: Date): Promise<FlagMixRow[]> {
  const { data, error } = await db()
    .from('flag_mix_daily')
    .select('flag, count')
    .gte('date', toIsoDate(from))
    .lte('date', toIsoDate(to));

  if (error) throw new Error(error.message);

  const gulfSet = new Set<string>(GULF_FLAGS_UI);
  const totals: Record<string, number> = {};
  for (const row of data ?? []) {
    const bucket = gulfSet.has(row.flag) ? row.flag : 'OT';
    totals[bucket] = (totals[bucket] ?? 0) + row.count;
  }

  const grand = Object.values(totals).reduce((a, b) => a + b, 0);
  if (grand === 0) return [];

  return Object.entries(totals)
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([flag_iso2, count]) => ({
      flag_iso2,
      count,
      share: count / grand,
    }));
}

export async function getHistoricalPositions(
  from: Date,
  to: Date,
  limit = 5000,
): Promise<PositionRow[]> {
  const { data, error } = await db()
    .from('positions')
    .select('mmsi, lat, lon, ts, vessels(flag, name)')
    .eq('source', 'gfw')
    .gte('ts', from.toISOString())
    .lte('ts', to.toISOString())
    .limit(limit);

  if (error) throw new Error(error.message);

  return z.array(PositionRow).parse(
    (data ?? []).map((r) => {
      const vessel = Array.isArray(r.vessels) ? r.vessels[0] : r.vessels;
      return {
        mmsi:      r.mmsi,
        lat:       r.lat,
        lon:       r.lon,
        ts:        r.ts,
        flag_iso2: (vessel as { flag?: string | null } | null)?.flag ?? null,
        name:      (vessel as { name?: string | null } | null)?.name ?? null,
      };
    }),
  );
}

export async function getKpiSnapshot(): Promise<KpiSnapshot> {
  const today    = todayUtc();
  const yday     = subtractDays(today, 1);
  const yday7ago = subtractDays(today, 8);
  const d30from  = subtractDays(today, 30);
  const d30_7from = subtractDays(today, 37);
  const d30_7to   = subtractDays(today, 7);

  const [activeRes, ydayRes, yday7Res, avg30Res, avg30_7Res, closureRes] = await Promise.all([
    // active_vessels: distinct MMSI with ais_live positions today (0 until live ingest runs)
    db()
      .from('positions')
      .select('mmsi', { count: 'exact', head: true })
      .eq('source', 'ais_live')
      .gte('ts', today.toISOString()),

    // yesterday's transit count
    db()
      .from('daily_transits')
      .select('vessel_count')
      .eq('date', toIsoDate(yday))
      .maybeSingle(),

    // same day 7 days ago (for delta)
    db()
      .from('daily_transits')
      .select('vessel_count')
      .eq('date', toIsoDate(yday7ago))
      .maybeSingle(),

    // avg vessel_count over last 30 days
    db()
      .from('daily_transits')
      .select('vessel_count')
      .gte('date', toIsoDate(d30from))
      .lte('date', toIsoDate(today)),

    // avg vessel_count for the 30-day window shifted 7 days back (prior period delta)
    db()
      .from('daily_transits')
      .select('vessel_count')
      .gte('date', toIsoDate(d30_7from))
      .lte('date', toIsoDate(d30_7to)),

    // most recent strait_closure event
    db()
      .from('events')
      .select('ts, title, kind')
      .eq('kind', 'strait_closure')
      .order('ts', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const active_vessels = activeRes.count ?? 0;
  const transits_24h   = ydayRes.data?.vessel_count ?? 0;
  const tx7ago         = yday7Res.data?.vessel_count ?? null;

  const transits_24h_delta =
    tx7ago !== null && tx7ago > 0
      ? Math.round(((transits_24h - tx7ago) / tx7ago) * 100 * 10) / 10
      : null;

  const avg = (rows: { vessel_count: number }[] | null) => {
    if (!rows || rows.length === 0) return null;
    return Math.round(rows.reduce((s, r) => s + r.vessel_count, 0) / rows.length);
  };
  const avg_daily_30d      = avg(avg30Res.data);
  const avg_daily_prior_30d = avg(avg30_7Res.data);
  const avg_daily_30d_delta =
    avg_daily_30d !== null && avg_daily_prior_30d !== null && avg_daily_prior_30d > 0
      ? Math.round(((avg_daily_30d - avg_daily_prior_30d) / avg_daily_prior_30d) * 100 * 10) / 10
      : null;

  // TODO: replace with live EIA/Kpler crude flow data in Phase 6
  const crude_mbd_est = 17.2;

  const closureRow = closureRes.data;
  const closure_status = closureRow ? ('PARTIAL' as const) : null;
  const closure_since  = closureRow?.ts ?? null;

  return KpiSnapshot.parse({
    active_vessels,
    transits_24h,
    transits_24h_delta,
    avg_daily_30d,
    avg_daily_30d_delta,
    crude_mbd_est,
    closure_status,
    closure_since,
  });
}

export async function getClosureEvent(): Promise<ClosureEvent | null> {
  const { data, error } = await db()
    .from('events')
    .select('id, kind, title, ts, description')
    .eq('kind', 'strait_closure')
    .order('ts', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  return ClosureEvent.parse(data);
}
