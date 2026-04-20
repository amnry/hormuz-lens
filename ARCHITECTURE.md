# Architecture

End-to-end data flow for hormuz.lens. Written to stay legible at a glance; deeper rationale lives in `DECISIONS.md`.

## 1. Ingestion — AISStream.io → Supabase Edge Function

A long-running Supabase Edge Function holds an authenticated WebSocket to `wss://stream.aisstream.io/v0/stream`, subscribed to the Strait of Hormuz bounding box (25.5–27.0°N, 55.5–58.5°E) with `FilterMessageTypes: ["PositionReport", "ShipStaticData"]`. Each frame is parsed, normalised to a `{mmsi, imo, flag, lat, lon, sog, cog, draft, ts}` shape, and written in ~500-row batches to `ais_positions` (hypertable-style partitioned table in Supabase Postgres). A separate `vessels` table holds static particulars, upserted on any `ShipStaticData` message.

## 1b. Backfill — Global Fishing Watch API

AISStream has no historical API; the live WebSocket only covers from the moment of first connection. Jan 1 2025 through Feb 27 2025 is backfilled from the Global Fishing Watch Vessels API (`https://globalfishingwatch.org/our-apis/`). GFW provides free API tokens, strong global coverage including the Gulf, and includes cargo and tanker vessel tracks under an Apache-2.0-compatible data license. The backfill job (a one-shot Supabase Edge Function) pages through the GFW tracks endpoint filtered to the same bounding box, normalises records to the same `{mmsi, imo, flag, lat, lon, sog, cog, draft, ts}` shape as live data, and bulk-inserts into `ais_positions` with a `source: 'gfw'` column for provenance. Live rows carry `source: 'aisstream'`. All downstream views and the agent treat both sources uniformly.

## 2. Aggregation — scheduled materialized views

Supabase `pg_cron` runs six rollups:

- `daily_transits` — one row per vessel per day with `entered_choke_at`, `exited_choke_at`, `flag`, `cargo_class`, `dwt`.
- `flag_mix_daily` — flag-state vessel counts and share per day.
- `throughput_mbd_daily` — estimated crude throughput in Mb/d, joining DWT × cargo class × known load factors.
- `correlations_30d` — rolling Pearson correlation between daily transits and Brent close (FRED API series `DCOILBRENTEU`, pulled by a second cron job).
- `data_quality_daily` — AIS reliability tracking: per-day counts of dark vessels (gap > 6 h), suspected spoofers (stationary MMSI with moving position), and AIS receiver coverage gaps over the bounding box.
- `events` — append-only table of named regime changes pinned to a date, seeded with the Feb 28 2025 entry (`{date: 2025-02-28, label: "Regime change", notes: "..."}`). Used by the chart layer to render threshold lines and by the agent to anchor pre/post comparisons.

Views refresh every 15 minutes; Brent series refreshes daily at 00:10 UTC.

## 3. Read path — Next.js 15 server components

App Router server components query the rollups directly through the Supabase server client (service role, no PostgREST in the hot path). The page streams a React Server Component tree: `<InfoPanel>`, `<Chart>`, and `<Dock>` render from aggregates; `<Globe>` is a client boundary that receives only the current-window vessel set as serialized props.

## 4. Render — deck.gl on the client

The globe is a deck.gl `Deck` instance with a `GlobeView`. Layers: `GeoJsonLayer` (land), `ScatterplotLayer` (vessels), `ArcLayer` (focused route), and a `TripsLayer` for historical replay. WebGL2, one draw per frame, targets 60 fps with ~5k vessels.

## 5. Agent — LangGraph via OpenRouter

The `/api/chat` route hands the user turn to a LangGraph `StateGraph` with three tools:

- `vector_search_docs` — pgvector similarity search over ingested EIA and Kpler methodology notes.
- `sql_query_aggregates` — read-only SQL against the materialized views, schema-constrained.
- `compute_correlation` — returns the rolling 7-day Pearson correlation between daily transits and Brent close, plus the pre-Feb-28 and post-Feb-28 split means for both series. Computed in-process from `correlations_30d` and `events`; not a raw SQL passthrough.

The graph node calls the LLM through OpenRouter so we can swap between Claude, GPT, and Llama providers without code changes and fall back on rate limits. Tool outputs are appended to state; the final node streams tokens back to the drawer.
