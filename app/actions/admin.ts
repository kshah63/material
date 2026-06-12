"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { CourseRole } from "@/lib/types";

/**
 * Guard for actions that use the service-role client (which bypasses RLS).
 * Course/membership writes done with the user client are already admin-gated by
 * RLS, but invites mutate auth.users via the admin API, so we must verify here.
 */
async function assertAdmin() {
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
  if (profile?.app_role !== "admin") {
    return { ok: false as const, error: "Admins only." };
  }
  return { ok: true as const };
}

// --- Courses -----------------------------------------------------------------

export async function createCourse(input: {
  name: string;
  code?: string;
  description?: string;
}) {
  const name = input.name.trim();
  if (!name) return { ok: false as const, error: "Course name is required." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("courses")
    .insert({
      name,
      code: input.code?.trim() || null,
      description: input.description?.trim() || null,
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();

  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/admin");
  revalidatePath("/courses");
  return { ok: true as const, id: data.id };
}

export async function setCourseArchived(courseId: string, archived: boolean) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("courses")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", courseId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/admin");
  revalidatePath("/courses");
  return { ok: true as const };
}

// --- Memberships -------------------------------------------------------------

export async function setMembership(
  courseId: string,
  userId: string,
  role: CourseRole,
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("course_memberships")
    .upsert(
      { course_id: courseId, user_id: userId, role },
      { onConflict: "course_id,user_id" },
    );
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/admin");
  return { ok: true as const };
}

export async function removeMembership(courseId: string, userId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("course_memberships")
    .delete()
    .eq("course_id", courseId)
    .eq("user_id", userId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/admin");
  return { ok: true as const };
}

// --- Users / provisioning ----------------------------------------------------
// profiles column privileges only let `authenticated` write full_name, so all
// role/status changes run through the service role behind assertAdmin.

export async function setAppRole(userId: string, appRole: "admin" | "member") {
  const guard = await assertAdmin();
  if (!guard.ok) return guard;
  const admin = createServiceClient();
  const { error } = await admin
    .from("profiles")
    .update({ app_role: appRole })
    .eq("id", userId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/admin");
  return { ok: true as const };
}

/** Approve a self-signup so the person can use the portal (§ accounts). */
export async function approveAccount(userId: string) {
  const guard = await assertAdmin();
  if (!guard.ok) return guard;
  const admin = createServiceClient();
  const { error } = await admin
    .from("profiles")
    .update({ status: "approved" })
    .eq("id", userId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/admin");
  return { ok: true as const };
}

/** Fix a mis-registered account type (student <-> teacher). */
export async function setAccountRole(
  userId: string,
  accountRole: "student" | "teacher",
) {
  const guard = await assertAdmin();
  if (!guard.ok) return guard;
  const admin = createServiceClient();
  const { error } = await admin
    .from("profiles")
    .update({ account_role: accountRole })
    .eq("id", userId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/admin");
  return { ok: true as const };
}

/**
 * Invite a user by email (standalone roster, §10). Creates the auth.users entry
 * via the admin API and sends Supabase's invite email; the handle_new_user
 * trigger creates the profiles row. Optionally seed full_name and a first
 * course membership.
 */
export async function inviteUser(input: {
  email: string;
  fullName?: string;
  accountRole?: "student" | "teacher";
  grade?: string;
  school?: string;
  courseId?: string;
  role?: CourseRole;
}) {
  const guard = await assertAdmin();
  if (!guard.ok) return guard;

  const email = input.email.trim().toLowerCase();
  if (!email) return { ok: false as const, error: "Email is required." };

  const admin = createServiceClient();
  const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/auth/callback`;

  const { data: invited, error: inviteErr } =
    await admin.auth.admin.inviteUserByEmail(email, {
      data: {
        // invited:true tells handle_new_user to skip the approval queue.
        invited: true,
        account_role: input.accountRole ?? "student",
        ...(input.fullName ? { full_name: input.fullName } : {}),
        ...(input.grade ? { grade: input.grade } : {}),
        ...(input.school ? { school: input.school } : {}),
      },
      redirectTo,
    });

  let userId = invited?.user?.id;

  // Already-registered users surface as an error from inviteUserByEmail.
  // Look them up by email so the admin can still (re)assign a membership.
  if (inviteErr) {
    const { data: existing } = await admin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (!existing) return { ok: false as const, error: inviteErr.message };
    userId = existing.id;
    // An admin re-inviting an existing pending account counts as approval.
    await admin.from("profiles").update({ status: "approved" }).eq("id", userId);
  }

  if (userId && input.fullName) {
    await admin
      .from("profiles")
      .update({ full_name: input.fullName })
      .eq("id", userId);
  }

  if (userId && input.courseId && input.role) {
    const res = await setMembership(input.courseId, userId, input.role);
    if (!res.ok) return res;
  }

  revalidatePath("/admin");
  return { ok: true as const, userId, reinvited: Boolean(inviteErr) };
}
