import * as tus from "tus-js-client";
import { createClient } from "@/lib/supabase/client";

const BUCKET = "course-materials";
// Supabase's resumable (TUS) endpoint requires a 6MB chunk size exactly.
const CHUNK_SIZE = 6 * 1024 * 1024;

interface UploadOpts {
  file: File;
  objectName: string; // courses/{courseId}/{fileId}.pdf
  onProgress?: (sent: number, total: number) => void;
  signal?: AbortSignal;
}

/**
 * Resumable, byte-progress upload of one PDF to Storage over TUS (§7.2 step 3).
 * A dropped connection resumes from the last chunk rather than restarting —
 * essential for big files and large batches. The object name is the file's
 * uuid so moves between folders never touch storage.
 *
 * If the TUS endpoint can't be used (e.g. a gateway/auth quirk), we fall back
 * to the standard supabase-js upload, which authenticates through the same
 * client that works everywhere else. The byte-progress is coarser on the
 * fallback path, but the upload still completes.
 */
export async function resumableUpload(opts: UploadOpts): Promise<void> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Not signed in.");

  try {
    await tusUpload(opts, session.access_token);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    // Fall back to a single-request upload. supabase-js sends the apikey +
    // authorization headers and refreshes the token as needed.
    opts.onProgress?.(0, opts.file.size);
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(opts.objectName, opts.file, {
        contentType: "application/pdf",
        upsert: true,
      });
    if (error) throw error;
    opts.onProgress?.(opts.file.size, opts.file.size);
  }
}

function tusUpload(opts: UploadOpts, accessToken: string): Promise<void> {
  const endpoint = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`;

  return new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(opts.file, {
      endpoint,
      retryDelays: [0, 1000, 3000, 5000],
      headers: {
        authorization: `Bearer ${accessToken}`,
        // Both headers are required or the gateway resolves the request to the
        // anon role and storage RLS rejects it.
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
      onError: (err) => reject(err),
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
