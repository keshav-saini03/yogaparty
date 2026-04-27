import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * Server-only Supabase client using the service role key.
 * NEVER import this from a Client Component or expose it via a public route.
 * Use only in Server Actions, Route Handlers, or RSC server-side code that
 * needs to bypass RLS (e.g., aggregate counts on the live counter).
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'createAdminClient: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set'
    );
  }
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
