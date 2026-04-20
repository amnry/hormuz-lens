// Supabase service-role client factory. Shared by all ingestion scripts.
// Throws clearly if required env vars are absent.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

type ServiceClient = SupabaseClient<Database>;

let _client: ServiceClient | undefined;

export function getServiceClient(): ServiceClient {
  if (_client) return _client;
  const url = process.env['SUPABASE_URL'] ?? process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url) throw new Error('Missing env var: SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL');
  if (!key) throw new Error('Missing env var: SUPABASE_SERVICE_ROLE_KEY');
  _client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}
