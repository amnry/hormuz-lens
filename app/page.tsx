import Dashboard from '../components/dashboard';
import {
  getDailyTransits,
  getBrentSeries,
  getFlagMixForRange,
  getHistoricalPositions,
  getKpiSnapshot,
  getClosureEvent,
} from '../lib/db/queries';
import { YTD_FROM, todayUtc } from '../lib/util/date-range';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const from  = YTD_FROM;
  const to    = todayUtc();

  const [transits, brent, flagMix, positions, kpi, closure] = await Promise.all([
    getDailyTransits(from, to),
    getBrentSeries(from, to),
    getFlagMixForRange(from, to),
    getHistoricalPositions(from, to),
    getKpiSnapshot(),
    getClosureEvent(),
  ]);

  return (
    <Dashboard
      initialRange={{ from, to }}
      initialTransits={transits}
      initialBrent={brent}
      initialFlagMix={flagMix}
      initialPositions={positions}
      kpi={kpi}
      closure={closure}
    />
  );
}
