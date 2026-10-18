import { notFound, redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import {
  countTopicQuestions,
  getCourse,
  getCourseRole,
  listAllFolders,
  listQuestionSources,
  listTopics,
} from "@/lib/queries";
import { capabilitiesFor } from "@/lib/permissions";
import { bankPath } from "@/lib/worksheet/layout";
import { QuestionsView, type BankRow } from "@/components/questions/QuestionsView";

export const dynamic = "force-dynamic";

/**
 * Questions (docs/WORKSHEETS.md §4.2): the course's cropped banks, one row each,
 * each opening the page view at its first page with questions. ?topic= narrows
 * the list to banks with questions of that topic.
 */
export default async function QuestionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ topic?: string | string[] }>;
}) {
  const { courseId } = await params;
  const { topic } = await searchParams;
  const profile = await requireProfile();
  const isAdmin = profile.app_role === "admin";

  const [course, role] = await Promise.all([getCourse(courseId), getCourseRole(courseId)]);
  if (!course) notFound();
  const caps = capabilitiesFor(role, isAdmin);
  // Students never reach questions, crops or topics.
  if (!caps.canSeeTeacherOnly) redirect(`/courses/${courseId}`);

  const [sources, folders, topics] = await Promise.all([
    listQuestionSources(courseId),
    listAllFolders(courseId),
    listTopics(courseId),
  ]);
  // Only one of the course's own topics filters; anything else is Any topic.
  const asked = Array.isArray(topic) ? topic[0] : topic;
  const topicId = topics.some((t) => t.id === asked) ? asked! : null;
  const counts = topicId ? await countTopicQuestions(topicId, sources.map((s) => s.file_id)) : null;

  const rows: BankRow[] = sources
    .map((s) => ({
      fileId: s.file_id,
      label: bankPath(s.file_name, s.folder_id, folders),
      questions: Number(s.questions),
      pages: Number(s.pages),
      firstPage: Number(s.first_page),
      studentsCanSee: !s.eff_teacher_only,
      onTopic: counts ? (counts.get(s.file_id) ?? 0) : null,
    }))
    .filter((r) => r.onTopic !== 0)
    .sort((a, b) => a.label.localeCompare(b.label));

  return (
    <QuestionsView
      userId={profile.id}
      courseId={courseId}
      course={{ name: course.name, code: course.code }}
      manager={caps.canManage}
      topics={topics}
      topicId={topicId}
      rows={rows}
      cropped={sources.length > 0}
    />
  );
}
