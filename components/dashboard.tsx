'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import StatusBar from './status-bar';
import InfoPanel from './info-panel';
import ChartPanel from './chart-panel';
import ChatDrawer from './chat-drawer';
import RangeLabel from './dock/range-label';
import PresetChips from './dock/preset-chips';
import TimelineSlider from './dock/timeline-slider';
import { defaultRange, fromIsoDate, toIsoDate } from '../lib/util/date-range';
import type { DateRange } from '../lib/util/date-range';
import type {
  DailyTransitRow,
  BrentRow,
  FlagMixRow,
  KpiSnapshot,
  PositionRow,
  ClosureEvent,
} from '../lib/db/queries';

const Globe = dynamic(() => import('./globe/globe'), { ssr: false });

interface Props {
  initialRange: DateRange;
  initialTransits: DailyTransitRow[];
  initialBrent: BrentRow[];
  initialFlagMix: FlagMixRow[];
  initialPositions: PositionRow[];
  kpi: KpiSnapshot;
  closure: ClosureEvent | null;
}

interface RangePayload {
  transits: DailyTransitRow[];
  brent: BrentRow[];
  flagMix: FlagMixRow[];
  positions: PositionRow[];
}

export default function Dashboard({
  initialRange,
  initialTransits,
  initialBrent,
  initialFlagMix,
  initialPositions,
  kpi,
  closure,
}: Props) {
  const [range, setRangeState] = useState<DateRange>(initialRange);
  const [transits,  setTransits]  = useState<DailyTransitRow[]>(initialTransits);
  const [brent,     setBrent]     = useState<BrentRow[]>(initialBrent);
  const [flagMix,   setFlagMix]   = useState<FlagMixRow[]>(initialFlagMix);
  const [positions, setPositions] = useState<PositionRow[]>(initialPositions);

  const debounceId = useRef<ReturnType<typeof setTimeout>>(undefined);
  const isFirst    = useRef(true);

  const fetchRange = useCallback(async (r: DateRange) => {
    const params = new URLSearchParams({
      from: toIsoDate(r.from),
      to:   toIsoDate(r.to),
    });
    const res = await fetch(`/api/range?${params.toString()}`);
    if (!res.ok) return;
    const json = (await res.json()) as RangePayload;
    setTransits(json.transits ?? []);
    setBrent(json.brent ?? []);
    setFlagMix(json.flagMix ?? []);
    setPositions(json.positions ?? []);
  }, []);

  const setRange = useCallback((r: DateRange) => {
    setRangeState(r);
    clearTimeout(debounceId.current);
    debounceId.current = setTimeout(() => {
      void fetchRange(r);
    }, 150);
  }, [fetchRange]);

  // Skip the initial fetch — data already loaded from server
  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
  }, [range]);

  const brentLatest = brent.length > 0 ? brent[brent.length - 1] ?? null : null;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--bg)',
      }}
    >
      <StatusBar brentLatest={brentLatest} transits24h={kpi.transits_24h} />

      {/* Stage */}
      <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
        <Globe positions={positions} />
        <InfoPanel kpi={kpi} flagMix={flagMix} />
        <ChartPanel transits={transits} brent={brent} closure={closure} />
        <ChatDrawer range={range} />
      </div>

      {/* Dock */}
      <div
        style={{
          flexShrink: 0,
          background: 'var(--bg)',
          borderTop: '1px solid var(--line)',
          padding: '10px 16px 12px',
          display: 'grid',
          gridTemplateColumns: 'auto 1fr auto',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <RangeLabel range={range} />
        <TimelineSlider range={range} setRange={setRange} />
        <PresetChips range={range} setRange={setRange} />
      </div>
    </div>
  );
}
