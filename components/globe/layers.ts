import { IconLayer, ArcLayer } from '@deck.gl/layers';
import { TripsLayer } from '@deck.gl/geo-layers';
import type { PositionRow } from '../../lib/db/queries';

type RGB = [number, number, number];
type FlagColorMap = Record<string, RGB>;

const FALLBACK_COLOR: RGB = [148, 163, 184]; // --flag-ot slate

function flagColor(flag: string | null, map: FlagColorMap): RGB {
  if (!flag) return FALLBACK_COLOR;
  return map[flag] ?? map['OT'] ?? FALLBACK_COLOR;
}

// 64×64 white upward-pointing triangle; mask:true lets getColor tint it per vessel
const TRIANGLE_ATLAS =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NCIgaGVpZ2h0PSI2NCI+PHBvbHlnb24gcG9pbnRzPSIzMiwyIDYyLDYyIDIsNjIiIGZpbGw9IndoaXRlIi8+PC9zdmc+';

const ICON_MAPPING = {
  triangle: { x: 0, y: 0, width: 64, height: 64, anchorY: 32, mask: true },
} as const;

// ── Icon layer: historical GFW daily centroids ────────────────────────────────

export interface ScatterPoint {
  mmsi: string;
  lat: number;
  lon: number;
  flag_iso2: string | null;
  name: string | null;
  ts: string;
}

export function makeScatterLayer(
  points: ScatterPoint[],
  colorMap: FlagColorMap,
  onHover: (info: { object?: ScatterPoint; x: number; y: number } | null) => void,
) {
  return new IconLayer<ScatterPoint>({
    id: 'gfw-centroids',
    data: points,
    iconAtlas: TRIANGLE_ATLAS,
    iconMapping: ICON_MAPPING,
    getIcon: () => 'triangle',
    getPosition: (d) => [d.lon, d.lat],
    getSize: 10,
    getColor: (d) => [...flagColor(d.flag_iso2, colorMap), 210] as [number, number, number, number],
    pickable: true,
    onHover,
    updateTriggers: { getColor: [colorMap] },
  });
}

// ── Trips layer: live AIS position trails ─────────────────────────────────────

export interface TripPath {
  mmsi: string;
  flag_iso2: string | null;
  waypoints: { coordinates: [number, number]; timestamp: number }[];
}

export function makeTripsLayer(trips: TripPath[], colorMap: FlagColorMap, currentTime: number) {
  return new TripsLayer<TripPath>({
    id: 'ais-live-trips',
    data: trips,
    getPath: (d) => d.waypoints.map((w) => w.coordinates),
    getTimestamps: (d) => d.waypoints.map((w) => w.timestamp),
    getColor: (d) => flagColor(d.flag_iso2, colorMap),
    widthMinPixels: 2,
    widthMaxPixels: 3,
    trailLength: 1800,
    currentTime,
    updateTriggers: { getColor: [colorMap] },
  });
}

// ── Arc layer: vessel origin-to-centroid on click ─────────────────────────────

export interface ArcDatum {
  sourcePosition: [number, number];
  targetPosition: [number, number];
  flag_iso2: string | null;
}

export function makeArcLayer(arcs: ArcDatum[], colorMap: FlagColorMap, visible: boolean) {
  return new ArcLayer<ArcDatum>({
    id: 'vessel-arc',
    data: arcs,
    visible,
    getSourcePosition: (d) => d.sourcePosition,
    getTargetPosition: (d) => d.targetPosition,
    getSourceColor: (d) => [...flagColor(d.flag_iso2, colorMap), 180] as [number, number, number, number],
    getTargetColor: (d) => [...flagColor(d.flag_iso2, colorMap), 60]  as [number, number, number, number],
    getWidth: 1.5,
    updateTriggers: { getSourceColor: [colorMap], getTargetColor: [colorMap] },
  });
}
