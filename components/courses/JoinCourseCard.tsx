"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { CheckIcon, PlusIcon, SpinnerIcon } from "@/components/icons";
import { requestEnrollment, cancelEnrollmentRequest } from "@/app/actions/enrollment";
import type { Course } from "@/lib/types";

/** A course you're not in yet: request to join / withdraw the request. */
export function JoinCourseCard({
  course,
  pendingRequestId,
}: {
  course: Course;
  pendingRequestId: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const initials = (course.code ?? course.name).slice(0, 3).toUpperCase();

  async function toggle() {
    setBusy(true);
    const res = pendingRequestId
      ? await cancelEnrollmentRequest(pendingRequestId)
      : await requestEnrollment(course.id);
    setBusy(false);
    if (!res.ok) toast(res.error ?? "Something went wrong.", "error");
    else toast(pendingRequestId ? "Request withdrawn" : "Request sent — a teacher will approve it");
    router.refresh();
  }

  return (
    <div className="card flex flex-col rise" style={{ padding: 20 }}>
      <div className="flex items-start justify-between mb-4">
        <span
          className="grid place-items-center rounded-[12px] mono"
          style={{
            width: 48,
            height: 48,
            fontSize: 15,
            fontWeight: 500,
            background: "var(--paper-2)",
            color: "var(--ink-soft)",
          }}
        >
          {initials}
        </span>
        {pendingRequestId && (
          <span className="chip">
            <CheckIcon width={12} height={12} /> Requested
          </span>
        )}
      </div>

      <h3 style={{ fontSize: 20, marginBottom: 4 }}>{course.name}</h3>
      {course.code && (
        <p className="mono" style={{ fontSize: 12, color: "var(--honey-deep)" }}>
          {course.code}
        </p>
      )}
      <p style={{ fontSize: 14, color: "var(--ink-soft)", marginTop: 10, flex: 1, minHeight: 20 }}>
        {course.description || "Ask to join to see its materials."}
      </p>

      <button
        className={`mt-4 ${pendingRequestId ? "btn btn-ghost btn-sm" : "btn btn-primary btn-sm"}`}
        style={{ alignSelf: "flex-start" }}
        disabled={busy}
        onClick={toggle}
      >
        {busy ? (
          <SpinnerIcon width={16} height={16} />
        ) : pendingRequestId ? (
          "Withdraw request"
        ) : (
          <>
            <PlusIcon width={16} height={16} /> Request to join
          </>
        )}
      </button>
    </div>
  );
}
