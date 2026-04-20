'use client';
import { useState } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  Cell,
  XAxis,
  YAxis,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from 'recharts';
import { toIsoDate, CLOSURE_DATE } from '../lib/util/date-range';
import type { DailyTransitRow, BrentRow, ClosureEvent } from '../lib/db/queries';

interface Props {
  transits: DailyTransitRow[];
  brent: BrentRow[];
  closure: ClosureEvent | null;
}

interface ChartRow {
  date: string;
  vessel_count: number | null;
  brent_usd: number | null;
  postClosure: boolean;
}

function buildChartData(transits: DailyTransitRow[], brent: BrentRow[]): ChartRow[] {
  const brentMap = new Map(brent.map((b) => [b.date, b.brent_usd]));
  const closureStr = toIsoDate(CLOSURE_DATE);
  return transits.map((t) => ({
    date:         t.date,
    vessel_count: t.vessel_count,
    brent_usd:    brentMap.get(t.date) ?? null,
    postClosure:  t.date >= closureStr,
  }));
}

const TICK_STYLE = {
  fontFamily: 'var(--mono)',
  fontSize: '9px',
  fill: 'var(--ink-faint)',
} as const;

function formatDate(s: string): string {
  return s.slice(5); // MM-DD
}

export default function ChartPanel({ transits, brent, closure }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  const data = buildChartData(transits, brent);
  const closureStr = closure ? closure.ts.slice(0, 10) : toIsoDate(CLOSURE_DATE);
  const empty = data.length === 0;

  return (
    <div
      style={{
        position: 'absolute',
        left: '16px',
        bottom: '16px',
        width: collapsed ? '220px' : '560px',
        height: collapsed ? '30px' : '230px',
        background: 'color-mix(in oklab, var(--bg-2) 94%, transparent)',
        border: '1px solid var(--line)',
        backdropFilter: 'blur(6px)',
        zIndex: 25,
        display: 'flex',
        flexDirection: 'column',
        transition: 'height .24s ease, width .24s ease',
      }}
    >
      {/* Header bar */}
      <div
        onClick={() => setCollapsed((c) => !c)}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '6px 10px',
          borderBottom: collapsed ? 'none' : '1px solid var(--line-soft)',
          fontSize: '10px',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--ink-dim)',
          flexShrink: 0,
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', gap: '14px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <i style={{ width: '10px', height: '2px', background: 'var(--chart-transits)', display: 'inline-block' }} />
            Daily transits
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <i style={{ width: '10px', height: '2px', background: 'var(--chart-brent)', display: 'inline-block' }} />
            Brent close · $/bbl
          </span>
        </div>
        <span style={{ color: 'var(--ink-faint)', fontFamily: 'var(--mono)' }}>
          {collapsed ? '▸ EXPAND' : '▾ COLLAPSE'}
        </span>
      </div>

      {/* Chart body */}
      {!collapsed && (
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {empty ? (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              color: 'var(--ink-faint)', fontSize: '10px', letterSpacing: '0.1em',
            }}>
              No data in selected range
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 10, right: 40, bottom: 0, left: 0 }}>
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDate}
                  tick={TICK_STYLE}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--line)' }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  yAxisId="transits"
                  orientation="left"
                  tick={TICK_STYLE}
                  tickLine={false}
                  axisLine={false}
                  width={30}
                />
                <YAxis
                  yAxisId="brent"
                  orientation="right"
                  tick={TICK_STYLE}
                  tickLine={false}
                  axisLine={false}
                  width={36}
                  tickFormatter={(v: number) => `$${v}`}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--bg-2)',
                    border: '1px solid var(--line)',
                    fontFamily: 'var(--mono)',
                    fontSize: '10px',
                    color: 'var(--ink)',
                  }}
                  labelStyle={{ color: 'var(--ink-dim)', marginBottom: '4px' }}
                  cursor={{ fill: 'var(--line-soft)', opacity: 0.3 }}
                />
                <Legend
                  wrapperStyle={{ display: 'none' }}
                />
                <ReferenceLine
                  yAxisId="transits"
                  x={closureStr}
                  stroke="var(--bad)"
                  strokeDasharray="4 3"
                  strokeWidth={1}
                  label={{
                    value: '28 FEB · STRAIT CLOSURE',
                    position: 'insideTopRight',
                    fill: 'var(--bad)',
                    fontSize: 9,
                    fontFamily: 'var(--mono)',
                    letterSpacing: '0.06em',
                  }}
                />
                <Bar yAxisId="transits" dataKey="vessel_count" name="Transits" maxBarSize={8}>
                  {data.map((row) => (
                    <Cell
                      key={row.date}
                      fill={row.postClosure ? 'var(--bad)' : 'var(--chart-transits)'}
                      fillOpacity={row.postClosure ? 0.55 : 0.75}
                    />
                  ))}
                </Bar>
                <Line
                  yAxisId="brent"
                  type="monotone"
                  dataKey="brent_usd"
                  name="Brent $/bbl"
                  stroke="var(--chart-brent)"
                  strokeWidth={1.4}
                  dot={false}
                  connectNulls
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      )}
    </div>
  );
}
