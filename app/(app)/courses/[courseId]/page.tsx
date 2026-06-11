import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import {
  getCourse,
  getCourseRole,
  listFolder,
  getBreadcrumb,
  listAllFolders,
} from "@/lib/queries";
import { capabilitiesFor } from "@/lib/permissions";
import { Browser } from "@/components/browser/Browser";

export const dynamic = "force-dynamic";

export default async function CoursePage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ folder?: string }>;
}) {
  const { courseId } = await params;
  const { folder } = await searchParams;
  const folderId = folder ?? null;

  const profile = await requireProfile();
  const isAdmin = profile.app_role === "admin";

  const course = await getCourse(courseId);
  if (!course) notFound(); // RLS hides courses you don't belong to

  const role = await getCourseRole(courseId);
  const caps = capabilitiesFor(role, isAdmin);

  const [{ folders, files }, breadcrumb, allFolders] = await Promise.all([
    listFolder(courseId, folderId),
    getBreadcrumb(folderId),
    caps.canManage ? listAllFolders(courseId) : Promise.resolve([]),
  ]);

  return (
    <Browser
      courseId={courseId}
      courseName={course.name}
      folderId={folderId}
      breadcrumb={breadcrumb}
      folders={folders}
      files={files}
      allFolders={allFolders}
      caps={caps}
    />
  );
}
