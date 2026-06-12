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
 * returns a pre-authorized URL; the browser uploads the bytes to it. This does
 * not rely on the browser holding a valid Storage token, so it's immune to
 * token expiry and the storage-RLS/gateway quirks that block direct uploads.
 *
 * Bytes go up via XMLHttpRequest so we get real upload progress. If that fails
 * for any reason, we fall back to the supabase-js uploadToSignedUrl (no
 * granular progress) with a freshly minted token.
 */
export async function resumableUpload(opts: UploadOpts): Promise<void> {
  const signed = await createSignedUpload(opts.objectName);
  if (!signed.ok) throw new Error(signed.error);

  opts.onProgress?.(0, opts.file.size);

  try {
    await putWithProgress(signed.signedUrl, opts);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    // Fallback: SDK path with a fresh token (the first token may be spent).
    const supabase = createClient();
    const retry = await createSignedUpload(opts.objectName);
    if (!retry.ok) throw new Error(retry.error);
    const { error } = await supabase.storage
      .from(BUCKET)
      .uploadToSignedUrl(retry.path, retry.token, opts.file, {
        contentType: "application/pdf",
      });
    if (error) throw error;
  }

  opts.onProgress?.(opts.file.size, opts.file.size);
}

/**
 * Mirror supabase-js uploadToSignedUrl's request (multipart PUT to the signed
 * URL) but over XHR so we can report byte progress. Progress is scaled to the
 * raw file size so the UI reads cleanly despite multipart overhead.
 */
function putWithProgress(signedUrl: string, opts: UploadOpts): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const form = new FormData();
    form.append("cacheControl", "3600");
    form.append("", opts.file);

    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl, true);
    xhr.setRequestHeader("apikey", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    xhr.setRequestHeader("x-upsert", "false");

    const total = opts.file.size;
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      const sent = Math.min(total, Math.round((e.loaded / e.total) * total));
      opts.onProgress?.(sent, total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (${xhr.status}). ${xhr.responseText ?? ""}`));
    };
    xhr.onerror = () => reject(new Error("Network error during upload."));

    if (opts.signal) {
      opts.signal.addEventListener("abort", () => xhr.abort());
    }
    xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));

    xhr.send(form);
  });
}
