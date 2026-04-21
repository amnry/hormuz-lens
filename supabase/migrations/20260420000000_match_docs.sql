-- ── match_docs: cosine similarity search over chatbot_docs ───────────────────
--
-- Wraps the pgvector <=> operator so the Supabase JS client can call it via
-- .rpc('match_docs', { query_embedding, match_count }) without raw SQL.
-- search_path includes extensions so the <=> operator resolves correctly.

create or replace function match_docs(
  query_embedding  extensions.vector(1536),
  match_count      int default 5
)
returns table (
  chunk     text,
  metadata  jsonb,
  score     double precision
)
language sql stable
set search_path = extensions, public, pg_catalog
as $$
  select
    chunk,
    metadata,
    1 - (embedding <=> query_embedding) as score
  from chatbot_docs
  order by embedding <=> query_embedding
  limit match_count;
$$;
