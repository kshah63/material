import { notFound, redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { getCourse, getCourseRole, getCoursePeople } from "@/lib/queries";
import { createServiceClient } from "@/lib/supabase/service";
import { PeopleManager } from "@/components/people/PeopleManager";

export const dynamic = "force-dynamic";

export default async function CoursePeoplePage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;

  const profile = await requireProfile();
  const isAdmin = profile.app_role === "admin";

  const course = await getCourse(courseId);
  if (!course) notFound();

  const role = await getCourseRole(courseId);
  if (!isAdmin && role !== "in_charge") redirect(`/courses/${courseId}`);

  const { members, requests } = await getCoursePeople(courseId);

  // Grade/school choices for the bulk-add picker. Service role (we just
  // verified the caller manages this course): distinct values across all
  // approved students, not only ones the caller could read via RLS.
  const admin = createServiceClient();
  const { data: students } = await admin
    .from("profiles")
    .select("grade, school")
    .eq("status", "approved")
    .eq("account_role", "student");
  const distinct = (key: "grade" | "school") =>
    Array.from(
      new Set((students ?? []).map((s) => s[key]).filter((v): v is string => Boolean(v))),
    ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  return (
    <PeopleManager
      courseId={courseId}
      courseName={course.name}
      isAdmin={isAdmin}
      selfId={profile.id}
      members={members}
      requests={requests}
      gradeOptions={distinct("grade")}
      schoolOptions={distinct("school")}
    />
  );
}
