"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

interface RegisterFileInput {
  id: string; // client-generated uuid, matches the storage object name
  courseId: string;
  folderId: string | null;
  name: string;
  storagePath: string;
  sizeBytes: number;
}

/**
 * Insert a files row AFTER its bytes have committed to Storage. Per-file
 * registration means a batch that dies halfway still persists everything that
 * finished. RLS (files_insert) enforces in_charge/admin.
 */
export async function registerFile(input: RegisterFileInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("files").insert({
    id: input.id,
    course_id: input.courseId,
    folder_id: input.folderId,
    name: input.name,
    storage_path: input.storagePath,
    size_bytes: input.sizeBytes,
    mime_type: "application/pdf",
    uploaded_by: user?.id ?? null,
  });

  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/courses/${input.courseId}`);
  return { ok: true as const };
}

export async function renameFile(
  fileId: string,
  courseId: string,
  name: string,
) {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false as const, error: "Name can't be empty." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("files")
    .update({ name: trimmed })
    .eq("id", fileId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/courses/${courseId}`);
  return { ok: true as const };
}

/** Move a file between folders. Storage path is unchanged; the eff trigger re-resolves. */
export async function moveFile(
  fileId: string,
  courseId: string,
  folderId: string | null,
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("files")
    .update({ folder_id: folderId })
    .eq("id", fileId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/courses/${courseId}`);
  return { ok: true as const };
}

export async function setFileTeacherOnly(
  fileId: string,
  courseId: string,
  teacherOnly: boolean | null,
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("files")
    .update({ teacher_only: teacherOnly })
    .eq("id", fileId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/courses/${courseId}`);
  return { ok: true as const };
}

export async function softDeleteFile(fileId: string, courseId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("soft_delete_file", {
    _file_id: fileId,
  });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/courses/${courseId}`);
  return { ok: true as const };
}

/**
 * Mint a short-lived signed URL for viewing. The select runs under the caller's
 * session — if RLS returns the row they're allowed; the service role only signs.
 * This is the single point where teacher-only is enforced for viewing.
 */
export async function getViewUrl(fileId: string) {
  const userClient = await createClient();
  const { data: file } = await userClient
    .from("files")
    .select("storage_path, name")
    .eq("id", fileId)
    .single();

  if (!file) {
    return { ok: false as const, error: "Not found or not permitted." };
  }

  const admin = createServiceClient();
  const { data, error } = await admin.storage
    .from("course-materials")
    .createSignedUrl(file.storage_path, 60);

  if (error || !data) {
    return { ok: false as const, error: error?.message ?? "Could not sign URL." };
  }
  return { ok: true as const, url: data.signedUrl, name: file.name };
}
