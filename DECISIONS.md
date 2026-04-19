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

## 005. LangGraph over a raw agent loop

Chose LangGraph's `StateGraph` over a hand-rolled `while (not done) { call_model; run_tools }` loop. An explicit graph with typed state, named nodes, and declared edges is straightforward to snapshot, replay, and evaluate with LangSmith, whereas a raw loop hides control flow inside closures and makes it painful to test tool-selection behaviour in isolation.
