import { notFound, redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import {
  canCropFile,
  getCourse,
  getCourseRole,
  getFile,
  listFileQuestions,
  listTopics,
} from "@/lib/queries";
import { capabilitiesFor } from "@/lib/permissions";
import { PageView } from "@/components/questions/PageView";

export const dynamic = "force-dynamic";

/**
 * The page view (docs/WORKSHEETS.md §4.3): one bank, page by page, with its
 * saved crops. Managers crop on a bank can_crop_file allows; everyone else, and
 * a manager on a bank students can see, picks.
 */
export default async function QuestionsPageView({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string; fileId: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const { courseId, fileId } = await params;
  const { page } = await searchParams;
  const profile = await requireProfile();
  const isAdmin = profile.app_role === "admin";

  const [course, role, file] = await Promise.all([
    getCourse(courseId),
    getCourseRole(courseId),
    getFile(fileId),
  ]);
  if (!course) notFound();
  const caps = capabilitiesFor(role, isAdmin);
  // Students never reach questions, crops or topics.
  if (!caps.canSeeTeacherOnly) redirect(`/courses/${courseId}`);
  // Missing, in Trash (a manager's read still returns it), or another course's file.
  if (!file || file.deleted_at || file.course_id !== courseId) notFound();

  const [questions, topics, canCrop] = await Promise.all([
    listFileQuestions(fileId),
    listTopics(courseId),
    caps.canManage ? canCropFile(fileId) : Promise.resolve(false),
  ]);

  const first = Number(Array.isArray(page) ? page[0] : page);

  return (
    <PageView
      userId={profile.id}
      courseId={courseId}
      courseName={course.name}
      file={{
        id: file.id,
        name: file.name,
        size_bytes: file.size_bytes,
        folder_id: file.folder_id,
        eff_teacher_only: file.eff_teacher_only,
      }}
      questions={questions}
      topics={topics}
      mode={canCrop ? "crop" : "pick"}
      manager={caps.canManage}
      initialPage={Number.isInteger(first) && first >= 1 ? first : null}
    />
  );
}
