import { config } from 'dotenv';
config({ path: '.env.local' });

import { readFileSync } from 'fs';
import { join }         from 'path';
import OpenAI           from 'openai';
import { getServiceClient } from '../lib/db/service-client';

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const EMBED_MODEL     = 'openai/text-embedding-3-small';

const DOCS: Array<{ file: string; path: string }> = [
  { file: 'ARCHITECTURE.md',    path: join(process.cwd(), 'ARCHITECTURE.md') },
  { file: 'DECISIONS.md',       path: join(process.cwd(), 'DECISIONS.md') },
  { file: 'DIFFERENTIATION.md', path: join(process.cwd(), 'DIFFERENTIATION.md') },
];

interface Chunk {
  chunk:    string;
  metadata: { source_file: string; section: string };
}

function chunkByH2(sourceFile: string, content: string): Chunk[] {
  // Split on any newline immediately followed by "## ".
  // Content before the first ## becomes its own chunk (section = h1 title or file preamble).
  const parts = content.split(/\n(?=## )/);
  return parts
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .map(s => {
      const firstLine = s.split('\n')[0] ?? '';
      const section   = firstLine.replace(/^#{1,6}\s*/, '').trim();
      return { chunk: s, metadata: { source_file: sourceFile, section } };
    });
}

async function main() {
  const openai = new OpenAI({
    apiKey:  process.env.OPENROUTER_API_KEY,
    baseURL: OPENROUTER_BASE,
  });
  const db = getServiceClient();

  // 1. Build all chunks from all three docs.
  const allChunks: Chunk[] = [];
  for (const doc of DOCS) {
    const content = readFileSync(doc.path, 'utf-8');
    const chunks  = chunkByH2(doc.file, content);
    console.log(`${doc.file}: ${chunks.length} chunks`);
    allChunks.push(...chunks);
  }
  console.log(`Total chunks: ${allChunks.length}`);

  // 2. Embed all chunks in one batch request.
  console.log('Embedding...');
  const embRes = await openai.embeddings.create({
    model: EMBED_MODEL,
    input: allChunks.map(c => c.chunk),
  });
  const embeddings = embRes.data.map(d => d.embedding);

  // 3. Delete existing rows for these source files (idempotent re-runs).
  const sourceFiles = DOCS.map(d => d.file);
  const { error: delError } = await db
    .from('chatbot_docs')
    .delete()
    .in('metadata->>source_file', sourceFiles);
  if (delError) throw new Error(`Delete failed: ${delError.message}`);
  console.log(`Deleted existing rows for: ${sourceFiles.join(', ')}`);

  // 4. Insert new rows.
  const rows = allChunks.map((c, i) => ({
    chunk:     c.chunk,
    embedding: `[${embeddings[i]!.join(',')}]`,
    metadata:  c.metadata,
  }));

  const { error: insError } = await db.from('chatbot_docs').insert(rows);
  if (insError) throw new Error(`Insert failed: ${insError.message}`);
  console.log(`Inserted ${rows.length} rows into chatbot_docs.`);
}

main().catch(err => { console.error(err); process.exit(1); });
