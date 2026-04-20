import { NextRequest } from 'next/server';
import { z } from 'zod/v4';
import {
  getDailyTransits,
  getBrentSeries,
  getFlagMixForRange,
  getHistoricalPositions,
} from '../../../lib/db/queries';
import { fromIsoDate } from '../../../lib/util/date-range';

const ParamsSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD'),
  to:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD'),
});

export async function GET(req: NextRequest) {
  const sp   = req.nextUrl.searchParams;
  const raw  = { from: sp.get('from') ?? '', to: sp.get('to') ?? '' };
  const parsed = ParamsSchema.safeParse(raw);

  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid params', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const from = fromIsoDate(parsed.data.from);
  const to   = fromIsoDate(parsed.data.to);

  try {
    const [transits, brent, flagMix, positions] = await Promise.all([
      getDailyTransits(from, to),
      getBrentSeries(from, to),
      getFlagMixForRange(from, to),
      getHistoricalPositions(from, to, 5000),
    ]);

    return Response.json({ transits, brent, flagMix, positions });
  } catch (err) {
    console.error('[/api/range]', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    );
  }
}
