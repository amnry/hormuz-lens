# Decisions

Chronological log of architectural decisions. Each entry names the choice, the alternative rejected, and the reason. Append-only; supersede with a new entry rather than editing.

---

## 001. AISStream.io over MarineTraffic scraping

Chose AISStream.io's free WebSocket feed (`wss://stream.aisstream.io/v0/stream`, bounding-box subscriptions, OpenAPI-defined message types) over scraping MarineTraffic's rendered map tiles. Scraping violates MarineTraffic's ToS and arrives minutes late via DOM polling, while AISStream gives us push-latency frames from a real AIS station network under a permissive API key model that costs nothing at our volume.

## 002. deck.gl over Globe.gl

Chose deck.gl with `GlobeView` over Globe.gl (the three.js wrapper used in the HTML mockup). deck.gl is the production WebGL stack Uber uses for fleet visualisation, its `TripsLayer` and `ArcLayer` match exactly the taxi-trips example that inspired the historical-replay feature, and its layer composition model scales to 10k+ vessels where Globe.gl's per-object mesh approach stalls.

## 003. Supabase over Neon + SST

Chose Supabase over a Neon Postgres + SST (Serverless Stack) combination. Supabase gives us Postgres, Edge Functions for the long-lived WebSocket ingestor, `pg_cron` for rollups, pgvector for the agent's document store, and auth in a single dashboard with one set of credentials, whereas Neon + SST would require wiring Lambda schedules, a separate vector store, and a WebSocket-friendly compute tier ourselves.

## 004. OpenRouter over direct Anthropic API

Chose OpenRouter as the LLM gateway over calling the Anthropic API directly. OpenRouter exposes a unified schema across Claude, GPT, Gemini, and open-weights models with automatic fallback on rate limits or outages, which both demonstrates cost awareness to reviewers and lets us route cheap tool-call turns to free-tier models while reserving the expensive model for the final synthesis step.

**Amendment (2026-04-20):** Free-tier OpenRouter models are unreliable for agent orchestration. Two concrete failure modes encountered during Phase 5: (1) `google/gemini-2.0-flash-exp:free` returned 404 (model discontinued without notice); (2) `meta-llama/llama-3.3-70b-instruct:free` returned 400 because the Venice provider enforces a 16384-token cap that conflicts with LangChain's default max_tokens parameter. Additionally, OpenRouter pre-reserves `input_tokens + max_completion` against the key's monthly credit limit on every request -- free models with large context windows (64k) can exhaust a key's budget even at low traffic. We replaced the free-tier primary with `anthropic/claude-haiku-4-5` (paid, ~$0.80/MTok input) and capped `maxTokens: 4096` on both primary and fallback to bound per-request reservation.

## 005. LangGraph over a raw agent loop

Chose LangGraph's `StateGraph` over a hand-rolled `while (not done) { call_model; run_tools }` loop. An explicit graph with typed state, named nodes, and declared edges is straightforward to snapshot, replay, and evaluate with LangSmith, whereas a raw loop hides control flow inside closures and makes it painful to test tool-selection behaviour in isolation.

## 006. Aggregate + coarse-position backfill for Jan 1 to Apr 16 2026

GFW's 4Wings presence report (`public-global-presence:v4.0`) returns one record per vessel per day inside the Hormuz bbox, including a position centroid (lat, lon) and entry/exit timestamps. These are not per-ping AIS tracks but are real coordinates, so the backfill populates `positions` with one coarse point per vessel-day and the aggregate tables (`daily_transits`, `flag_mix_daily`) are computed from the same source. Live trails from Apr 20 2026 onward are per-ping (via AISStream) and render as smooth tracks; historical trails render as coarser daily centroids. The UI discloses this distinction in the globe legend.

## 007. No vessel-identity enrichment step

Dropped the per-vessel identity lookup (`/v3/vessels/{id}?dataset=public-global-vessel-identity:latest`) from the backfill pipeline. The 4Wings report already returns `mmsi`, `imo`, `shipName`, `flag` (ISO3), `vesselType`, and `callsign` inline, which is sufficient for the `vessels` and `positions` tables. Identity lookups would cost ~929 calls per day times 108 days equals ~100k redundant API calls with no additional filterable fields, since GFW strips the AIS numeric ship-type code from identity responses and `tonnageGt` has only ~20-30% coverage. Removing this step collapses the ingest pipeline from three API tiers to one.

## 008. CARGO-class filter retains bulk carriers alongside crude tankers

GFW's presence dataset classifies vessels as CARGO, OTHER, FISHING, PASSENGER, BUNKER, or GEAR, with no finer tanker subtype available. The richer taxonomy (`BUNKER_OR_TANKER`, `VLCC`, etc.) exists in commercial providers like Kpler and Spire but not in GFW's free tier. `tonnageGt` is too sparsely populated (~20% coverage) to serve as a deadweight proxy. CARGO is the narrowest available filter that retains crude tankers, but it also includes bulk carriers, container ships, and general cargo. Despite the broader denominator, the Feb 28 closure signal still registers clearly in `daily_transits.vessel_count` (~140/day pre-closure dropping to ~50/day in early March). The UI labels the metric "Commercial cargo vessel transits" rather than "Crude tanker transits" to match what the data actually represents.

## 009. Store full ISO2 flag codes, bucket to Gulf + Other at render time

Ingest stores every vessel's true flag as ISO2 (PA, LR, MH, CN, IN, IR, SA, etc.) in both `vessels.flag` and `daily_transits.by_flag`. The UI-layer bucketing into 7 Gulf states plus Other happens at query time via a server-side aggregation, not at ingest. This keeps the data honest: questions like "which flags dominated among non-Gulf transits in March" are answerable from the raw data, and the UI still renders the clean 8-category flag-mix panel the design specifies. A separate `GULF_FLAGS_UI` constant in `lib/util/flags.ts` defines the display buckets independently of the storage schema. Storage stays lossless; display stays clean.

**Update (Phase 4.5):** The UI-layer query now returns the top 5 flags by count plus an Other row, rather than bucketing to the seven Gulf states. The storage approach (full ISO2 fidelity) is unchanged. The Gulf-state bucketing was a design assumption that did not match what the data shows: flags of convenience (Panama, Liberia, Marshall Islands) dominate Hormuz transits over Gulf state flags. The revised panel tells the more interesting true story.

## 010. Flag data requires flag-of-convenience context in the chatbot

The dataset's flag distribution is dominated by open registries: Panama, Liberia, Marshall Islands, Comoros. These are registration jurisdictions, not beneficial-owner nationalities. Panama and Liberia together account for ~30-40% of daily Hormuz transits in the Jan 1 to Feb 27 baseline. Comoros appears as a secondary-tier registry notably used by the Iranian and Russian shadow fleet for sanctions-adjacent oil movement. Chinese interests are underrepresented in the raw flag data because Chinese-owned vessels typically fly HK, LR, PA, or MH rather than CN. The flag-mix UI panel shows the 7 Gulf states plus Other for clean geopolitical reading, but the chatbot's RAG corpus includes a flag-of-convenience primer so questions like "why is Panama dominant" get grounded answers rather than surface-level flag counts.

## 011. Closure signal is visible but non-monotonic

The Feb 28 2026 strait closure registers clearly in the backfill: baseline of ~140 vessels/day (Feb 20-27) drops to ~50 vessels/day for the first week of March (Mar 1-6), a ~64% decline. Mar 7-9 shows a brief return toward baseline (122-148) followed by another drop on Mar 10, consistent with the "selective passage" regime observed in public reporting. The dataset captures the real pattern of partial reopenings and re-restrictions rather than a clean single cliff. The chatbot's `compute_correlation` tool handles this non-monotonicity by using Feb 1-27 as the clean pre-closure window and Mar 1-Apr 16 as the post-closure window, rather than a simple pre/post split on Feb 28, which would smuggle the boundary-day transition into one bucket or the other.