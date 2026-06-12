import { notFound, redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { getCourse, getCourseRole, getCoursePeople } from "@/lib/queries";
import { createServiceClient } from "@/lib/supabase/service";
import { GRADES, SCHOOLS, SCHOOL_SET } from "@/lib/options";
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

  // Bulk-add picker options: always offer the full canonical grade/school
  // lists (so a specific grade/school can be chosen even before any student
  // has that value), then append any real student values not on the lists
  // (free-text "Other", legacy, or global schools).
  const admin = createServiceClient();
  const { data: students } = await admin
    .from("profiles")
    .select("grade, school")
    .eq("status", "approved")
    .eq("account_role", "student");

  const GRADE_SET = new Set<string>(GRADES);
  const extra = (key: "grade" | "school", known: ReadonlySet<string>) =>
    Array.from(
      new Set((students ?? []).map((s) => s[key]).filter((v): v is string => Boolean(v))),
    )
      .filter((v) => !known.has(v))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const gradeOptions = [...GRADES, ...extra("grade", GRADE_SET)];
  const schoolOptions = [...SCHOOLS, ...extra("school", SCHOOL_SET)];

  return (
    <PeopleManager
      courseId={courseId}
      courseName={course.name}
      isAdmin={isAdmin}
      selfId={profile.id}
      members={members}
      requests={requests}
      gradeOptions={gradeOptions}
      schoolOptions={schoolOptions}
    />
  );
}
