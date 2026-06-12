"use client";

import { useEffect, useRef, useState } from "react";
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
  UsersIcon,
  XIcon,
} from "@/components/icons";
import {
  addMember,
  addStudentsByGroup,
  approveEnrollment,
  declineEnrollment,
  removeMember,
  searchPeople,
  setMemberRole,
  type PersonHit,
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
  gradeOptions,
  schoolOptions,
}: {
  courseId: string;
  courseName: string;
  isAdmin: boolean;
  selfId: string;
  members: CoursePerson[];
  requests: CourseJoinRequest[];
  gradeOptions: string[];
  schoolOptions: string[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [busyRequest, setBusyRequest] = useState<string | null>(null);

  // name/email typeahead
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PersonHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const searchSeq = useRef(0);

  // bulk add by grade/school
  const [bulkGrade, setBulkGrade] = useState("");
  const [bulkSchool, setBulkSchool] = useState("");
  const [busyBulk, setBusyBulk] = useState(false);

  // Debounced lookup; hits/searching are reset in the input's onChange so the
  // effect only ever talks to the server.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const seq = ++searchSeq.current;
    const t = setTimeout(async () => {
      const res = await searchPeople(courseId, q);
      if (seq !== searchSeq.current) return; // a newer keystroke superseded us
      setSearching(false);
      if (res.ok) setHits(res.results);
    }, 250);
    return () => clearTimeout(t);
  }, [query, courseId]);

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
                  {m.profile?.account_role === "student" &&
                  (m.profile.grade || m.profile.school || m.profile.country)
                    ? ` · ${[m.profile.grade, m.profile.school, m.profile.country].filter(Boolean).join(" · ")}`
                    : ""}
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

        {/* add people */}
        <div style={{ borderTop: "1px solid var(--line)", marginTop: 12, paddingTop: 14 }}>
          <label className="label" htmlFor="people-search">
            Add a person
          </label>
          <input
            id="people-search"
            className="field"
            placeholder="Search by name or email…"
            value={query}
            autoComplete="off"
            onChange={(e) => {
              const v = e.target.value;
              setQuery(v);
              if (v.trim().length < 2) {
                setHits([]);
                setSearching(false);
              } else {
                setSearching(true);
              }
            }}
          />
          {query.trim().length >= 2 && (
            <div
              className="scroll-soft"
              style={{ marginTop: 8, maxHeight: 300, overflowY: "auto" }}
            >
              {searching && hits.length === 0 ? (
                <p style={{ padding: 10, fontSize: 13.5, color: "var(--ink-soft)" }}>
                  Searching…
                </p>
              ) : hits.length === 0 ? (
                <p style={{ padding: 10, fontSize: 13.5, color: "var(--ink-soft)" }}>
                  No account matches that yet. New folks can sign up themselves —
                  once an admin approves them, they&apos;ll show up here.
                </p>
              ) : (
                hits.map((h) => (
                  <button
                    key={h.id}
                    className="w-full flex items-center gap-2.5 text-left hover:bg-[var(--paper-2)]"
                    style={{ padding: "8px 8px", borderRadius: 10 }}
                    disabled={h.alreadyMember || h.pending || addingId === h.id}
                    onClick={async () => {
                      setAddingId(h.id);
                      const res = await addMember(courseId, h.id);
                      setAddingId(null);
                      if (!res.ok) {
                        toast(res.error ?? "Something went wrong.", "error");
                      } else {
                        toast(
                          `${h.full_name ?? h.email} added as ${roleLabel(h.account_role).toLowerCase()}`,
                        );
                        setQuery("");
                        setHits([]);
                      }
                      router.refresh();
                    }}
                  >
                    <Avatar label={h.full_name ?? h.email} muted />
                    <span className="min-w-0 flex-1">
                      <span style={{ fontWeight: 800, fontSize: 14 }} className="block truncate">
                        {h.full_name ?? h.email}
                      </span>
                      <span
                        style={{ fontSize: 12, color: "var(--ink-soft)" }}
                        className="block truncate"
                      >
                        {[
                          h.email,
                          roleLabel(h.account_role),
                          ...(h.account_role === "student"
                            ? [h.grade, h.school, h.country].filter(Boolean)
                            : []),
                        ].join(" · ")}
                      </span>
                    </span>
                    {h.alreadyMember ? (
                      <span className="chip">Member</span>
                    ) : h.pending ? (
                      <span className="chip" title="This account is waiting for admin approval">
                        Pending
                      </span>
                    ) : addingId === h.id ? (
                      <SpinnerIcon width={16} height={16} />
                    ) : (
                      <PlusIcon width={17} height={17} style={{ color: "var(--berry-deep)" }} />
                    )}
                  </button>
                ))
              )}
            </div>
          )}

          <label className="label" style={{ marginTop: 16 }}>
            Add a whole group of students
          </label>
          <div className="flex gap-2 flex-wrap">
            <select
              className="field"
              style={{ flex: 1, minWidth: 120 }}
              value={bulkGrade}
              onChange={(e) => setBulkGrade(e.target.value)}
            >
              <option value="">Any grade</option>
              {gradeOptions.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
            <select
              className="field"
              style={{ flex: 2, minWidth: 160 }}
              value={bulkSchool}
              onChange={(e) => setBulkSchool(e.target.value)}
            >
              <option value="">Any school</option>
              {schoolOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <button
              className="btn btn-primary"
              disabled={busyBulk || (!bulkGrade && !bulkSchool)}
              onClick={async () => {
                setBusyBulk(true);
                const res = await addStudentsByGroup(courseId, {
                  grade: bulkGrade || undefined,
                  school: bulkSchool || undefined,
                });
                setBusyBulk(false);
                if (!res.ok) toast(res.error ?? "Something went wrong.", "error");
                else toast(`Added ${res.added} student${res.added === 1 ? "" : "s"}`);
                router.refresh();
              }}
            >
              {busyBulk ? (
                <SpinnerIcon width={16} height={16} />
              ) : (
                <>
                  <UsersIcon width={16} height={16} /> Add all
                </>
              )}
            </button>
          </div>
          <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 8 }}>
            Group add pulls in every approved student matching the grade/school you
            pick (they join as students; nobody is added twice).
          </p>
        </div>
      </section>
    </div>
  );
}
