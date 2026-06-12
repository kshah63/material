import { notFound, redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { getCourse, getCourseRole, getCoursePeople } from "@/lib/queries";
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

  return (
    <PeopleManager
      courseId={courseId}
      courseName={course.name}
      isAdmin={isAdmin}
      selfId={profile.id}
      members={members}
      requests={requests}
    />
  );
}
