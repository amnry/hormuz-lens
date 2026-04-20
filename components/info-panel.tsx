import type { KpiSnapshot, FlagMixRow } from '../lib/db/queries';
import countries from 'i18n-iso-countries';
import enLocale from 'i18n-iso-countries/langs/en.json';

countries.registerLocale(enLocale);

const DISPLAY_OVERRIDES: Record<string, string> = {
  'United Arab Emirates':    'UAE',
  'Marshall Islands':        'Marshall Is.',
  'Islamic Republic of Iran': 'Iran',
};

function flagName(iso2: string): string {
  if (iso2 === 'OT') return 'Other';
  const full = countries.getName(iso2, 'en') ?? iso2;
  return DISPLAY_OVERRIDES[full] ?? full;
}

interface Props {
  kpi: KpiSnapshot;
  flagMix: FlagMixRow[];
}

function Delta({ value }: { value: number | null }) {
  if (value === null) return <span style={{ color: 'var(--ink-faint)' }}>—</span>;
  const up = value >= 0;
  return (
    <span style={{ color: up ? 'var(--ok)' : 'var(--bad)' }}>
      {up ? '+' : ''}{value.toFixed(1)}%
    </span>
  );
}

export default function InfoPanel({ kpi, flagMix }: Props) {
  const maxCount = Math.max(1, ...flagMix.filter((r) => r.flag_iso2 !== 'OT').map((r) => r.count));

  const closureLabel =
    kpi.closure_status === 'PARTIAL'  ? 'PARTIAL · since 28 Feb' :
    kpi.closure_status === 'CLOSED'   ? 'CLOSED'                 :
    'OPEN';

  return (
    <div
      style={{
        position: 'absolute',
        top: '16px',
        right: '16px',
        width: '300px',
        background: 'color-mix(in oklab, var(--bg-2) 92%, transparent)',
        border: '1px solid var(--line)',
        backdropFilter: 'blur(6px)',
        zIndex: 20,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 10px',
          borderBottom: '1px solid var(--line-soft)',
        }}
      >
        <span style={{ color: 'var(--ink-dim)', fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
          Strait of Hormuz · Realtime
        </span>
        <span
          style={{
            color: kpi.active_vessels > 0 ? 'var(--ok)' : 'var(--ink-faint)',
            fontSize: '10px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <span
            style={{
              width: '5px',
              height: '5px',
              background: kpi.active_vessels > 0 ? 'var(--ok)' : 'var(--ink-faint)',
              borderRadius: '50%',
              boxShadow: kpi.active_vessels > 0 ? '0 0 5px var(--ok)' : 'none',
              display: 'inline-block',
            }}
          />
          {kpi.active_vessels > 0 ? 'LIVE' : 'AIS OFFLINE'}
        </span>
      </div>

      {/* KPI grid */}
      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          gap: '6px 10px',
          padding: '10px',
          fontSize: '11px',
          margin: 0,
        }}
      >
        <dt style={{ color: 'var(--ink-dim)' }}>Active vessels</dt>
        <dd style={{ margin: 0, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
          {kpi.active_vessels > 0
            ? <span style={{ fontSize: '15px', fontWeight: 500 }}>{kpi.active_vessels}</span>
            : <span style={{ color: 'var(--ink-faint)' }}>—<span style={{ fontSize: '9px', marginLeft: '6px', color: 'var(--bad)', border: '1px solid var(--bad)', padding: '0 3px' }}>AIS offline</span></span>
          }
        </dd>

        <dt style={{ color: 'var(--ink-dim)' }}>Transits · last 24h</dt>
        <dd style={{ margin: 0, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
          {kpi.transits_24h} <Delta value={kpi.transits_24h_delta} />
        </dd>

        <dt style={{ color: 'var(--ink-dim)' }}>Avg daily throughput (30d)</dt>
        <dd style={{ margin: 0, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
          {kpi.avg_daily_30d ?? '—'} <Delta value={kpi.avg_daily_30d_delta} />
        </dd>

        <dt style={{ color: 'var(--ink-dim)' }}>Crude cargo outbound</dt>
        <dd style={{ margin: 0, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
          {kpi.crude_mbd_est} Mb/d
        </dd>

        <dt style={{ color: 'var(--ink-dim)' }}>Closure status</dt>
        <dd
          style={{
            margin: 0,
            textAlign: 'right',
            color: kpi.closure_status !== 'OPEN' && kpi.closure_status !== null
              ? 'var(--bad)'
              : 'var(--ok)',
          }}
        >
          {closureLabel}
        </dd>
      </dl>

      {/* Flag mix */}
      <div style={{ padding: '0 10px 10px' }}>
        <div
          style={{
            color: 'var(--ink-faint)',
            fontSize: '9.5px',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            margin: '8px 0 6px',
          }}
        >
          Flag mix · selected range
        </div>

        {flagMix.length === 0 ? (
          <div style={{ color: 'var(--ink-faint)', fontSize: '10px' }}>No data</div>
        ) : (
          [...flagMix.filter((r) => r.flag_iso2 !== 'OT'),
            ...flagMix.filter((r) => r.flag_iso2 === 'OT')]
            .map(({ flag_iso2: flag, count, share }) => {
              const barWidth = Math.round((count / maxCount) * 58);
              return (
                <div
                  key={flag}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '3px 0',
                    fontSize: '11px',
                    borderBottom: '1px dashed var(--line-soft)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--ink)' }}>
                    <span
                      style={{
                        width: '8px',
                        height: '8px',
                        background: `var(--flag-${flag.toLowerCase()}, var(--flag-ot))`,
                        display: 'inline-block',
                        flexShrink: 0,
                      }}
                    />
                    {flagName(flag)}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <div
                      style={{
                        height: '2px',
                        background: 'var(--line-soft)',
                        width: '58px',
                        position: 'relative',
                        margin: '0 8px',
                        flexShrink: 0,
                      }}
                    >
                      <i
                        style={{
                          position: 'absolute',
                          left: 0,
                          top: 0,
                          bottom: 0,
                          width: `${barWidth}px`,
                          background: `var(--flag-${flag.toLowerCase()}, var(--flag-ot))`,
                          display: 'block',
                        }}
                      />
                    </div>
                    <span style={{ color: 'var(--ink)', fontVariantNumeric: 'tabular-nums', minWidth: '28px', textAlign: 'right' }}>
                      {count}
                    </span>
                  </div>
                </div>
              );
            })
        )}
      </div>
    </div>
  );
}
