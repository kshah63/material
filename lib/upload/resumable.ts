import { createClient } from "@/lib/supabase/client";
import { createSignedUpload } from "@/app/actions/files";

const BUCKET = "course-materials";

interface UploadOpts {
  file: File;
  objectName: string; // courses/{courseId}/{fileId}.pdf
  onProgress?: (sent: number, total: number) => void;
  signal?: AbortSignal;
}

/**
 * Upload one PDF to Storage via a server-minted signed upload URL (§4/§7).
 *
 * The server checks the caller's permission under its always-fresh session and
 * returns a pre-authorized URL; the browser then uploads the bytes to it. This
 * does not rely on the browser holding a valid Storage token, so it's immune to
 * token expiry and the storage-RLS/gateway quirks that block direct uploads.
 */
export async function resumableUpload(opts: UploadOpts): Promise<void> {
  const supabase = createClient();

  const signed = await createSignedUpload(opts.objectName);
  if (!signed.ok) throw new Error(signed.error);

  opts.onProgress?.(0, opts.file.size);

  const { error } = await supabase.storage
    .from(BUCKET)
    .uploadToSignedUrl(signed.path, signed.token, opts.file, {
      contentType: "application/pdf",
    });

  if (error) throw error;
  opts.onProgress?.(opts.file.size, opts.file.size);
}
