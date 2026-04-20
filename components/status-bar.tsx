import UtcClock from './utc-clock';
import type { BrentRow } from '../lib/db/queries';

interface Props {
  brentLatest: BrentRow | null;
  transits24h: number;
}

export default function StatusBar({ brentLatest, transits24h }: Props) {
  const brentDisplay = brentLatest?.brent_usd != null
    ? `$${brentLatest.brent_usd.toFixed(2)}`
    : '—';

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        alignItems: 'center',
        padding: '0 12px',
        gap: '24px',
        borderBottom: '1px solid var(--line)',
        background: 'var(--bg)',
        fontSize: '10.5px',
        letterSpacing: '0.02em',
        height: '28px',
        flexShrink: 0,
      }}
    >
      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 500 }}>
        <span
          style={{
            width: '6px',
            height: '6px',
            background: 'var(--ok)',
            borderRadius: '50%',
            boxShadow: '0 0 6px var(--ok)',
            animation: 'hzPulse 2.4s ease-in-out infinite',
            flexShrink: 0,
          }}
        />
        <span>
          <b style={{ fontWeight: 600, letterSpacing: '0.06em' }}>HORMUZ</b>
          <span>.LENS</span>
        </span>
        <span style={{ color: 'var(--ink-faint)', margin: '0 6px' }}>/</span>
        <span style={{ color: 'var(--ink-dim)', fontWeight: 400 }}>
          strait traffic analytics · v0.4-alpha
        </span>
      </div>

      {/* Ticker */}
      <div
        style={{
          display: 'flex',
          gap: '18px',
          color: 'var(--ink-dim)',
          justifySelf: 'center',
        }}
      >
        <span>
          BRENT
          <b style={{ color: 'var(--ink)', fontWeight: 500, marginLeft: '4px' }}>
            {brentDisplay}
          </b>
        </span>
        <span>
          TRANSITS/24H
          <b style={{ color: 'var(--ink)', fontWeight: 500, marginLeft: '4px' }}>
            {transits24h}
          </b>
        </span>
        <span style={{ color: 'var(--ink-faint)' }}>
          VLCC·AG→CHN
          <b style={{ color: 'var(--ink-dim)', fontWeight: 500, marginLeft: '4px' }}>
            WS —
          </b>
        </span>
      </div>

      {/* Sysmeta */}
      <div style={{ display: 'flex', gap: '16px', color: 'var(--ink-faint)' }}>
        <span>
          AIS{' '}
          <b
            style={{
              color: 'var(--bad)',
              fontWeight: 500,
              border: '1px solid var(--bad)',
              padding: '0 4px',
              fontSize: '9px',
              letterSpacing: '0.12em',
            }}
          >
            OFFLINE
          </b>
        </span>
        <span>
          UTC <UtcClock />
        </span>
        <span>LAT 26.5°N · LON 56.3°E</span>
      </div>
    </div>
  );
}
