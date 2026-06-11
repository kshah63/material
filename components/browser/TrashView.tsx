"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/components/ui/Toast";
import { restoreBatch } from "@/app/actions/trash";
import {
  FolderIcon,
  PdfIcon,
  RestoreIcon,
  TrashIcon,
  ArrowLeftIcon,
  SpinnerIcon,
} from "@/components/icons";
import { relativeTime, daysUntilPurge } from "@/lib/format";
import type { TrashBatch } from "@/lib/queries";

function PurgeChip({ deletedAt }: { deletedAt: string }) {
  const days = daysUntilPurge(deletedAt);
  const urgent = days <= 5;
  return (
    <span
      className="chip"
      style={
        urgent
          ? { background: "var(--berry-wash)", color: "var(--berry-deep)", borderColor: "#f1c7cd" }
          : undefined
      }
    >
      {days === 0 ? "purging today" : `${days}d left`}
    </span>
  );
}

export function TrashView({
  courseId,
  courseName,
  batches,
}: {
  courseId: string;
  courseName: string;
  batches: TrashBatch[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [restoring, setRestoring] = useState<string | null>(null);

  const onRestore = async (batchId: string) => {
    setRestoring(batchId);
    const res = await restoreBatch(batchId, courseId);
    setRestoring(null);
    if (res.ok) toast("Restored");
    else toast(res.error ?? "Restore failed", "error");
    router.refresh();
  };

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "28px 28px 80px" }}>
      <Link
        href={`/courses/${courseId}`}
        className="btn btn-quiet btn-sm"
        style={{ marginLeft: -8, marginBottom: 8 }}
      >
        <ArrowLeftIcon width={16} height={16} /> {courseName}
      </Link>

      <header className="mb-6">
        <h1 style={{ fontSize: 30 }}>Trash</h1>
        <p style={{ color: "var(--ink-soft)", marginTop: 6 }}>
          Deleted items rest here for 30 days, then are permanently removed.
          Restoring brings back exactly what was deleted together.
        </p>
      </header>

      {batches.length === 0 ? (
        <div className="card flex flex-col items-center text-center" style={{ padding: "56px 24px" }}>
          <span
            className="grid place-items-center rounded-[16px] mb-4"
            style={{ width: 60, height: 60, background: "var(--paper-2)", color: "var(--ink-faint)" }}
          >
            <TrashIcon width={28} height={28} />
          </span>
          <h3 style={{ fontSize: 19 }}>Trash is empty</h3>
          <p style={{ color: "var(--ink-soft)", marginTop: 6 }}>
            Nothing has been deleted in this course.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {batches.map((batch) => {
            const count = batch.folders.length + batch.files.length;
            return (
              <div key={batch.batchId} className="card rise" style={{ padding: 16 }}>
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span style={{ fontWeight: 800, fontSize: 15 }}>
                      Deleted {relativeTime(batch.deletedAt)}
                    </span>
                    <PurgeChip deletedAt={batch.deletedAt} />
                    <span className="chip">
                      {count} item{count === 1 ? "" : "s"}
                    </span>
                  </div>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => onRestore(batch.batchId)}
                    disabled={restoring === batch.batchId}
                  >
                    {restoring === batch.batchId ? (
                      <SpinnerIcon width={16} height={16} />
                    ) : (
                      <RestoreIcon width={16} height={16} />
                    )}
                    Restore
                  </button>
                </div>

                <div
                  className="flex flex-col gap-1"
                  style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}
                >
                  {batch.folders.map((f) => (
                    <div key={f.id} className="flex items-center gap-2.5" style={{ padding: "4px 2px" }}>
                      <FolderIcon width={18} height={18} style={{ color: "var(--honey-deep)" }} />
                      <span
                        className={f.eff_teacher_only ? "marker-name" : ""}
                        style={{ fontSize: 14, fontWeight: 700 }}
                      >
                        {f.name}
                      </span>
                      <span style={{ fontSize: 12, color: "var(--ink-faint)" }}>folder</span>
                    </div>
                  ))}
                  {batch.files.map((f) => (
                    <div key={f.id} className="flex items-center gap-2.5" style={{ padding: "4px 2px" }}>
                      <PdfIcon width={18} height={18} style={{ color: "var(--berry)" }} />
                      <span
                        className={f.eff_teacher_only ? "marker-name" : ""}
                        style={{ fontSize: 14, fontWeight: 700 }}
                      >
                        {f.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
