import { createClient } from "@/lib/supabase/server";
import type {
  BreadcrumbCrumb,
  Course,
  CourseRole,
  CourseWithRole,
  EnrollmentRequest,
  FileRow,
  Folder,
  Profile,
} from "./types";

/** Courses the caller belongs to (admins see all), with the caller's role. */
export async function getMyCourses(
  isAdmin: boolean,
): Promise<CourseWithRole[]> {
  const supabase = await createClient();

  const { data: courses } = await supabase
    .from("courses")
    .select("*")
    .order("created_at", { ascending: true });

  if (!courses) return [];

  const { data: memberships } = await supabase
    .from("course_memberships")
    .select("course_id, role");

  const roleByCourse = new Map<string, CourseRole>();
  (memberships ?? []).forEach((m) =>
    roleByCourse.set(m.course_id, m.role as CourseRole),
  );

  return (courses as Course[]).map((c) => ({
    ...c,
    role: roleByCourse.get(c.id) ?? null,
    is_admin_view: isAdmin && !roleByCourse.has(c.id),
  }));
}

/** The caller's own still-pending join requests (for "Requested" badges). */
export async function getMyPendingRequests(): Promise<EnrollmentRequest[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("enrollment_requests")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "pending");
  return (data as EnrollmentRequest[]) ?? [];
}

export interface CoursePerson {
  membershipId: string;
  userId: string;
  role: CourseRole;
  profile: Profile | null;
}

export interface CourseJoinRequest extends EnrollmentRequest {
  profile: Profile | null;
}

/**
 * Roster + pending join requests for the People screen. Caller must be admin
 * or in_charge (RLS returns nothing useful otherwise; the page also guards).
 */
export async function getCoursePeople(courseId: string): Promise<{
  members: CoursePerson[];
  requests: CourseJoinRequest[];
}> {
  const supabase = await createClient();

  const [{ data: memberships }, { data: requests }] = await Promise.all([
    supabase
      .from("course_memberships")
      .select("id, user_id, role")
      .eq("course_id", courseId)
      .order("created_at", { ascending: true }),
    supabase
      .from("enrollment_requests")
      .select("*")
      .eq("course_id", courseId)
      .eq("status", "pending")
      .order("created_at", { ascending: true }),
  ]);

  const ids = new Set<string>();
  (memberships ?? []).forEach((m) => ids.add(m.user_id));
  (requests ?? []).forEach((r) => ids.add(r.user_id));

  let profileById = new Map<string, Profile>();
  if (ids.size > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("*")
      .in("id", Array.from(ids));
    profileById = new Map((profiles ?? []).map((p) => [p.id, p as Profile]));
  }

  return {
    members: (memberships ?? []).map((m) => ({
      membershipId: m.id,
      userId: m.user_id,
      role: m.role as CourseRole,
      profile: profileById.get(m.user_id) ?? null,
    })),
    requests: ((requests as EnrollmentRequest[]) ?? []).map((r) => ({
      ...r,
      profile: profileById.get(r.user_id) ?? null,
    })),
  };
}

export async function getCourse(courseId: string): Promise<Course | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("courses")
    .select("*")
    .eq("id", courseId)
    .single();
  return data;
}

/** The caller's role in a course (null if none / pure admin). */
export async function getCourseRole(
  courseId: string,
): Promise<CourseRole | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("course_memberships")
    .select("role")
    .eq("course_id", courseId)
    .eq("user_id", user.id)
    .maybeSingle();
  return (data?.role as CourseRole) ?? null;
}

interface FolderListing {
  folders: Folder[];
  files: FileRow[];
}

/**
 * Live (non-deleted) contents of a folder (null folderId = course root).
 * RLS already filters teacher-only and trash for the viewer, so the UI just
 * renders whatever comes back.
 */
export async function listFolder(
  courseId: string,
  folderId: string | null,
): Promise<FolderListing> {
  const supabase = await createClient();

  const folderQuery = supabase
    .from("folders")
    .select("*")
    .eq("course_id", courseId)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  const fileQuery = supabase
    .from("files")
    .select("*")
    .eq("course_id", courseId)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  const [{ data: folders }, { data: files }] = await Promise.all([
    folderId === null
      ? folderQuery.is("parent_id", null)
      : folderQuery.eq("parent_id", folderId),
    folderId === null
      ? fileQuery.is("folder_id", null)
      : fileQuery.eq("folder_id", folderId),
  ]);

  return { folders: folders ?? [], files: files ?? [] };
}

/** Ancestor chain root→folder for the breadcrumb. */
export async function getBreadcrumb(
  folderId: string | null,
): Promise<BreadcrumbCrumb[]> {
  if (!folderId) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc("folder_path", { _folder_id: folderId });
  // folder_path returns ordered root..folder rows.
  return (data ?? []).map((r: { id: string; name: string }) => ({
    id: r.id,
    name: r.name,
  }));
}

/** Single folder by id (for header / current-folder context). */
export async function getFolder(folderId: string): Promise<Folder | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("folders")
    .select("*")
    .eq("id", folderId)
    .single();
  return data;
}

/** Every live folder in a course — used to populate "move to…" pickers. */
export async function listAllFolders(courseId: string): Promise<Folder[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("folders")
    .select("*")
    .eq("course_id", courseId)
    .is("deleted_at", null)
    .order("name", { ascending: true });
  return data ?? [];
}

export interface TrashBatch {
  batchId: string;
  deletedAt: string;
  deletedByName: string | null;
  folders: Folder[];
  files: FileRow[];
}

/** Trashed rows grouped by delete batch so a folder + its contents restore as one. */
export async function getTrash(courseId: string): Promise<TrashBatch[]> {
  const supabase = await createClient();

  const [{ data: folders }, { data: files }] = await Promise.all([
    supabase
      .from("folders")
      .select("*")
      .eq("course_id", courseId)
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false }),
    supabase
      .from("files")
      .select("*")
      .eq("course_id", courseId)
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false }),
  ]);

  const batches = new Map<string, TrashBatch>();
  const ensure = (batchId: string | null, deletedAt: string | null) => {
    const key = batchId ?? "unknown";
    if (!batches.has(key)) {
      batches.set(key, {
        batchId: key,
        deletedAt: deletedAt ?? "",
        deletedByName: null,
        folders: [],
        files: [],
      });
    }
    return batches.get(key)!;
  };

  (folders as Folder[] | null)?.forEach((f) =>
    ensure(f.delete_batch_id, f.deleted_at).folders.push(f),
  );
  (files as FileRow[] | null)?.forEach((f) =>
    ensure(f.delete_batch_id, f.deleted_at).files.push(f),
  );

  return Array.from(batches.values()).sort((a, b) =>
    b.deletedAt.localeCompare(a.deletedAt),
  );
}
