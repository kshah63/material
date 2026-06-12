import * as tus from "tus-js-client";
import { createClient } from "@/lib/supabase/client";
import { createSignedUpload } from "@/app/actions/files";

const BUCKET = "course-materials";
// Supabase's resumable (TUS) endpoint requires a 6MB chunk size exactly.
const CHUNK_SIZE = 6 * 1024 * 1024;
// Files at or above this size upload over TUS so a dropped connection resumes
// from the last chunk. Smaller files use a single signed-URL PUT (less overhead).
const RESUMABLE_THRESHOLD = 10 * 1024 * 1024;

interface UploadOpts {
  file: File;
  objectName: string; // courses/{courseId}/{fileId}.pdf
  onProgress?: (sent: number, total: number) => void;
  signal?: AbortSignal;
}

/**
 * Upload one PDF to Storage (§4/§7).
 *
 * Large files → TUS resumable (chunked, resumes after a dropped connection).
 * Small files → a server-minted signed-URL PUT (no browser storage token, so
 * it's immune to token expiry / RLS quirks).
 *
 * Either path falls back to the other's mechanism on failure, so an upload
 * never fails just because one transport had a bad day.
 */
export async function resumableUpload(opts: UploadOpts): Promise<void> {
  opts.onProgress?.(0, opts.file.size);

  if (opts.file.size >= RESUMABLE_THRESHOLD) {
    try {
      await tusUpload(opts);
      opts.onProgress?.(opts.file.size, opts.file.size);
      return;
    } catch (err) {
      if (isAbort(err)) throw err;
      // fall through to the signed-URL path
    }
  }

  await signedPutUpload(opts);
  opts.onProgress?.(opts.file.size, opts.file.size);
}

// --- TUS resumable (large files) --------------------------------------------

async function tusUpload(opts: UploadOpts): Promise<void> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Not signed in.");

  // Long-lived tabs can drift; refresh the token if it's close to expiry so the
  // resumable endpoint authenticates as the user (not anon).
  let token = session.access_token;
  const expiresSoon = (session.expires_at ?? 0) * 1000 - Date.now() < 60_000;
  if (expiresSoon) {
    const refreshed = await supabase.auth.refreshSession();
    if (refreshed.data.session) token = refreshed.data.session.access_token;
  }

  const endpoint = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`;

  await new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(opts.file, {
      endpoint,
      retryDelays: [0, 1000, 3000, 5000, 10000],
      headers: {
        authorization: `Bearer ${token}`,
        // Both headers required, or the gateway resolves to anon and RLS denies.
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        "x-upsert": "true",
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: CHUNK_SIZE,
      metadata: {
        bucketName: BUCKET,
        objectName: opts.objectName,
        contentType: "application/pdf",
        cacheControl: "3600",
      },
      onError: reject,
      onProgress: (sent, total) => opts.onProgress?.(sent, total),
      onSuccess: () => resolve(),
    });

    opts.signal?.addEventListener("abort", () => {
      upload.abort();
      reject(new DOMException("Aborted", "AbortError"));
    });

    upload.findPreviousUploads().then((previous) => {
      if (previous.length > 0) upload.resumeFromPreviousUpload(previous[0]);
      upload.start();
    });
  });
}

// --- signed-URL PUT (small files + fallback) --------------------------------

async function signedPutUpload(opts: UploadOpts): Promise<void> {
  const signed = await createSignedUpload(opts.objectName);
  if (!signed.ok) throw new Error(signed.error);

  try {
    await putWithProgress(signed.signedUrl, opts);
  } catch (err) {
    if (isAbort(err)) throw err;
    // SDK path with a fresh token (the first signed token may be spent).
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
}

/** Multipart PUT to the signed URL over XHR so we get byte progress. */
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
      opts.onProgress?.(Math.min(total, Math.round((e.loaded / e.total) * total)), total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (${xhr.status}). ${xhr.responseText ?? ""}`));
    };
    xhr.onerror = () => reject(new Error("Network error during upload."));

    opts.signal?.addEventListener("abort", () => xhr.abort());
    xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));

    xhr.send(form);
  });
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}
