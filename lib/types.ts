// Domain types mirroring the schema (§2). Hand-written rather than generated so
// the app stays self-contained; keep in sync with the migrations.

export type AppRole = "admin" | "member";
export type CourseRole = "student" | "teacher" | "in_charge";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  app_role: AppRole;
  created_at: string;
}

export interface Course {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  archived_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface CourseMembership {
  id: string;
  course_id: string;
  user_id: string;
  role: CourseRole;
  created_at: string;
}

export interface Folder {
  id: string;
  course_id: string;
  parent_id: string | null;
  name: string;
  teacher_only: boolean | null;
  eff_teacher_only: boolean;
  created_by: string | null;
  created_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
  delete_batch_id: string | null;
}

export interface FileRow {
  id: string;
  course_id: string;
  folder_id: string | null;
  name: string;
  storage_path: string;
  size_bytes: number | null;
  mime_type: string;
  teacher_only: boolean | null;
  eff_teacher_only: boolean;
  uploaded_by: string | null;
  created_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
  delete_batch_id: string | null;
}

// View models -----------------------------------------------------------------

export interface CourseWithRole extends Course {
  role: CourseRole | null; // null when viewed as platform admin without membership
  member_count?: number;
  is_admin_view?: boolean;
}

export interface BreadcrumbCrumb {
  id: string;
  name: string;
}

/** What the current viewer is allowed to do in a given course. */
export interface CourseCapabilities {
  canManage: boolean; // in_charge or admin: upload, rename, move, delete, trash
  canSeeTeacherOnly: boolean; // teacher, in_charge, admin
  role: CourseRole | null;
  isAdmin: boolean;
}
