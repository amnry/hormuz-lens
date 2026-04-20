#!/usr/bin/env tsx
// Long-running AISStream WebSocket ingestor for the Strait of Hormuz.
// Buffers PositionReport frames and flushes to positions (source='ais_live')
// in batches of 500 or every 5 seconds.  Upserts ShipStaticData to vessels.
// Heartbeat every 60s increments data_quality_daily.ais_messages_received.
// Sets transponder_silence_flag=true if zero messages arrive in any 15-minute
// rolling window.  Reconnects with exponential backoff (1s -> 2s -> ... 30s).
// Graceful SIGINT: flush buffer, close socket, exit 0.
//
// Usage: pnpm ingest:live [--dry-run]

import WebSocket from 'ws';
import { makeLogger } from '../lib/ingestion/logger';
import { getServiceClient } from '../lib/db/service-client';

const log = makeLogger('ais_live');

const WS_URL = 'wss://stream.aisstream.io/v0/stream';
// Hormuz bbox: AISStream wants [[[minLat, minLon], [maxLat, maxLon]]]
const BBOX = [[[25.5, 55.5], [27.0, 58.5]]];
const FLUSH_ROWS = 500;
const FLUSH_MS = 5_000;
const HEARTBEAT_MS = 60_000;
const SILENCE_WINDOW_MS = 15 * 60_000;
const BACKOFF_INIT_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;

// ── Types ────────────────────────────────────────────────────────────────────

interface AisPositionReport {
  Sog?: number;
  Cog?: number;
  Latitude?: number;
  Longitude?: number;
  TrueHeading?: number;
}

interface AisShipStaticData {
  ImoNumber?: number;
  CallSign?: string;
  Name?: string;
  TypeOfShipAndCargo?: number;
  Dimension?: Record<string, unknown>;
  MaximumStaticDraught?: number;
  Destination?: string;
}

interface AisMessage {
  MessageType: string;
  MetaData?: {
    MMSI?: number;
    MMSI_String?: string;
    ShipName?: string;
    latitude?: number;
    longitude?: number;
    time_utc?: string;
  };
  Message?: {
    PositionReport?: AisPositionReport;
    ShipStaticData?: AisShipStaticData;
  };
}

interface PositionRow {
  mmsi: string;
  ts: string;
  lat: number;
  lon: number;
  sog: number | null;
  cog: number | null;
  draft: number | null;
  source: 'ais_live';
}

// ── State ────────────────────────────────────────────────────────────────────

const isDryRun = process.argv.includes('--dry-run');
const positionBuffer: PositionRow[] = [];
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
let silenceTimer: ReturnType<typeof setTimeout> | undefined;

let messagesThisMinute = 0;
let totalMessages = 0;
let lastMessageAt = Date.now();
let shuttingDown = false;
let ws: WebSocket | undefined;

// ── Helpers ──────────────────────────────────────────────────────────────────

function utcDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function mmsiStr(meta: AisMessage['MetaData']): string | null {
  if (!meta) return null;
  if (meta.MMSI_String) return meta.MMSI_String;
  if (meta.MMSI !== undefined) return String(meta.MMSI);
  return null;
}

// ── Database writes ───────────────────────────────────────────────────────────

async function flushPositions(rows: PositionRow[]): Promise<void> {
  if (rows.length === 0) return;
  if (isDryRun) {
    log.info('dry_run_flush', { count: rows.length });
    return;
  }
  const db = getServiceClient();
  const { error } = await db.from('positions').insert(rows);
  if (error) log.warn('position_flush_warn', { count: rows.length, error: error.message });
  else log.info('flushed', { count: rows.length, total_messages: totalMessages });
}

async function upsertVessel(mmsi: string, data: AisShipStaticData, name: string | null): Promise<void> {
  if (isDryRun) {
    log.info('dry_run_vessel_upsert', { mmsi, name });
    return;
  }
  const db = getServiceClient();
  const { error } = await db.from('vessels').upsert(
    {
      mmsi,
      imo: data.ImoNumber ? String(data.ImoNumber) : null,
      name: data.Name ?? name,
      vessel_type: data.TypeOfShipAndCargo ? String(data.TypeOfShipAndCargo) : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'mmsi' },
  );
  if (error) log.warn('vessel_upsert_warn', { mmsi, error: error.message });
}

async function heartbeat(): Promise<void> {
  const count = messagesThisMinute;
  messagesThisMinute = 0;
  log.info('heartbeat', { messages_this_minute: count, total: totalMessages });

  if (isDryRun) return;
  const db = getServiceClient();
  const today = utcDateStr();

  const { data: existing } = await db
    .from('data_quality_daily')
    .select('ais_messages_received')
    .eq('date', today)
    .maybeSingle();

  const accumulated = (existing?.ais_messages_received ?? 0) + count;
  const { error } = await db.from('data_quality_daily').upsert(
    { date: today, ais_messages_received: accumulated },
    { onConflict: 'date' },
  );
  if (error) log.warn('heartbeat_upsert_warn', { error: error.message });
}

async function markSilence(): Promise<void> {
  log.warn('transponder_silence', {
    window_ms: SILENCE_WINDOW_MS,
    last_message_ago_ms: Date.now() - lastMessageAt,
  });
  if (isDryRun) return;
  const db = getServiceClient();
  const { error } = await db.from('data_quality_daily').upsert(
    { date: utcDateStr(), transponder_silence_flag: true },
    { onConflict: 'date' },
  );
  if (error) log.warn('silence_flag_warn', { error: error.message });
}

// ── Buffer management ─────────────────────────────────────────────────────────

function resetSilenceTimer(): void {
  if (silenceTimer) clearTimeout(silenceTimer);
  silenceTimer = setTimeout(() => { void markSilence(); }, SILENCE_WINDOW_MS);
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = undefined;
    const rows = positionBuffer.splice(0);
    void flushPositions(rows);
  }, FLUSH_MS);
}

function enqueue(row: PositionRow): void {
  positionBuffer.push(row);
  messagesThisMinute++;
  totalMessages++;
  lastMessageAt = Date.now();
  resetSilenceTimer();
  scheduleFlush();
  if (positionBuffer.length >= FLUSH_ROWS) {
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = undefined; }
    const rows = positionBuffer.splice(0);
    void flushPositions(rows);
  }
}

// ── Message handling ──────────────────────────────────────────────────────────

function handleMessage(raw: string): void {
  let msg: AisMessage;
  try {
    msg = JSON.parse(raw) as AisMessage;
  } catch {
    log.warn('parse_error', { raw: raw.slice(0, 120) });
    return;
  }

  const meta = msg.MetaData;
  const mmsi = mmsiStr(meta);
  if (!mmsi) return;

  if (msg.MessageType === 'PositionReport') {
    const pr = msg.Message?.PositionReport;
    if (!pr) return;
    const lat = pr.Latitude ?? meta?.latitude;
    const lon = pr.Longitude ?? meta?.longitude;
    if (lat === undefined || lon === undefined) return;
    const ts = meta?.time_utc
      ? new Date(meta.time_utc.replace(' +0000 UTC', 'Z').replace(' ', 'T')).toISOString()
      : new Date().toISOString();
    enqueue({ mmsi, ts, lat, lon, sog: pr.Sog ?? null, cog: pr.Cog ?? null, draft: null, source: 'ais_live' });
  } else if (msg.MessageType === 'ShipStaticData') {
    const sd = msg.Message?.ShipStaticData;
    if (!sd) return;
    void upsertVessel(mmsi, sd, meta?.ShipName ?? null);
  }
}

// ── WebSocket / reconnect ─────────────────────────────────────────────────────

function connect(backoffMs: number): void {
  if (shuttingDown) return;
  log.info('connecting', { url: WS_URL, backoff_ms: backoffMs });
  ws = new WebSocket(WS_URL);

  ws.on('open', () => {
    const apiKey = process.env['AISSTREAM_API_KEY'];
    if (!apiKey) { log.error('missing_key', { key: 'AISSTREAM_API_KEY' }); process.exit(1); }
    ws!.send(JSON.stringify({
      APIKey: apiKey,
      BoundingBoxes: BBOX,
      FilterMessageTypes: ['PositionReport', 'ShipStaticData'],
    }));
    log.info('subscribed', { bbox: BBOX });
    backoffMs = BACKOFF_INIT_MS; // reset on success
    resetSilenceTimer();
  });

  ws.on('message', (data: Buffer | string) => {
    handleMessage(typeof data === 'string' ? data : data.toString('utf-8'));
  });

  ws.on('error', (err: Error) => {
    log.warn('ws_error', { message: err.message });
  });

  ws.on('close', (code: number, reason: Buffer) => {
    if (shuttingDown) return;
    log.warn('ws_closed', { code, reason: reason.toString() });
    const next = Math.min(backoffMs * 2, BACKOFF_MAX_MS);
    log.info('reconnecting', { in_ms: next });
    setTimeout(() => connect(next), next);
  });
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────

async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info('shutdown_start', { buffered: positionBuffer.length });
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = undefined; }
  if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = undefined; }
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = undefined; }
  const rows = positionBuffer.splice(0);
  await flushPositions(rows);
  if (ws) ws.close();
  log.info('shutdown_done', { total_messages: totalMessages });
  process.exit(0);
}

process.on('SIGINT', () => { void shutdown(); });
process.on('SIGTERM', () => { void shutdown(); });

// ── Entry point ───────────────────────────────────────────────────────────────

log.info('start', { dry_run: isDryRun, flush_rows: FLUSH_ROWS, flush_ms: FLUSH_MS });
heartbeatTimer = setInterval(() => { void heartbeat(); }, HEARTBEAT_MS);
connect(BACKOFF_INIT_MS);
