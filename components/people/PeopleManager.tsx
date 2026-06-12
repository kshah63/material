"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { roleLabel } from "@/lib/format";
import {
  ArrowLeftIcon,
  CheckIcon,
  PlusIcon,
  SpinnerIcon,
  TrashIcon,
  XIcon,
} from "@/components/icons";
import {
  addMemberByEmail,
  approveEnrollment,
  declineEnrollment,
  removeMember,
  setMemberRole,
} from "@/app/actions/enrollment";
import type { CourseJoinRequest, CoursePerson } from "@/lib/queries";
import type { CourseRole } from "@/lib/types";

function Avatar({ label, muted }: { label: string; muted?: boolean }) {
  return (
    <span
      className="grid place-items-center rounded-full shrink-0"
      style={{
        width: 36,
        height: 36,
        fontWeight: 800,
        fontSize: 14,
        background: muted ? "var(--paper-2)" : "linear-gradient(150deg, var(--grape), var(--berry))",
        color: muted ? "var(--ink-soft)" : "#fff",
      }}
    >
      {label.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function PeopleManager({
  courseId,
  courseName,
  isAdmin,
  selfId,
  members,
  requests,
}: {
  courseId: string;
  courseName: string;
  isAdmin: boolean;
  selfId: string;
  members: CoursePerson[];
  requests: CourseJoinRequest[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [addRole, setAddRole] = useState<CourseRole>("student");
  const [busyAdd, setBusyAdd] = useState(false);
  const [busyRequest, setBusyRequest] = useState<string | null>(null);

  // in_charge can hand out student/teacher; only admins assign in_charge.
  const assignableRoles: CourseRole[] = isAdmin
    ? ["student", "teacher", "in_charge"]
    : ["student", "teacher"];

  async function act<T extends { ok: boolean; error?: string }>(p: Promise<T>, ok?: string) {
    const res = await p;
    if (!res.ok) toast(res.error ?? "Something went wrong.", "error");
    else if (ok) toast(ok);
    router.refresh();
    return res;
  }

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "32px 28px 80px" }}>
      <Link
        href={`/courses/${courseId}`}
        className="flex items-center gap-1.5 mb-4"
        style={{ fontSize: 13.5, fontWeight: 800, color: "var(--ink-soft)", width: "fit-content" }}
      >
        <ArrowLeftIcon width={16} height={16} /> Back to {courseName}
      </Link>

      <header className="mb-6">
        <h1 style={{ fontSize: 30 }}>People</h1>
        <p style={{ color: "var(--ink-soft)", marginTop: 6 }}>
          Who&apos;s in this course, and requests waiting on your yes.
        </p>
      </header>

      {/* pending join requests */}
      {requests.length > 0 && (
        <section className="card mb-6" style={{ padding: 16 }}>
          <h2 style={{ fontSize: 16, marginBottom: 4 }}>
            Join requests{" "}
            <span className="chip" style={{ marginLeft: 6 }}>
              {requests.length}
            </span>
          </h2>
          {requests.map((r) => (
            <div key={r.id} className="flex items-center gap-3" style={{ padding: "10px 2px" }}>
              <Avatar label={r.profile?.full_name ?? r.profile?.email ?? "?"} muted />
              <div className="min-w-0 flex-1">
                <span style={{ fontWeight: 800, fontSize: 14.5 }} className="block truncate">
                  {r.profile?.full_name ?? r.profile?.email ?? "Unknown"}
                </span>
                <span style={{ fontSize: 12.5, color: "var(--ink-soft)" }} className="block truncate">
                  {r.profile?.email} · wants to join as {roleLabel(r.requested_role).toLowerCase()}
                </span>
              </div>
              <button
                className="btn btn-primary btn-sm"
                disabled={busyRequest === r.id}
                onClick={async () => {
                  setBusyRequest(r.id);
                  await act(approveEnrollment(r.id), "Approved — they're in");
                  setBusyRequest(null);
                }}
              >
                {busyRequest === r.id ? (
                  <SpinnerIcon width={15} height={15} />
                ) : (
                  <>
                    <CheckIcon width={15} height={15} /> Approve
                  </>
                )}
              </button>
              <button
                className="btn btn-quiet btn-sm"
                disabled={busyRequest === r.id}
                onClick={() => act(declineEnrollment(r.id), "Request declined")}
                aria-label="Decline request"
              >
                <XIcon width={15} height={15} />
              </button>
            </div>
          ))}
        </section>
      )}

      {/* roster */}
      <section className="card" style={{ padding: 16 }}>
        <h2 style={{ fontSize: 16, marginBottom: 4 }}>
          Members{" "}
          <span className="chip" style={{ marginLeft: 6 }}>
            {members.length}
          </span>
        </h2>

        {members.length === 0 && (
          <p style={{ color: "var(--ink-soft)", fontSize: 14, padding: "10px 2px" }}>
            No members yet — add someone below.
          </p>
        )}

        {members.map((m) => {
          // Non-admins can't touch in_charge rows (RLS would refuse anyway).
          const locked = !isAdmin && m.role === "in_charge";
          return (
            <div key={m.membershipId} className="flex items-center gap-3" style={{ padding: "10px 2px" }}>
              <Avatar label={m.profile?.full_name ?? m.profile?.email ?? "?"} />
              <div className="min-w-0 flex-1">
                <span style={{ fontWeight: 800, fontSize: 14.5 }} className="block truncate">
                  {m.profile?.full_name ?? m.profile?.email ?? "Unknown"}
                  {m.userId === selfId && (
                    <span style={{ color: "var(--ink-faint)", fontWeight: 600 }}> (you)</span>
                  )}
                </span>
                <span style={{ fontSize: 12.5, color: "var(--ink-soft)" }} className="block truncate">
                  {m.profile?.email}
                </span>
              </div>
              {locked ? (
                <span className="chip chip-role">{roleLabel(m.role)}</span>
              ) : (
                <>
                  <select
                    className="field"
                    style={{ width: 130, padding: "7px 10px", fontSize: 13.5 }}
                    value={m.role}
                    onChange={(e) =>
                      act(
                        setMemberRole(courseId, m.userId, e.target.value as CourseRole),
                        "Role updated",
                      )
                    }
                  >
                    {assignableRoles.map((r) => (
                      <option key={r} value={r}>
                        {roleLabel(r)}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn btn-quiet"
                    style={{ padding: 7, color: "var(--berry-deep)" }}
                    onClick={() => act(removeMember(courseId, m.userId), "Removed from course")}
                    aria-label="Remove from course"
                  >
                    <TrashIcon width={16} height={16} />
                  </button>
                </>
              )}
            </div>
          );
        })}

        {/* add by email */}
        <div style={{ borderTop: "1px solid var(--line)", marginTop: 12, paddingTop: 14 }}>
          <label className="label" htmlFor="add-email">
            Add a person by email
          </label>
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!email.trim()) return;
              setBusyAdd(true);
              const res = await act(addMemberByEmail(courseId, email, addRole), "Added to course");
              setBusyAdd(false);
              if (res.ok) setEmail("");
            }}
          >
            <input
              id="add-email"
              type="email"
              className="field"
              placeholder="person@mathvision.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <select
              className="field"
              style={{ maxWidth: 140 }}
              value={addRole}
              onChange={(e) => setAddRole(e.target.value as CourseRole)}
            >
              {assignableRoles.map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r)}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ padding: "0 14px" }}
              disabled={busyAdd || !email.trim()}
              aria-label="Add member"
            >
              {busyAdd ? <SpinnerIcon width={16} height={16} /> : <PlusIcon width={18} height={18} />}
            </button>
          </form>
          <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 8 }}>
            They need an approved account first — new folks can sign up themselves,
            then you (or an admin) add them here or approve their join request.
          </p>
        </div>
      </section>
    </div>
  );
}
