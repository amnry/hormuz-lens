// Supabase browser client -- use in client components only
import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './types';

export function getClient() {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const key = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];
  if (!url) throw new Error('Missing env var: NEXT_PUBLIC_SUPABASE_URL');
  if (!key) throw new Error('Missing env var: NEXT_PUBLIC_SUPABASE_ANON_KEY');
  return createBrowserClient<Database>(url, key);
}
