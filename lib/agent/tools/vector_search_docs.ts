import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import OpenAI from 'openai';
import { getServiceClient } from '../../db/service-client';

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const EMBED_MODEL     = 'openai/text-embedding-3-small';

// Lazy: reads env at call time, not import time, so cold imports never throw.
function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENROUTER_API_KEY, baseURL: OPENROUTER_BASE });
}

const inputSchema = z.object({
  query: z.string().describe('Natural-language question to search the documentation for'),
  top_k: z.number().int().min(1).max(20).optional().default(5)
    .describe('Number of chunks to retrieve (default 5)'),
});

export const vectorSearchDocs = tool(
  async ({ query, top_k }): Promise<string> => {
    const embeddingRes = await getOpenAI().embeddings.create({
      model: EMBED_MODEL,
      input: query,
    });
    const embedding = embeddingRes.data[0]?.embedding;
    if (!embedding) throw new Error('Embedding response was empty');

    // Retrieve matching chunks via the match_docs RPC.
    // Supabase types express vector params as string (pgvector wire format: "[x,y,...]").
    const db = getServiceClient();
    const { data, error } = await db.rpc('match_docs', {
      query_embedding: `[${embedding.join(',')}]`,
      match_count: top_k,
    });
    if (error) throw new Error(`match_docs RPC error: ${error.message}`);

    if (!data || data.length === 0) {
      return 'No relevant documentation chunks found for that query.';
    }

    const results = (data as Array<{ chunk: string; metadata: Record<string, unknown>; score: number }>)
      .map((r, i) => {
        const src  = r.metadata['source_file'] as string | undefined ?? 'unknown';
        const sec  = r.metadata['section']     as string | undefined ?? '';
        const score = r.score.toFixed(3);
        const header = sec ? `${src} § ${sec}` : src;
        return `[${i + 1}] (score ${score}) ${header}\n${r.chunk.trim()}`;
      })
      .join('\n\n---\n\n');

    return results;
  },
  {
    name:        'vector_search_docs',
    description: 'Semantic search over ARCHITECTURE.md, DECISIONS.md, and DIFFERENTIATION.md. ' +
                 'Use this to ground answers about dataset methodology, design decisions, or ' +
                 'what the data represents.',
    schema: inputSchema,
  },
);
