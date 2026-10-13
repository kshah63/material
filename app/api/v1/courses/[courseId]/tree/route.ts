import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  apiError,
  authorizeApiRequest,
  canSeeTeacherOnly,
} from "@/lib/api/auth";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface FolderRow {
  id: string;
  parent_id: string | null;
  name: string;
  eff_teacher_only: boolean;
}

interface FileRow {
  id: string;
  folder_id: string | null;
  name: string;
  size_bytes: number | null;
  mime_type: string;
  eff_teacher_only: boolean;
  created_at: string;
}

interface TreeFile {
  id: string;
  name: string;
  size_bytes: number | null;
  mime_type: string;
  teacher_only: boolean;
  created_at: string;
}

interface TreeFolder {
  id: string | null; // null = course root
  name: string;
  folders: TreeFolder[];
  files: TreeFile[];
}

/**
 * GET /api/v1/courses/{courseId}/tree?role=student|teacher
 *
 * The whole live folder tree of a course in one response, filtered for the
 * acting role the way RLS filters it for a signed-in member: students never
 * see teacher-only folders or files (nor anything beneath a teacher-only
 * folder); every other role sees everything. Trash is never included.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> },
) {
  const auth = authorizeApiRequest(
    request,
    request.nextUrl.searchParams.get("role"),
  );
  if (!auth.ok) return auth.response;

  const { courseId } = await params;
  if (!UUID_RE.test(courseId)) return apiError(404, "Course not found.");

  const admin = createServiceClient();
  const { data: course, error: courseErr } = await admin
    .from("courses")
    .select("id, name, code")
    .eq("id", courseId)
    .maybeSingle();
  if (courseErr) return apiError(500, courseErr.message);
  if (!course) return apiError(404, "Course not found.");

  const [
    { data: folders, error: foldersErr },
    { data: files, error: filesErr },
  ] = await Promise.all([
    admin
      .from("folders")
      .select("id, parent_id, name, eff_teacher_only")
      .eq("course_id", courseId)
      .is("deleted_at", null)
      .order("name", { ascending: true }),
    admin
      .from("files")
      .select(
        "id, folder_id, name, size_bytes, mime_type, eff_teacher_only, created_at",
      )
      .eq("course_id", courseId)
      .is("deleted_at", null)
      .order("name", { ascending: true }),
  ]);
  if (foldersErr) return apiError(500, foldersErr.message);
  if (filesErr) return apiError(500, filesErr.message);

  const root = buildTree(
    (folders ?? []) as FolderRow[],
    (files ?? []) as FileRow[],
    canSeeTeacherOnly(auth.caller.role),
    course.name as string,
  );

  return NextResponse.json({
    course: {
      id: course.id as string,
      name: course.name as string,
      code: (course.code as string | null) ?? null,
    },
    root,
  });
}

/**
 * Assemble the nested tree from flat rows by walking down from the root.
 * Walking (rather than filtering rows one by one) means a hidden teacher-only
 * folder takes its whole subtree with it, even a descendant explicitly flagged
 * teacher_only = false. Rows whose parent isn't live are dropped too.
 */
function buildTree(
  folders: FolderRow[],
  files: FileRow[],
  showTeacherOnly: boolean,
  rootName: string,
): TreeFolder {
  const foldersByParent = new Map<string | null, FolderRow[]>();
  for (const f of folders) {
    const siblings = foldersByParent.get(f.parent_id) ?? [];
    siblings.push(f);
    foldersByParent.set(f.parent_id, siblings);
  }
  const filesByFolder = new Map<string | null, FileRow[]>();
  for (const f of files) {
    const siblings = filesByFolder.get(f.folder_id) ?? [];
    siblings.push(f);
    filesByFolder.set(f.folder_id, siblings);
  }

  const visible = <T extends { eff_teacher_only: boolean }>(rows: T[]) =>
    showTeacherOnly ? rows : rows.filter((r) => !r.eff_teacher_only);

  const build = (id: string | null, name: string): TreeFolder => ({
    id,
    name,
    folders: visible(foldersByParent.get(id) ?? []).map((f) =>
      build(f.id, f.name),
    ),
    files: visible(filesByFolder.get(id) ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      size_bytes: f.size_bytes,
      mime_type: f.mime_type,
      teacher_only: f.eff_teacher_only,
      created_at: f.created_at,
    })),
  });

  return build(null, rootName);
}
