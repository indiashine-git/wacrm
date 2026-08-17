import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Lazy, shared service-role client for platform-level actions
// (approving/rejecting accounts, cross-tenant notifications) that
// must see across every tenant, bypassing RLS. Mirrors
// src/lib/ai/admin-client.ts.
let _platformAdminClient: SupabaseClient | null = null

export function supabasePlatformAdmin(): SupabaseClient {
  if (!_platformAdminClient) {
    _platformAdminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
  }
  return _platformAdminClient
}
