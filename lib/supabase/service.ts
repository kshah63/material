import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client. Bypasses RLS — server-only, never import into a Client
 * Component. Used only where the spec calls for it:
 *   - minting short-lived signed URLs for viewing (after RLS has authorized),
 *   - admin provisioning (invites / profile + membership creation),
 *   - the purge job.
 */
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
