'use client';

import { useRef, useEffect, useState } from 'react';
import { useChat }                      from 'ai/react';
import type { JSONValue }               from 'ai';
import { toIsoDate }                   from '../lib/util/date-range';
import type { DateRange }              from '../lib/util/date-range';

interface Props {
  range: DateRange;
}

const SUGGESTIONS = [
  'What happened on February 28?',
  'Why is Panama the top flag in this dataset?',
  'Correlate vessel transits with Brent prices in March 2026.',
  'Compare the top five flags in January versus the first week of March.',
  'What are the known limitations of this dataset?',
] as const;

const TOOL_LABELS: Record<string, string> = {
  sql_query_aggregates: 'queried aggregates',
  vector_search_docs:   'searched docs',
  compute_correlation:  'computed correlation',
};

function prettyTool(name: string): string {
  return TOOL_LABELS[name] ?? name.replace(/_/g, ' ');
}

function isToolStart(v: JSONValue): boolean {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const o = v as Record<string, JSONValue>;
  return o['type'] === 'tool_start' && typeof o['name'] === 'string';
}

const inputRowStyle: React.CSSProperties = {
  display:    'flex',
  gap:        '8px',
  alignItems: 'center',
  border:     '1px solid var(--line)',
  background: 'var(--bg)',
  padding:    '2px 2px 2px 10px',
};

const btnStyle: React.CSSProperties = {
  background:    'var(--bg-3)',
  border:        '1px solid var(--line)',
  color:         'var(--ink-dim)',
  padding:       '6px 10px',
  fontFamily:    'var(--mono)',
  fontSize:      'var(--fs-sm)',
  cursor:        'pointer',
  letterSpacing: '0.05em',
};

export default function ChatDrawer({ range }: Props) {
  const [open, setOpen] = useState(false);
  const bottomRef       = useRef<HTMLDivElement>(null);

  const { messages, input, handleInputChange, handleSubmit, append, stop, status } =
    useChat({ api: '/api/chat' });

  const rangeLabel =
    `${toIsoDate(range.from).slice(5).replace('-', ' ').toUpperCase()} \u2192 ` +
    `${toIsoDate(range.to).slice(5).replace('-', ' ').toUpperCase()}`;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // TEMP: diagnostic — remove before commit
  console.log('messages', JSON.stringify(messages, null, 2));

  return (
    <>
      {/* FAB */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Open analyst"
        style={{
          position:       'absolute',
          right:          '16px',
          bottom:         '80px',
          zIndex:         29,
          width:          '44px',
          height:         '44px',
          background:     'var(--bg-2)',
          border:         '1px solid var(--line)',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          color:          'var(--ink-dim)',
          cursor:         'pointer',
          fontFamily:     'var(--mono)',
          fontSize:       '11px',
        }}
      >
        <span style={{
          position:     'absolute',
          top:          '5px',
          right:        '5px',
          width:        '5px',
          height:       '5px',
          background:   'var(--accent)',
          borderRadius: '50%',
          boxShadow:    '0 0 5px var(--accent)',
        }} />
        ▸
      </button>

      {/* Drawer */}
      <div style={{
        position:      'absolute',
        top:           '344px',
        right:         '16px',
        height:        'calc(100% - 344px)',
        width:         '380px',
        background:    'var(--bg-2)',
        border:        '1px solid var(--line)',
        zIndex:        30,
        display:       'flex',
        flexDirection: 'column',
        transform:     open ? 'translateX(0)' : 'translateX(110%)',
        transition:    'transform .26s ease',
      }}>

        {/* Header */}
        <div style={{
          display:        'flex',
          justifyContent: 'space-between',
          alignItems:     'center',
          padding:        '10px 12px',
          borderBottom:   '1px solid var(--line)',
        }}>
          <span style={{
            fontSize:      'var(--fs-sm)',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color:         'var(--ink-dim)',
            display:       'flex',
            alignItems:    'center',
            gap:           '8px',
          }}>
            <span style={{
              width:        '5px',
              height:       '5px',
              background:   'var(--accent)',
              borderRadius: '50%',
              boxShadow:    '0 0 6px var(--accent)',
              display:      'inline-block',
              flexShrink:   0,
            }} />
            Grounded analyst · hormuz-gpt
          </span>
          <button
            onClick={() => setOpen(false)}
            style={{
              cursor:     'pointer',
              color:      'var(--ink-dim)',
              fontFamily: 'var(--mono)',
              padding:    '2px 6px',
              background: 'transparent',
              border:     'none',
              fontSize:   '14px',
            }}
          >
            ×
          </button>
        </div>

        {/* Context window groundings */}
        <div style={{
          padding:      '10px 12px',
          borderBottom: '1px solid var(--line-soft)',
          fontSize:     'var(--fs-xs)',
          color:        'var(--ink-faint)',
        }}>
          <b style={{
            color:         'var(--ink-dim)',
            fontWeight:    500,
            letterSpacing: '0.1em',
            display:       'block',
            marginBottom:  '4px',
            textTransform: 'uppercase',
          }}>
            Context window
          </b>
          {[
            { label: 'range',   value: rangeLabel },
            { label: 'flags',   value: 'all' },
            { label: 'sources', value: 'AIS + GFW + FRED' },
          ].map(({ label, value }) => (
            <span key={label} style={{
              display: 'inline-block',
              padding: '2px 7px',
              margin:  '2px 3px 2px 0',
              border:  '1px solid var(--line)',
              color:   'var(--ink-dim)',
            }}>
              {label}: <b style={{ color: 'var(--ink)', fontWeight: 500 }}>{value}</b>
            </span>
          ))}
        </div>

        {/* Messages */}
        <div style={{
          flex:          1,
          overflowY:     'auto',
          padding:       'var(--sp-3)',
          display:       'flex',
          flexDirection: 'column',
          gap:           'var(--sp-3)',
        }}>
          {messages.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' }}>
              {SUGGESTIONS.map(q => (
                <button
                  key={q}
                  onClick={() => void append({ role: 'user', content: q })}
                  onMouseEnter={e => { (e.currentTarget).style.background = 'var(--bg-3)'; }}
                  onMouseLeave={e => { (e.currentTarget).style.background = 'transparent'; }}
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize:   'var(--fs-md)',
                    color:      'var(--ink-dim)',
                    padding:    'var(--sp-2) var(--sp-3)',
                    border:     '1px solid var(--line)',
                    background: 'transparent',
                    textAlign:  'left',
                    cursor:     'pointer',
                    width:      '100%',
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          ) : (
            messages.map(msg => (
              <div
                key={msg.id}
                style={{
                  alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth:  '92%',
                }}
              >
                {/* Tool chips — one per tool_start annotation, hover shows input_summary */}
                {msg.role === 'assistant' && msg.annotations && (
                  <div style={{
                    display:      'flex',
                    flexWrap:     'wrap',
                    gap:          'var(--sp-1)',
                    marginBottom: 'var(--sp-1)',
                  }}>
                    {msg.annotations.filter(isToolStart).map((a, i) => {
                      if (typeof a !== 'object' || a === null || Array.isArray(a)) return null;
                      const name    = String(a['name'] ?? '');
                      const summary = typeof a['input_summary'] === 'string' ? a['input_summary'] : '';
                      return (
                        <span
                          key={i}
                          title={summary}
                          style={{
                            fontSize:   'var(--fs-xs)',
                            color:      'var(--ink-faint)',
                            border:     '1px solid var(--line)',
                            padding:    '1px var(--sp-2)',
                            background: 'var(--bg-3)',
                          }}
                        >
                          ⟳ {prettyTool(name)}
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Message text */}
                <div style={{
                  fontSize:   'var(--fs-base)',
                  lineHeight: 1.55,
                  color:      msg.role === 'user' ? 'var(--ink)' : 'var(--ink-dim)',
                  whiteSpace: 'pre-wrap',
                }}>
                  {msg.content}
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        {/* Compose */}
        <div style={{ borderTop: '1px solid var(--line)', padding: 'var(--sp-2) var(--sp-3)' }}>
          <form onSubmit={handleSubmit} style={inputRowStyle}>
            <input
              value={input}
              onChange={handleInputChange}
              placeholder="Ask about the dataset\u2026"
              disabled={status === 'submitted' || status === 'streaming'}
              style={{
                flex:       1,
                background: 'transparent',
                border:     0,
                color:      'var(--ink)',
                fontFamily: 'var(--mono)',
                fontSize:   'var(--fs-base)',
                outline:    'none',
                padding:    '8px 0',
              }}
            />
            {status === 'streaming' ? (
              <button type="button" onClick={stop} style={btnStyle}>
                stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={status === 'submitted' || !input.trim()}
                style={btnStyle}
              >
                send
              </button>
            )}
          </form>
        </div>

      </div>
    </>
  );
}
