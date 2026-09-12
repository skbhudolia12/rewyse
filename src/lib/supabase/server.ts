import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { publicEnv, serverEnv } from '@/lib/env';

/**
 * Request-scoped client carrying the user's session. Every query through this
 * client is subject to RLS, which is the intended posture for all application
 * code -- reach for `createAdminClient` only where documented below.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components cannot set cookies. Session refresh is handled
            // in middleware, so this is safe to swallow here and only here.
          }
        },
      },
    },
  );
}

/**
 * Service-role client. Bypasses RLS entirely.
 *
 * Legitimate uses are narrow and deliberate:
 *   - reading and writing `price_cache` (not client-writable, to prevent a
 *     forged cache entry driving the price shown to a seller)
 *   - inserting `notifications` on another user's behalf
 *   - deleting an ID document from storage after a review decision
 *
 * Never hand a user-supplied identifier to this client without having already
 * authorized the caller against it with the RLS-bound client.
 */
export function createAdminClient() {
  return createSupabaseClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv().SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
