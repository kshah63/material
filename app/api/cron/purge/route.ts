import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RETENTION_DAYS = 30;

/**
 * 30-day purge (§5), driven by Vercel Cron. The only place rows are physically
 * deleted, and it runs as the service role — no user path can hard-delete.
 *
 * Protected by CRON_SECRET. Vercel Cron sends `Authorization: Bearer <secret>`
 * automatically when CRON_SECRET is set in the project env.
 *
 * For each soft-deleted file older than 30 days: remove the storage object
 * FIRST, then delete the row, so a failure can't orphan a row whose blob is
 * already gone. Folders carry no objects, so their rows go straight away.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createServiceClient();
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString();

  const { data: files, error: filesErr } = await admin
    .from("files")
    .select("id, storage_path")
    .lt("deleted_at", cutoff);
  if (filesErr) {
    return NextResponse.json({ error: filesErr.message }, { status: 500 });
  }

  let purgedFiles = 0;
  for (const f of files ?? []) {
    const { error: rmErr } = await admin.storage
      .from("course-materials")
      .remove([f.storage_path]);
    if (rmErr && !/not.*found/i.test(rmErr.message)) {
      return NextResponse.json(
        { error: `storage remove failed for ${f.id}: ${rmErr.message}`, purgedFiles },
        { status: 500 },
      );
    }
    const { error: delErr } = await admin.from("files").delete().eq("id", f.id);
    if (delErr) {
      return NextResponse.json(
        { error: `row delete failed for ${f.id}: ${delErr.message}`, purgedFiles },
        { status: 500 },
      );
    }
    purgedFiles++;
  }

  const { data: folders, error: foldersErr } = await admin
    .from("folders")
    .delete()
    .lt("deleted_at", cutoff)
    .select("id");
  if (foldersErr) {
    return NextResponse.json({ error: foldersErr.message, purgedFiles }, { status: 500 });
  }

  return NextResponse.json({
    purgedFiles,
    purgedFolders: folders?.length ?? 0,
    cutoff,
  });
}
