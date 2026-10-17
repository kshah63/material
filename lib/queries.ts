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
  QuestionBox,
  QuestionTopic,
} from "./types";
import { bankOf } from "./worksheet/crops";

/** Courses the caller belongs to (admins see all), with the caller's role. */
export async function getMyCourses(
  isAdmin: boolean,
): Promise<CourseWithRole[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: courses } = await supabase
    .from("courses")
    .select("*")
    .order("created_at", { ascending: true });

  if (!courses) return [];

  // Filter to the caller's OWN rows — admins and in_charges can see other
  // people's memberships too, and those must not masquerade as the caller's role.
  const { data: memberships } = await supabase
    .from("course_memberships")
    .select("course_id, role")
    .eq("user_id", user?.id ?? "");

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

// Worksheet maker: the page view's reads (docs/WORKSHEETS.md §3.5, §4.3) -------

/** One file by id under the caller's session: null if RLS hides it or it does not exist. */
export async function getFile(fileId: string): Promise<FileRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("files")
    .select("*")
    .eq("id", fileId)
    .maybeSingle();
  return data;
}

/** A course's fixed topic list, in the owner's order (§2.1 item 12). */
export async function listTopics(courseId: string): Promise<QuestionTopic[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("question_topics")
    .select("id, course_id, name, position")
    .eq("course_id", courseId)
    .order("position", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw new Error(`Could not read the course's topics: ${error.message}`);
  return data ?? [];
}

/** Whether the caller may crop this file: the database's one rule (§3.2), never a copy. */
export async function canCropFile(fileId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("can_crop_file", { _file_id: fileId });
  if (error) throw new Error(`Could not ask whether this file can be cropped: ${error.message}`);
  return data === true;
}

/** A saved box as the page view reads it. Corners are PDF user-space points; y grows upwards. */
export type BankBox = Pick<
  QuestionBox,
  "id" | "box_no" | "page" | "x0" | "y0" | "x1" | "y1" | "pos"
>;

/** A question of one bank, with its boxes in print order (box_no). Never without a box. */
export interface BankQuestion {
  id: string;
  topic_id: string | null;
  boxes: BankBox[];
}

// The API returns at most the project's max rows per request (1,000 by default).
const RANGE = 1000;

/**
 * Every row of one read, a range at a time, until it has as many as the first
 * range's exact count. Each range starts where the rows read so far end, so a
 * project whose max rows is under RANGE still reads them all. A save landing
 * between two ranges can repeat or skip a row; repeats are dropped by id, and an
 * edit built on a list that skipped a box is refused by save_crops (§3.4 step 3).
 */
async function readAllRows<T extends { id: string }>(
  range: (
    from: number,
    to: number,
    count: boolean,
  ) => PromiseLike<{ data: T[] | null; count: number | null; error: { message: string } | null }>,
): Promise<T[]> {
  const byId = new Map<string, T>();
  let read = 0;
  let total: number | null = null;
  do {
    const { data, count, error } = await range(read, read + RANGE - 1, total === null);
    if (error) throw new Error(error.message);
    // Without a count, read until a range comes back empty.
    if (total === null) total = count ?? Number.POSITIVE_INFINITY;
    if (!data || data.length === 0) break;
    read += data.length;
    for (const row of data) byId.set(row.id, row);
  } while (read < total);
  return Array.from(byId.values());
}

/**
 * One bank's questions with their boxes (§3.5), RLS-scoped: two flat reads, never
 * an embed, because an embed runs the inner table's policy once per row. The two
 * reads are separate snapshots, so a question is kept only when both its row and
 * at least one of its boxes were read, and a box only when its question was.
 * A box on a page past the PDF's last page is the page view's to drop: only it
 * knows the page count. Throws on a failed read, because an empty bank shown in
 * its place would be cropped a second time.
 */
export async function listFileQuestions(fileId: string): Promise<BankQuestion[]> {
  const supabase = await createClient();
  const [boxes, questions] = await Promise.all([
    readAllRows<BankBox & { question_id: string }>((from, to, count) =>
      supabase
        .from("question_boxes")
        .select(
          "id, question_id, box_no, page, x0, y0, x1, y1, pos",
          count ? { count: "exact" } : undefined,
        )
        .eq("file_id", fileId)
        .order("page", { ascending: true })
        .order("pos", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    ),
    readAllRows<{ id: string; topic_id: string | null }>((from, to, count) =>
      supabase
        .from("questions")
        .select("id, topic_id", count ? { count: "exact" } : undefined)
        .eq("file_id", fileId)
        .order("id", { ascending: true })
        .range(from, to),
    ),
  ]).catch((err: Error) => {
    throw new Error(`Could not read this bank's questions: ${err.message}`);
  });

  // A question's place is its first box by box_no, whatever that number is: the
  // readers never look for box_no = 1 (§3.2).
  return bankOf(questions, boxes);
}
