import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { getServiceClient } from '../../db/service-client';

const TABLES = ['daily_transits', 'flag_mix_daily', 'petrodollar_daily', 'data_quality_daily', 'events'] as const;
type AggregatTable = typeof TABLES[number];

const inputSchema = z.object({
  table: z.enum(TABLES).describe(
    'Which aggregate table to query. ' +
    'daily_transits: date + vessel_count + by_flag (jsonb). ' +
    'flag_mix_daily: date + flag + count + share. ' +
    'petrodollar_daily: date + brent_usd + wti_usd. ' +
    'data_quality_daily: date + ais_messages_received + transponder_silence_flag. ' +
    'events: id + kind + title + ts + description.',
  ),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
    .describe('Start date inclusive, YYYY-MM-DD'),
  to:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
    .describe('End date inclusive, YYYY-MM-DD'),
  limit: z.number().int().min(1).max(500).optional().default(365)
    .describe('Row limit, default 365, max 500'),
});

// events uses timestamptz column 'ts'; all others use date column 'date'
const DATE_COLUMN: Record<AggregatTable, string> = {
  daily_transits:     'date',
  flag_mix_daily:     'date',
  petrodollar_daily:  'date',
  data_quality_daily: 'date',
  events:             'ts',
};

export const sqlQueryAggregates = tool(
  async ({ table, from, to, limit }): Promise<string> => {
    const db  = getServiceClient();
    const col = DATE_COLUMN[table];

    let q = db.from(table).select('*').order(col, { ascending: true }).limit(limit);
    if (from) q = q.gte(col, from);
    if (to)   q = q.lte(col, to);

    const { data, error } = await q;
    if (error) throw new Error(`Query error on ${table}: ${error.message}`);

    if (!data || data.length === 0) {
      const range = from || to
        ? ` between ${from ?? '*'} and ${to ?? '*'}`
        : '';
      return `No rows found in ${table}${range}.`;
    }

    // Summarise before stringifying so the LLM gets a compact but complete view.
    // For large row sets (> 30) include a summary header with min/max dates.
    let header = '';
    if (data.length > 30) {
      const first = (data[0] as Record<string, unknown>)[col] as string;
      const last  = (data[data.length - 1] as Record<string, unknown>)[col] as string;
      header = `${table}: ${data.length} rows, ${first} → ${last}\n\n`;
    }

    return header + JSON.stringify(data, null, 0);
  },
  {
    name: 'sql_query_aggregates',
    description:
      'Query the Hormuz aggregate tables. Never accepts raw SQL — table and date ' +
      'range are the only inputs. Use daily_transits for vessel counts, ' +
      'flag_mix_daily for flag breakdowns, petrodollar_daily for Brent/WTI prices, ' +
      'data_quality_daily for AIS coverage checks, events for strait closure records.',
    schema: inputSchema,
  },
);
