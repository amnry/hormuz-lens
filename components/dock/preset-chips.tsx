'use client';
import { subtractDays, todayUtc, YTD_FROM } from '../../lib/util/date-range';
import type { DateRange } from '../../lib/util/date-range';

type Preset = '7D' | '30D' | 'YTD' | 'CUSTOM';

function activePreset(range: DateRange): Preset {
  const today = todayUtc();
  const daysDiff = Math.round((today.getTime() - range.from.getTime()) / 86_400_000);
  if (range.from.getTime() === YTD_FROM.getTime()) return 'YTD';
  if (daysDiff === 7)  return '7D';
  if (daysDiff === 30) return '30D';
  return 'CUSTOM';
}

const chipStyle = (active: boolean): React.CSSProperties => ({
  fontFamily: 'var(--mono)',
  fontSize: '10.5px',
  letterSpacing: '0.06em',
  background: active ? 'var(--accent)' : 'transparent',
  border: `1px solid ${active ? 'var(--accent)' : 'var(--line)'}`,
  color: active ? 'var(--bg)' : 'var(--ink-dim)',
  padding: '5px 10px',
  cursor: 'pointer',
});

interface Props {
  range: DateRange;
  setRange: (r: DateRange) => void;
}

export default function PresetChips({ range, setRange }: Props) {
  const active = activePreset(range);
  const today  = todayUtc();

  const presets: { label: Preset; action: () => void }[] = [
    { label: '7D',  action: () => setRange({ from: subtractDays(today, 7),  to: today }) },
    { label: '30D', action: () => setRange({ from: subtractDays(today, 30), to: today }) },
    { label: 'YTD', action: () => setRange({ from: YTD_FROM, to: today }) },
    { label: 'CUSTOM', action: () => {} },
  ];

  return (
    <div style={{ display: 'flex', gap: '4px', justifySelf: 'end', alignItems: 'center' }}>
      {presets.map(({ label, action }) => (
        <button key={label} onClick={action} style={chipStyle(active === label)}>
          {label}
        </button>
      ))}
    </div>
  );
}
