import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  apiError,
  authorizeApiRequest,
  canSeeTeacherOnly,
} from "@/lib/api/auth";

export const dynamic = "force-dynamic";

const VIEW_URL_TTL_SECONDS = 60;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/v1/files/{fileId}/view-url — mint a 60-second signed URL for
 * viewing. The viewing half of getViewUrl() in app/actions/files.ts, except
 * the teacher-only check is done here against the acting role (the service
 * role sees every row, so RLS can't do it for us). No download variant: the
 * lessons platform only ever opens material in a viewer.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const auth = authorizeApiRequest(request);
  if (!auth.ok) return auth.response;

  const { fileId } = await params;
  if (!UUID_RE.test(fileId)) return apiError(404, "File not found.");

  const admin = createServiceClient();
  const { data: file, error: fileErr } = await admin
    .from("files")
    .select("storage_path, name, eff_teacher_only, deleted_at")
    .eq("id", fileId)
    .maybeSingle();
  if (fileErr) return apiError(500, fileErr.message);
  if (!file || file.deleted_at !== null) return apiError(404, "File not found.");
  if (file.eff_teacher_only && !canSeeTeacherOnly(auth.caller.role)) {
    return apiError(403, "Teacher-only material.");
  }

  const { data, error } = await admin.storage
    .from("course-materials")
    .createSignedUrl(file.storage_path, VIEW_URL_TTL_SECONDS);
  if (error || !data) {
    return apiError(500, error?.message ?? "Could not sign URL.");
  }

  // Signed URLs are secrets with a 60s life — never let anything cache them.
  return NextResponse.json(
    {
      url: data.signedUrl,
      name: file.name as string,
      expires_in: VIEW_URL_TTL_SECONDS,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
