// Domain types mirroring the schema (§2). Hand-written rather than generated so
// the app stays self-contained; keep in sync with the migrations.

export type AppRole = "admin" | "member";
export type CourseRole = "student" | "teacher" | "in_charge";
export type AccountRole = "student" | "teacher";
export type AccountStatus = "pending" | "approved";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  app_role: AppRole;
  account_role: AccountRole;
  status: AccountStatus;
  grade: string | null; // students only
  school: string | null; // students only
  country: string | null; // students outside SG ("Global")
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

export interface EnrollmentRequest {
  id: string;
  course_id: string;
  user_id: string;
  requested_role: AccountRole;
  status: "pending" | "approved" | "declined";
  created_at: string;
  decided_at: string | null;
  decided_by: string | null;
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

// Worksheet maker (20261017000009_questions.sql) -------------------------------

export interface QuestionTopic {
  id: string;
  course_id: string;
  name: string;
  position: number;
}

/** A cropped question: up to four boxes on one bank, printed in box_no order. */
export interface Question {
  id: string;
  file_id: string; // the bank; its course is the question's course
  topic_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface QuestionBox {
  id: string;
  question_id: string;
  file_id: string; // always its question's file
  box_no: number; // 1–4, print order
  page: number; // 1-based
  // PDF user-space points on the source page, before its /Rotate; y grows upwards.
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  pos: number; // reading order on its page
}

/** A row of the question_sources view: one bank with crops. */
export interface QuestionSource {
  course_id: string;
  file_id: string;
  file_name: string;
  folder_id: string | null;
  eff_teacher_only: boolean; // false: students can see the bank, so its crops are locked
  questions: number;
  pages: number;
  first_page: number;
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
