"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, ChevronRightIcon, CropIcon, PdfIcon } from "@/components/icons";
import { usePicks } from "@/hooks/usePicks";
import type { QuestionTopic } from "@/lib/types";
import { PicksBar } from "./PicksBar";
import { WorksheetModal } from "./WorksheetModal";

/** A cropped bank as the Questions page lists it. */
export interface BankRow {
  fileId: string;
  /** Folder path and name: "Banks / Gr 5 / Fractions.pdf". */
  label: string;
  questions: number;
  pages: number;
  firstPage: number;
  /** Students can see the bank, so its crops are locked (§2.2). */
  studentsCanSee: boolean;
  /** With a topic chosen, how many of its questions have it. */
  onTopic: number | null;
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/**
 * Questions (docs/WORKSHEETS.md §4.2): the course's cropped banks, each a door
 * into its page view, where questions are cropped and picked. The picks bar
 * shows here too, so a worksheet can be made from picks across banks.
 */
export function QuestionsView({
  userId,
  courseId,
  course,
  manager,
  topics,
  topicId,
  rows,
  cropped,
}: {
  userId: string;
  courseId: string;
  course: { name: string; code: string | null };
  manager: boolean;
  topics: QuestionTopic[];
  topicId: string | null;
  rows: BankRow[];
  /** Whether anything in the course is cropped, whatever the topic. */
  cropped: boolean;
}) {
  const router = useRouter();
  const { picks, clear } = usePicks(userId, courseId);
  const [making, setMaking] = useState(false);
  const topicName = topics.find((t) => t.id === topicId)?.name ?? null;

  const open = (r: BankRow) =>
    topicId
      ? `/courses/${courseId}/questions/${r.fileId}?topic=${topicId}`
      : `/courses/${courseId}/questions/${r.fileId}?page=${r.firstPage}`;

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "28px 28px 96px" }}>
      <Link href={`/courses/${courseId}`} className="btn btn-quiet btn-sm" style={{ marginLeft: -8, marginBottom: 8 }}>
        <ArrowLeftIcon width={16} height={16} /> {course.name}
      </Link>

      <header className="mb-6 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 style={{ fontSize: 30 }}>Questions</h1>
          <p style={{ color: "var(--ink-soft)", marginTop: 6 }}>
            Cropped from this course&rsquo;s banks. Open one and pick questions for a worksheet.
          </p>
        </div>
        {/* Hidden, like every topic picker, while the course has no topics. */}
        {topics.length > 0 && cropped && (
          <select
            className="field"
            style={{ width: "auto", padding: "6px 10px", fontSize: 14 }}
            value={topicId ?? ""}
            onChange={(e) =>
              router.replace(
                e.target.value
                  ? `/courses/${courseId}/questions?topic=${e.target.value}`
                  : `/courses/${courseId}/questions`,
              )
            }
            aria-label="Topic"
          >
            <option value="">Any topic</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
      </header>

      {rows.length === 0 ? (
        <div className="card flex flex-col items-center text-center" style={{ padding: "56px 24px" }}>
          <span
            className="grid place-items-center rounded-[16px] mb-4"
            style={{ width: 60, height: 60, background: "var(--paper-2)", color: "var(--ink-faint)" }}
          >
            <CropIcon width={28} height={28} />
          </span>
          <h3 style={{ fontSize: 19 }}>
            {cropped ? "No question in this course has this topic" : "Nothing cropped in this course"}
          </h3>
          {!cropped && (
            <p style={{ color: "var(--ink-soft)", marginTop: 6, maxWidth: 460 }}>
              {manager ? (
                <>
                  Banks kept for next year are cropped in the level&rsquo;s question-bank course: open a bank PDF
                  there and choose <em>Crop questions</em> from its menu. Crops of a bank in Trash come back when it
                  is restored.
                </>
              ) : (
                "Question banks are kept in each level’s question-bank course, in your course list."
              )}
            </p>
          )}
        </div>
      ) : (
        <div className="card flex flex-col" style={{ padding: 8 }}>
          {rows.map((r) => (
            <Link
              key={r.fileId}
              href={open(r)}
              className="flex items-center gap-3 rounded-[10px] hover:bg-[var(--paper-2)]"
              style={{ padding: "10px 12px" }}
            >
              <PdfIcon width={20} height={20} style={{ color: "var(--berry)", flexShrink: 0 }} />
              <span className="min-w-0" style={{ flex: 1 }}>
                <span className="block" style={{ fontSize: 14.5, fontWeight: 800, overflowWrap: "anywhere" }}>
                  {r.label}
                </span>
                <span className="block" style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 2 }}>
                  {r.onTopic !== null && topicName
                    ? `${plural(r.onTopic, `${topicName} question`)} · ${r.questions} in all`
                    : `${plural(r.questions, "question")} on ${plural(r.pages, "page")}`}
                </span>
                {r.studentsCanSee && (
                  <span className="block" style={{ fontSize: 13, color: "var(--berry-deep)", fontWeight: 700, marginTop: 2 }}>
                    Students can see this file.{manager && " Make it teacher-only to change its crops."}
                  </span>
                )}
              </span>
              <ChevronRightIcon width={16} height={16} style={{ color: "var(--ink-faint)", flexShrink: 0 }} />
            </Link>
          ))}
        </div>
      )}

      <PicksBar count={picks.length} onMake={() => setMaking(true)} onClear={clear} canMake={manager} />
      {making && (
        <WorksheetModal
          userId={userId}
          courseId={courseId}
          course={course}
          picks={picks}
          topics={topics}
          onClose={() => setMaking(false)}
        />
      )}
    </div>
  );
}
