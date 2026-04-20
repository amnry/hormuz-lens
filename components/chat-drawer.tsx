'use client';
import { useState } from 'react';
import { toIsoDate } from '../lib/util/date-range';
import type { DateRange } from '../lib/util/date-range';

interface Props {
  range: DateRange;
}

export default function ChatDrawer({ range }: Props) {
  const [open, setOpen] = useState(false);

  const rangeLabel = `${toIsoDate(range.from).slice(5).replace('-', ' ').toUpperCase()} → ${toIsoDate(range.to).slice(5).replace('-', ' ').toUpperCase()}`;

  return (
    <>
      {/* FAB */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Open analyst"
        style={{
          position: 'absolute',
          right: '16px',
          bottom: '80px',
          zIndex: 29,
          width: '44px',
          height: '44px',
          background: 'var(--bg-2)',
          border: '1px solid var(--line)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--ink-dim)',
          cursor: 'pointer',
          fontFamily: 'var(--mono)',
          fontSize: '11px',
        }}
      >
        {/* Amber notification dot */}
        <span
          style={{
            position: 'absolute',
            top: '5px',
            right: '5px',
            width: '5px',
            height: '5px',
            background: 'var(--accent)',
            borderRadius: '50%',
            boxShadow: '0 0 5px var(--accent)',
          }}
        />
        ▸
      </button>

      {/* Drawer */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          height: '100%',
          width: '380px',
          background: 'var(--bg-2)',
          borderLeft: '1px solid var(--line)',
          zIndex: 30,
          display: 'flex',
          flexDirection: 'column',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform .26s ease',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 12px',
            borderBottom: '1px solid var(--line)',
          }}
        >
          <span
            style={{
              fontSize: '10px',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--ink-dim)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span
              style={{
                width: '5px',
                height: '5px',
                background: 'var(--accent)',
                borderRadius: '50%',
                boxShadow: '0 0 6px var(--accent)',
                display: 'inline-block',
              }}
            />
            Grounded analyst · hormuz-gpt
          </span>
          <button
            onClick={() => setOpen(false)}
            style={{
              cursor: 'pointer',
              color: 'var(--ink-dim)',
              fontFamily: 'var(--mono)',
              padding: '2px 6px',
              background: 'transparent',
              border: 'none',
              fontSize: '14px',
            }}
          >
            ×
          </button>
        </div>

        {/* Groundings */}
        <div
          style={{
            padding: '10px 12px',
            borderBottom: '1px solid var(--line-soft)',
            fontSize: '10px',
            color: 'var(--ink-faint)',
          }}
        >
          <b
            style={{
              color: 'var(--ink-dim)',
              fontWeight: 500,
              letterSpacing: '0.1em',
              display: 'block',
              marginBottom: '4px',
              textTransform: 'uppercase',
            }}
          >
            Context window
          </b>
          {[
            { label: 'range', value: rangeLabel },
            { label: 'flags', value: 'all' },
            { label: 'sources', value: 'AIS + GFW + FRED' },
          ].map(({ label, value }) => (
            <span
              key={label}
              style={{
                display: 'inline-block',
                padding: '2px 7px',
                margin: '2px 3px 2px 0',
                border: '1px solid var(--line)',
                color: 'var(--ink-dim)',
              }}
            >
              {label}: <b style={{ color: 'var(--ink)', fontWeight: 500 }}>{value}</b>
            </span>
          ))}
        </div>

        {/* Stub body */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            textAlign: 'center',
            color: 'var(--ink-faint)',
            fontSize: '11px',
            lineHeight: 1.6,
          }}
        >
          Grounded chatbot coming in Phase 5. For now, explore the data via the globe,
          chart, and range controls.
        </div>
      </div>
    </>
  );
}
