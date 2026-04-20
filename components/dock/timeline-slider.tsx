'use client';
import { useCallback, useRef } from 'react';
import { Slider } from '@base-ui/react/slider';
import {
  TRACK_START,
  CLOSURE_DATE,
  toIsoDate,
  fromIsoDate,
  todayUtc,
} from '../../lib/util/date-range';
import type { DateRange } from '../../lib/util/date-range';

// Build monthly tick marks between track start and today
function buildTicks(trackStart: Date, trackEnd: Date): { date: Date; label: string }[] {
  const ticks: { date: Date; label: string }[] = [];
  const cur = new Date(Date.UTC(trackStart.getUTCFullYear(), trackStart.getUTCMonth() + 1, 1));
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  while (cur <= trackEnd) {
    ticks.push({
      date: new Date(cur),
      label: months[cur.getUTCMonth()] ?? '',
    });
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  return ticks;
}

function pct(date: Date, start: Date, end: Date): number {
  const span = end.getTime() - start.getTime();
  if (span === 0) return 0;
  return Math.max(0, Math.min(100, ((date.getTime() - start.getTime()) / span) * 100));
}

// Date → slider integer value (days since epoch)
function dateToVal(d: Date): number {
  return Math.floor(d.getTime() / 86_400_000);
}

function valToDate(v: number): Date {
  return new Date(v * 86_400_000);
}

interface Props {
  range: DateRange;
  setRange: (r: DateRange) => void;
}

export default function TimelineSlider({ range, setRange }: Props) {
  const trackEnd   = todayUtc();
  const trackStart = TRACK_START;
  const ticks      = buildTicks(trackStart, trackEnd);
  const debounceId = useRef<ReturnType<typeof setTimeout>>(undefined);

  const minVal = dateToVal(trackStart);
  const maxVal = dateToVal(trackEnd);

  const handleChange = useCallback(
    (values: number[]) => {
      if (values.length < 2) return;
      clearTimeout(debounceId.current);
      debounceId.current = setTimeout(() => {
        const from = valToDate(values[0]!);
        const to   = valToDate(values[1]!);
        if (from < to) setRange({ from, to });
      }, 150);
    },
    [setRange],
  );

  const closurePct = pct(CLOSURE_DATE, trackStart, trackEnd);

  return (
    <div style={{ position: 'relative', height: '36px' }}>
      {/* Monthly tick labels */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, pointerEvents: 'none' }}>
        {ticks.map(({ date, label }) => {
          const p = pct(date, trackStart, trackEnd);
          return (
            <div
              key={toIsoDate(date)}
              style={{
                position: 'absolute',
                left: `${p}%`,
                top: '50%',
                transform: 'translateY(-50%)',
                pointerEvents: 'none',
              }}
            >
              <div style={{ width: '1px', height: '8px', background: 'var(--line-soft)', transform: 'translateX(-50%)' }} />
              <div style={{
                position: 'absolute',
                top: '14px',
                left: '50%',
                transform: 'translateX(-50%)',
                color: 'var(--ink-faint)',
                fontSize: '9px',
                letterSpacing: '0.08em',
                whiteSpace: 'nowrap',
              }}>
                {label}
              </div>
            </div>
          );
        })}
      </div>

      {/* Feb 28 closure annotation */}
      <div
        style={{
          position: 'absolute',
          left: `${closurePct}%`,
          top: '6px',
          bottom: '6px',
          borderLeft: '1px dashed var(--bad)',
          zIndex: 2,
          pointerEvents: 'none',
        }}
      >
        <span style={{
          position: 'absolute',
          top: '-4px',
          left: '4px',
          color: 'var(--bad)',
          fontSize: '9px',
          whiteSpace: 'nowrap',
          letterSpacing: '0.06em',
        }}>
          28 FEB · CLOSURE
        </span>
      </div>

      {/* Base UI Slider */}
      <Slider.Root
        value={[dateToVal(range.from), dateToVal(range.to)]}
        min={minVal}
        max={maxVal}
        onValueChange={handleChange}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: '50%',
          transform: 'translateY(-50%)',
          height: '20px',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <Slider.Control style={{ position: 'relative', width: '100%', height: '20px', display: 'flex', alignItems: 'center' }}>
          <Slider.Track
            style={{
              width: '100%',
              height: '1px',
              background: 'var(--line)',
              position: 'relative',
            }}
          >
            <Slider.Indicator
              style={{
                background: 'var(--accent)',
                boxShadow: '0 0 6px color-mix(in oklab, var(--accent) 50%, transparent)',
                height: '2px',
                top: '-0.5px',
                position: 'absolute',
              }}
            />
            {([0, 1] as const).map((i) => (
              <Slider.Thumb
                key={i}
                index={i}
                style={{
                  position: 'absolute',
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '10px',
                  height: '14px',
                  background: 'var(--bg)',
                  border: '1px solid var(--accent)',
                  cursor: 'ew-resize',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span style={{ width: '2px', height: '6px', background: 'var(--accent)', display: 'block' }} />
              </Slider.Thumb>
            ))}
          </Slider.Track>
        </Slider.Control>
      </Slider.Root>
    </div>
  );
}
