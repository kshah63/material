"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { CourseRole } from "@/lib/types";

/**
 * Enrollment + roster actions. Everything here runs with the caller's session,
 * so RLS is the real gate: requests_insert allows only approved accounts asking
 * for themselves; memberships_incharge_* lets a course's in_charge manage
 * student/teacher rows (admins manage everything). The one service-role use is
 * the email lookup in addMemberByEmail, AFTER the caller's permission is
 * verified — in_charge can't read arbitrary profiles directly.
 */

/** Is the caller an admin, or in_charge of this course? */
async function canManageCourse(courseId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("app_role")
    .eq("id", user.id)
    .single();
  if (profile?.app_role === "admin") {
    return { ok: true as const, userId: user.id, isAdmin: true };
  }

  const { data: membership } = await supabase
    .from("course_memberships")
    .select("role")
    .eq("course_id", courseId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (membership?.role !== "in_charge") {
    return { ok: false as const, error: "Only the course in-charge or an admin can do that." };
  }
  return { ok: true as const, userId: user.id, isAdmin: false };
}

// --- requesting (any approved user) -------------------------------------------

/** Ask to join a course. The requested role mirrors the account type. */
export async function requestEnrollment(courseId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("account_role")
    .eq("id", user.id)
    .single();

  const { error } = await supabase.from("enrollment_requests").insert({
    course_id: courseId,
    user_id: user.id,
    requested_role: profile?.account_role ?? "student",
  });

  if (error) {
    if (error.code === "23505") {
      return { ok: false as const, error: "You've already requested to join this course." };
    }
    return { ok: false as const, error: error.message };
  }
  revalidatePath("/courses");
  return { ok: true as const };
}

/** Withdraw your own still-pending request. */
export async function cancelEnrollmentRequest(requestId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("enrollment_requests")
    .delete()
    .eq("id", requestId)
    .eq("status", "pending");
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/courses");
  return { ok: true as const };
}

// --- deciding (admin or course in_charge) --------------------------------------

/** Approve: create the membership with the requested role, then close the request. */
export async function approveEnrollment(requestId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  // RLS only returns the row to its owner, an admin, or the course's in_charge;
  // the membership insert below then fails for the owner, so no further check.
  const { data: request } = await supabase
    .from("enrollment_requests")
    .select("id, course_id, user_id, requested_role")
    .eq("id", requestId)
    .eq("status", "pending")
    .maybeSingle();
  if (!request) return { ok: false as const, error: "Request not found (it may have been handled already)." };

  const { error: memberErr } = await supabase.from("course_memberships").upsert(
    {
      course_id: request.course_id,
      user_id: request.user_id,
      role: request.requested_role,
    },
    { onConflict: "course_id,user_id" },
  );
  if (memberErr) return { ok: false as const, error: memberErr.message };

  const { error } = await supabase
    .from("enrollment_requests")
    .update({ status: "approved", decided_at: new Date().toISOString(), decided_by: user.id })
    .eq("id", requestId);
  if (error) return { ok: false as const, error: error.message };

  revalidatePath(`/courses/${request.course_id}/people`);
  revalidatePath("/courses");
  return { ok: true as const };
}

export async function declineEnrollment(requestId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: request } = await supabase
    .from("enrollment_requests")
    .select("course_id")
    .eq("id", requestId)
    .single();

  const { error } = await supabase
    .from("enrollment_requests")
    .update({ status: "declined", decided_at: new Date().toISOString(), decided_by: user.id })
    .eq("id", requestId)
    .eq("status", "pending");
  if (error) return { ok: false as const, error: error.message };

  if (request) revalidatePath(`/courses/${request.course_id}/people`);
  return { ok: true as const };
}

// --- roster management (admin or course in_charge) ------------------------------

export interface PersonHit {
  id: string;
  full_name: string | null;
  email: string;
  account_role: "student" | "teacher";
  grade: string | null;
  school: string | null;
  alreadyMember: boolean;
}

/**
 * Find approved accounts by name or email for the roster typeahead. The lookup
 * runs with the service role AFTER verifying the caller manages this course —
 * in_charges can't read arbitrary profiles directly.
 */
export async function searchPeople(courseId: string, query: string) {
  const guard = await canManageCourse(courseId);
  if (!guard.ok) return guard;

  // Strip characters that have meaning in PostgREST or-filters / LIKE patterns.
  const q = query.trim().replace(/[,()%_]/g, "");
  if (q.length < 2) return { ok: true as const, results: [] as PersonHit[] };

  const admin = createServiceClient();
  const [{ data: people }, { data: members }] = await Promise.all([
    admin
      .from("profiles")
      .select("id, full_name, email, account_role, grade, school")
      .eq("status", "approved")
      .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
      .order("full_name", { ascending: true })
      .limit(8),
    admin
      .from("course_memberships")
      .select("user_id")
      .eq("course_id", courseId),
  ]);

  const memberIds = new Set((members ?? []).map((m) => m.user_id));
  const results: PersonHit[] = (people ?? []).map((p) => ({
    ...p,
    account_role: p.account_role === "teacher" ? "teacher" : "student",
    alreadyMember: memberIds.has(p.id),
  }));
  return { ok: true as const, results };
}

/** Add one person (from a search hit). Role mirrors their account type. */
export async function addMember(courseId: string, userId: string) {
  const guard = await canManageCourse(courseId);
  if (!guard.ok) return guard;

  const admin = createServiceClient();
  const { data: person } = await admin
    .from("profiles")
    .select("account_role, status")
    .eq("id", userId)
    .maybeSingle();
  if (!person) return { ok: false as const, error: "Account not found." };
  if (person.status !== "approved") {
    return { ok: false as const, error: "That account is still waiting for admin approval." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("course_memberships").upsert(
    {
      course_id: courseId,
      user_id: userId,
      role: person.account_role === "teacher" ? "teacher" : "student",
    },
    { onConflict: "course_id,user_id" },
  );
  if (error) return { ok: false as const, error: error.message };

  revalidatePath(`/courses/${courseId}/people`);
  return { ok: true as const };
}

/** Bulk-add every approved student in a grade and/or school as course students. */
export async function addStudentsByGroup(
  courseId: string,
  filter: { grade?: string; school?: string },
) {
  const guard = await canManageCourse(courseId);
  if (!guard.ok) return guard;
  if (!filter.grade && !filter.school) {
    return { ok: false as const, error: "Pick a grade or a school first." };
  }

  const admin = createServiceClient();
  let query = admin
    .from("profiles")
    .select("id")
    .eq("status", "approved")
    .eq("account_role", "student");
  if (filter.grade) query = query.eq("grade", filter.grade);
  if (filter.school) query = query.eq("school", filter.school);
  const { data: students } = await query;

  if (!students || students.length === 0) {
    return { ok: false as const, error: "No approved students match that group." };
  }

  const { data: members } = await admin
    .from("course_memberships")
    .select("user_id")
    .eq("course_id", courseId);
  const memberIds = new Set((members ?? []).map((m) => m.user_id));
  const newcomers = students.filter((s) => !memberIds.has(s.id));
  if (newcomers.length === 0) {
    return { ok: false as const, error: "Everyone in that group is already in the course." };
  }

  // Insert as the caller so RLS (in_charge may add students) stays the gate.
  const supabase = await createClient();
  const { error } = await supabase.from("course_memberships").insert(
    newcomers.map((s) => ({
      course_id: courseId,
      user_id: s.id,
      role: "student" as const,
    })),
  );
  if (error) return { ok: false as const, error: error.message };

  revalidatePath(`/courses/${courseId}/people`);
  return { ok: true as const, added: newcomers.length };
}

/** Change a member's role. RLS stops a non-admin touching in_charge rows. */
export async function setMemberRole(
  courseId: string,
  userId: string,
  role: CourseRole,
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("course_memberships")
    .update({ role })
    .eq("course_id", courseId)
    .eq("user_id", userId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/courses/${courseId}/people`);
  revalidatePath("/admin");
  return { ok: true as const };
}

export async function removeMember(courseId: string, userId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("course_memberships")
    .delete()
    .eq("course_id", courseId)
    .eq("user_id", userId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/courses/${courseId}/people`);
  revalidatePath("/admin");
  return { ok: true as const };
}
