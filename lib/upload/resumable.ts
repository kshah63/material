import * as tus from "tus-js-client";
import { createClient } from "@/lib/supabase/client";

const BUCKET = "course-materials";
// Supabase's resumable (TUS) endpoint requires a 6MB chunk size exactly.
const CHUNK_SIZE = 6 * 1024 * 1024;

export interface ResumableUploadHandle {
  abort: () => void;
}

/**
 * Resumable, byte-progress upload of one PDF to Storage over TUS (§7.2 step 3).
 * A dropped connection resumes from the last chunk rather than restarting —
 * essential for big files and large batches. The object name is the file's
 * uuid so moves between folders never touch storage.
 */
export async function resumableUpload(opts: {
  file: File;
  objectName: string; // courses/{courseId}/{fileId}.pdf
  onProgress?: (sent: number, total: number) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Not signed in.");

  const endpoint = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`;

  await new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(opts.file, {
      endpoint,
      retryDelays: [0, 1000, 3000, 5000, 10000],
      headers: {
        authorization: `Bearer ${session.access_token}`,
        // Without apikey, Supabase's gateway resolves the request to the anon
        // role and RLS on storage.objects rejects it (403). Both headers are
        // required for the TUS endpoint to see the signed-in user.
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

    // Resume from a previous attempt if the browser remembers this file.
    upload.findPreviousUploads().then((previous) => {
      if (previous.length > 0) upload.resumeFromPreviousUpload(previous[0]);
      upload.start();
    });
  });
}
