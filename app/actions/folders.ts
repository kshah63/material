"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createFolder(
  courseId: string,
  parentId: string | null,
  name: string,
) {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false as const, error: "Name can't be empty." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("folders")
    .insert({
      course_id: courseId,
      parent_id: parentId,
      name: trimmed,
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();

  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/courses/${courseId}`);
  return { ok: true as const, id: data.id };
}

export async function renameFolder(
  folderId: string,
  courseId: string,
  name: string,
) {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false as const, error: "Name can't be empty." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("folders")
    .update({ name: trimmed })
    .eq("id", folderId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/courses/${courseId}`);
  return { ok: true as const };
}

/** Move a folder, rejecting cycles (handled in the move_folder function). */
export async function moveFolder(
  folderId: string,
  courseId: string,
  newParentId: string | null,
) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("move_folder", {
    _folder_id: folderId,
    _new_parent_id: newParentId,
  });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/courses/${courseId}`);
  return { ok: true as const };
}

export async function setFolderTeacherOnly(
  folderId: string,
  courseId: string,
  teacherOnly: boolean | null,
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("folders")
    .update({ teacher_only: teacherOnly })
    .eq("id", folderId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/courses/${courseId}`);
  return { ok: true as const };
}

/** Soft-delete a folder and its whole live subtree under one batch id. */
export async function softDeleteFolder(folderId: string, courseId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("soft_delete_folder", {
    _folder_id: folderId,
  });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/courses/${courseId}`);
  return { ok: true as const };
}

/**
 * Idempotently create the folder rows for a dropped tree and return a
 * relativePath → folder_id map. `paths` are the directory paths (no filename),
 * e.g. ["Algebra2", "Algebra2/Unit1"]. Reuses an existing folder of the same
 * name under the same parent so re-dropping doesn't duplicate structure.
 */
export async function createFolderTree(
  courseId: string,
  rootParentId: string | null,
  paths: string[],
): Promise<{ ok: true; map: Record<string, string> } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Normalize + sort so parents are created before children.
  const unique = Array.from(
    new Set(
      paths
        .map((p) => p.replace(/^\/+|\/+$/g, ""))
        .filter((p) => p.length > 0),
    ),
  );
  // Ensure every intermediate directory is present.
  const withIntermediates = new Set<string>();
  for (const p of unique) {
    const parts = p.split("/");
    for (let i = 1; i <= parts.length; i++) {
      withIntermediates.add(parts.slice(0, i).join("/"));
    }
  }
  const ordered = Array.from(withIntermediates).sort(
    (a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b),
  );

  // map[""] is the drop target (root parent).
  const map: Record<string, string | null> = { "": rootParentId };

  for (const path of ordered) {
    const parts = path.split("/");
    const name = parts[parts.length - 1];
    const parentPath = parts.slice(0, -1).join("");
    const parentId = map[parts.slice(0, -1).join("/")] ?? rootParentId;

    // Reuse an existing live folder of the same name under the same parent.
    const existing = supabase
      .from("folders")
      .select("id")
      .eq("course_id", courseId)
      .eq("name", name)
      .is("deleted_at", null);
    const { data: found } = await (parentId === null
      ? existing.is("parent_id", null)
      : existing.eq("parent_id", parentId)
    ).maybeSingle();

    if (found) {
      map[path] = found.id;
      continue;
    }

    const { data: created, error } = await supabase
      .from("folders")
      .insert({
        course_id: courseId,
        parent_id: parentId,
        name,
        created_by: user?.id ?? null,
      })
      .select("id")
      .single();

    if (error) return { ok: false, error: error.message };
    map[path] = created.id;
    void parentPath;
  }

  revalidatePath(`/courses/${courseId}`);
  // Strip the "" sentinel and any nulls from the returned map.
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(map)) {
    if (k !== "" && v) out[k] = v;
  }
  return { ok: true, map: out };
}
