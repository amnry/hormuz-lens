'use client';
import { toIsoDate, diffDays } from '../../lib/util/date-range';
import type { DateRange } from '../../lib/util/date-range';

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    month: 'short', day: '2-digit', year: 'numeric', timeZone: 'UTC',
  }).toUpperCase();
}

export default function RangeLabel({ range }: { range: DateRange }) {
  void toIsoDate; // used for cursor key only
  const days = diffDays(range.from, range.to);
  return (
    <div style={{ color: 'var(--ink-dim)', fontSize: '10.5px', letterSpacing: '0.1em' }}>
      RANGE{' '}
      <b style={{ color: 'var(--ink)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
        {fmtDate(range.from)}
      </b>
      <span style={{ color: 'var(--ink-faint)', margin: '0 8px' }}>→</span>
      <b style={{ color: 'var(--ink)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
        {fmtDate(range.to)}
      </b>
      <span style={{ color: 'var(--ink-faint)', marginLeft: '10px' }}>
        · {days} D
      </span>
    </div>
  );
}
