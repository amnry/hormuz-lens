'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import DeckGL from '@deck.gl/react';
import { _GlobeView as GlobeView } from '@deck.gl/core';
import { Map } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { buildFlagColorMap } from '../../lib/util/colors';
import { makeScatterLayer, makeTripsLayer, makeArcLayer } from './layers';
import type { ScatterPoint, ArcDatum } from './layers';
import type { PositionRow } from '../../lib/db/queries';

const BASEMAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

const INITIAL_VIEW_STATE = {
  longitude: 56.3,
  latitude: 26.5,
  zoom: 4.2,
  pitch: 0,
  bearing: 0,
};

interface HoverInfo {
  object: ScatterPoint;
  x: number;
  y: number;
}

interface Props {
  positions: PositionRow[];
}

export default function Globe({ positions }: Props) {
  const [viewState, setViewState] = useState(INITIAL_VIEW_STATE);
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);
  const [arcData, setArcData] = useState<ArcDatum[]>([]);
  const colorMapRef = useRef<Record<string, [number, number, number]>>({});

  useEffect(() => {
    colorMapRef.current = buildFlagColorMap();
  }, []);

  const scatterPoints: ScatterPoint[] = positions.map((p) => ({
    mmsi:      p.mmsi,
    lat:       p.lat,
    lon:       p.lon,
    flag_iso2: p.flag_iso2,
    name:      p.name,
    ts:        p.ts,
  }));

  const handleHover = useCallback(
    (info: { object?: ScatterPoint; x: number; y: number } | null) => {
      if (info?.object) {
        setHoverInfo({ object: info.object, x: info.x, y: info.y });
      } else {
        setHoverInfo(null);
      }
    },
    [],
  );

  const handleClick = useCallback((info: { object?: ScatterPoint }) => {
    if (!info.object) {
      setArcData([]);
      return;
    }
    setArcData([{
      sourcePosition: [56.3, 26.5],
      targetPosition: [info.object.lon, info.object.lat],
      flag_iso2: info.object.flag_iso2,
    }]);
  }, []);

  const layers = [
    makeScatterLayer(scatterPoints, colorMapRef.current, handleHover, handleClick),
    makeTripsLayer([], colorMapRef.current, 0),
    makeArcLayer(arcData, colorMapRef.current, arcData.length > 0),
  ];

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#05070c' }}>
      <DeckGL
        views={new GlobeView({ id: 'globe' })}
        viewState={viewState}
        onViewStateChange={({ viewState: vs }) => setViewState(vs as unknown as typeof INITIAL_VIEW_STATE)}
        layers={layers}
        controller={true}
        style={{ position: 'absolute', top: '0', left: '0', right: '0', bottom: '0' }}
      >
        <Map
          mapStyle={BASEMAP_STYLE}
          style={{ width: '100%', height: '100%' }}
          attributionControl={false}
        />
      </DeckGL>

      <button
        onClick={() => setViewState(INITIAL_VIEW_STATE)}
        style={{
          position: 'absolute', top: '16px', right: '336px', zIndex: 25,
          background: 'color-mix(in oklab, var(--bg-2) 92%, transparent)',
          border: '1px solid var(--line)', color: 'var(--ink-dim)',
          fontFamily: 'var(--mono)', fontSize: '10px', letterSpacing: '0.14em',
          textTransform: 'uppercase', padding: '6px 10px', cursor: 'pointer',
          backdropFilter: 'blur(6px)',
        }}
      >
        ◎ RESET VIEW
      </button>

      {hoverInfo && (
        <div
          style={{
            position: 'absolute', left: hoverInfo.x, top: hoverInfo.y, zIndex: 40,
            background: 'var(--bg)', border: '1px solid var(--line)',
            padding: '6px 8px', fontSize: '10.5px', minWidth: '170px',
            transform: 'translate(12px, -50%)', pointerEvents: 'none',
          }}
        >
          <div style={{ fontWeight: 500, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {hoverInfo.object.flag_iso2 && (
              <span style={{
                width: '7px', height: '7px',
                background: `var(--flag-${hoverInfo.object.flag_iso2.toLowerCase()}, var(--flag-ot))`,
                display: 'inline-block', flexShrink: 0,
              }} />
            )}
            {hoverInfo.object.name ?? hoverInfo.object.mmsi}
          </div>
          {([
            ['MMSI', hoverInfo.object.mmsi],
            ['Flag', hoverInfo.object.flag_iso2 ?? '—'],
            ['Date', hoverInfo.object.ts.slice(0, 10)],
          ] as [string, string][]).map(([label, value]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
              <span style={{ color: 'var(--ink-dim)' }}>{label}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</span>
            </div>
          ))}
          <div style={{
            color: 'var(--ink-faint)', fontSize: '9.5px', marginTop: '5px',
            letterSpacing: '0.08em', textTransform: 'uppercase',
            borderTop: '1px dashed var(--line-soft)', paddingTop: '5px',
          }}>
            Click to show transit arc
          </div>
        </div>
      )}
    </div>
  );
}
