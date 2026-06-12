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

/**
 * Add someone to the course by email. The account must already exist and be
 * approved — there's no shadow-invite here; admins invite from the console.
 */
export async function addMemberByEmail(
  courseId: string,
  email: string,
  role: CourseRole,
) {
  const guard = await canManageCourse(courseId);
  if (!guard.ok) return guard;
  if (role === "in_charge" && !guard.isAdmin) {
    return { ok: false as const, error: "Only admins can assign an in-charge." };
  }

  const normalized = email.trim().toLowerCase();
  if (!normalized) return { ok: false as const, error: "Email is required." };

  const admin = createServiceClient();
  const { data: person } = await admin
    .from("profiles")
    .select("id, status")
    .eq("email", normalized)
    .maybeSingle();
  if (!person) {
    return { ok: false as const, error: "No account with that email yet — ask them to sign up first." };
  }
  if (person.status !== "approved") {
    return { ok: false as const, error: "That account is still waiting for admin approval." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("course_memberships").upsert(
    { course_id: courseId, user_id: person.id, role },
    { onConflict: "course_id,user_id" },
  );
  if (error) return { ok: false as const, error: error.message };

  revalidatePath(`/courses/${courseId}/people`);
  return { ok: true as const };
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
