import { notFound, redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { getCourse, getCourseRole, getTrash } from "@/lib/queries";
import { capabilitiesFor } from "@/lib/permissions";
import { TrashView } from "@/components/browser/TrashView";

export const dynamic = "force-dynamic";

export default async function TrashPage({
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
  const caps = capabilitiesFor(role, isAdmin);
  if (!caps.canManage) redirect(`/courses/${courseId}`);

  const batches = await getTrash(courseId);

  return <TrashView courseId={courseId} courseName={course.name} batches={batches} />;
}
