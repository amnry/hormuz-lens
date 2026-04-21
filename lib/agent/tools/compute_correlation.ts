import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { getServiceClient } from '../../db/service-client';

// Feb 1 – Feb 27 2026 pre-closure baseline, Mar 1 – Apr 16 2026 post-closure window
// (per DECISIONS.md §011: Feb 28 boundary-day excluded from both windows)
const PRE_FROM  = '2026-02-01';
const PRE_TO    = '2026-02-27';
const POST_FROM = '2026-03-01';
const POST_TO   = '2026-04-16';

const inputSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
    .describe('Start of the correlation window, YYYY-MM-DD'),
  to:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
    .describe('End of the correlation window, YYYY-MM-DD'),
  window_days: z.number().int().min(3).max(30).optional().default(7)
    .describe('Rolling Pearson window in days (default 7)'),
});

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function pearson(xs: number[], ys: number[]): number | null {
  if (xs.length < 2) return null;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < xs.length; i++) {
    const dx = (xs[i] ?? 0) - mx;
    const dy = (ys[i] ?? 0) - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  return denom === 0 ? null : num / denom;
}

export const computeCorrelation = tool(
  async ({ from, to, window_days }): Promise<string> => {
    const db = getServiceClient();

    const [transitRes, brentRes] = await Promise.all([
      db.from('daily_transits').select('date, vessel_count')
        .gte('date', from).lte('date', to).order('date'),
      db.from('petrodollar_daily').select('date, brent_usd')
        .gte('date', from).lte('date', to).order('date'),
    ]);

    if (transitRes.error) throw new Error(`daily_transits error: ${transitRes.error.message}`);
    if (brentRes.error)   throw new Error(`petrodollar_daily error: ${brentRes.error.message}`);

    // Align by date — use a map so missing Brent days are handled gracefully
    const brentMap = new Map(
      (brentRes.data ?? [])
        .filter((r) => r.brent_usd !== null)
        .map((r) => [r.date, r.brent_usd as number]),
    );

    const aligned = (transitRes.data ?? [])
      .filter((r) => brentMap.has(r.date))
      .map((r) => ({
        date:         r.date,
        vessel_count: r.vessel_count,
        brent_usd:    brentMap.get(r.date) as number,
      }));

    if (aligned.length < window_days) {
      return `Insufficient overlapping data (${aligned.length} aligned days, need at least ${window_days}). ` +
             `Check that both daily_transits and petrodollar_daily have coverage for ${from} to ${to}.`;
    }

    // Rolling Pearson
    const series = aligned.map((row, i) => {
      if (i < window_days - 1) {
        return { ...row, rolling_r: null };
      }
      const window = aligned.slice(i - window_days + 1, i + 1);
      const r = pearson(
        window.map((w) => w.vessel_count),
        window.map((w) => w.brent_usd),
      );
      return { ...row, rolling_r: r !== null ? Math.round(r * 1000) / 1000 : null };
    });

    // Total correlation over the full window
    const total_r = pearson(
      aligned.map((r) => r.vessel_count),
      aligned.map((r) => r.brent_usd),
    );

    // Pre/post closure means — pull separately to avoid polluting the correlation window
    const [preTransit, preBrent, postTransit, postBrent] = await Promise.all([
      db.from('daily_transits').select('vessel_count')
        .gte('date', PRE_FROM).lte('date', PRE_TO),
      db.from('petrodollar_daily').select('brent_usd')
        .gte('date', PRE_FROM).lte('date', PRE_TO).not('brent_usd', 'is', null),
      db.from('daily_transits').select('vessel_count')
        .gte('date', POST_FROM).lte('date', POST_TO),
      db.from('petrodollar_daily').select('brent_usd')
        .gte('date', POST_FROM).lte('date', POST_TO).not('brent_usd', 'is', null),
    ]);

    const pre_mean_vessels  = Math.round(mean((preTransit.data  ?? []).map((r) => r.vessel_count)));
    const post_mean_vessels = Math.round(mean((postTransit.data ?? []).map((r) => r.vessel_count)));
    const pre_mean_brent    = Math.round(mean((preBrent.data    ?? []).map((r) => r.brent_usd as number)) * 100) / 100;
    const post_mean_brent   = Math.round(mean((postBrent.data   ?? []).map((r) => r.brent_usd as number)) * 100) / 100;

    const result = {
      window: { from, to, window_days },
      total_r: total_r !== null ? Math.round(total_r * 1000) / 1000 : null,
      pre_closure:  { period: `${PRE_FROM} to ${PRE_TO}`,  mean_vessels: pre_mean_vessels,  mean_brent_usd: pre_mean_brent },
      post_closure: { period: `${POST_FROM} to ${POST_TO}`, mean_vessels: post_mean_vessels, mean_brent_usd: post_mean_brent },
      series,
    };

    return JSON.stringify(result, null, 0);
  },
  {
    name: 'compute_correlation',
    description:
      'Compute rolling Pearson correlation between daily vessel counts and Brent crude price. ' +
      'Also returns pre-closure (Feb 1–27) and post-closure (Mar 1–Apr 16) mean vessels and Brent, ' +
      'per the fixed windows in DECISIONS.md §011. Use this for any question about whether ' +
      'vessel traffic and oil prices moved together.',
    schema: inputSchema,
  },
);
