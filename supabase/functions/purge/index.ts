// =============================================================================
// Purge Edge Function — the ONLY place rows are physically deleted, run as the
// service role. Invoke daily (see DEPLOYMENT.md for the pg_cron schedule).
//
// 1. Select rows soft-deleted more than 30 days ago.
// 2. Remove their storage objects (files only) — object first...
// 3. ...then hard-delete the rows. Order matters so a failure can't orphan a
//    row whose blob is already gone.
//
// Equivalent logic also lives in the Next.js route app/api/cron/purge (driven
// by Vercel Cron) — deploy whichever scheduler you prefer. Running both is
// harmless: the second run simply finds nothing left to purge.
// =============================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const RETENTION_DAYS = 30;

Deno.serve(async (req) => {
  // Reject anything but the scheduler. The function is invoked with the
  // service-role key in the Authorization header.
  const auth = req.headers.get("Authorization") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (auth !== `Bearer ${serviceKey}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey, {
    auth: { persistSession: false },
  });

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString();

  // --- files: object first, then row -----------------------------------------
  const { data: files, error: filesErr } = await admin
    .from("files")
    .select("id, storage_path")
    .lt("deleted_at", cutoff);
  if (filesErr) return json({ error: filesErr.message }, 500);

  let purgedFiles = 0;
  for (const f of files ?? []) {
    const { error: rmErr } = await admin.storage
      .from("course-materials")
      .remove([f.storage_path]);
    // Treat "already gone" as success; bail on real storage errors.
    if (rmErr && !/not.*found/i.test(rmErr.message)) {
      return json({ error: `storage remove failed for ${f.id}: ${rmErr.message}` }, 500);
    }
    const { error: delErr } = await admin.from("files").delete().eq("id", f.id);
    if (delErr) return json({ error: `row delete failed for ${f.id}: ${delErr.message}` }, 500);
    purgedFiles++;
  }

  // --- folders: no storage objects, delete rows --------------------------------
  const { data: folders, error: foldersErr } = await admin
    .from("folders")
    .delete()
    .lt("deleted_at", cutoff)
    .select("id");
  if (foldersErr) return json({ error: foldersErr.message }, 500);

  return json({ purgedFiles, purgedFolders: folders?.length ?? 0, cutoff }, 200);
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
