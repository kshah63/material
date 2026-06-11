import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for Client Components (browser). Carries the user's session
 * via cookies. Used for auth UI and for direct-to-Storage resumable uploads.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
