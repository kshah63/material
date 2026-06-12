"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Menu } from "@/components/ui/Menu";
import { useToast } from "@/components/ui/Toast";
import {
  PlusIcon,
  UsersIcon,
  BookIcon,
  ShieldIcon,
  DotsIcon,
  TrashIcon,
  CheckIcon,
} from "@/components/icons";
import { roleLabel } from "@/lib/format";
import { GRADES } from "@/lib/options";
import { SchoolSelect } from "@/components/forms/SchoolSelect";
import {
  createCourse,
  setCourseArchived,
  setMembership,
  removeMembership,
  setAppRole,
  setAccountRole,
  approveAccount,
  inviteUser,
} from "@/app/actions/admin";
import type { AccountRole, Course, CourseRole, Profile } from "@/lib/types";

interface Membership {
  id: string;
  course_id: string;
  user_id: string;
  role: CourseRole;
}

type Tab = "courses" | "people";

const ROLES: CourseRole[] = ["student", "teacher", "in_charge"];

export function AdminConsole({
  profiles,
  courses,
  memberships,
}: {
  profiles: Profile[];
  courses: Course[];
  memberships: Membership[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("courses");

  const [createOpen, setCreateOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);

  const nameById = useMemo(() => {
    const m = new Map<string, Profile>();
    profiles.forEach((p) => m.set(p.id, p));
    return m;
  }, [profiles]);

  const countByCourse = useMemo(() => {
    const m = new Map<string, number>();
    memberships.forEach((x) => m.set(x.course_id, (m.get(x.course_id) ?? 0) + 1));
    return m;
  }, [memberships]);

  // Accounts awaiting approval float to the top of the People tab.
  const sortedProfiles = useMemo(
    () =>
      [...profiles].sort((a, b) =>
        a.status === b.status ? 0 : a.status === "pending" ? -1 : 1,
      ),
    [profiles],
  );
  const pendingCount = useMemo(
    () => profiles.filter((p) => p.status === "pending").length,
    [profiles],
  );

  async function act<T extends { ok: boolean; error?: string }>(
    p: Promise<T>,
    ok?: string,
  ) {
    const res = await p;
    if (!res.ok) toast(res.error ?? "Something went wrong.", "error");
    else if (ok) toast(ok);
    router.refresh();
    return res;
  }

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: "40px 28px 80px" }}>
      <header className="mb-6">
        <p className="mono mb-2" style={{ fontSize: 12, letterSpacing: "0.1em", color: "var(--grape)" }}>
          ADMIN CONSOLE
        </p>
        <h1 style={{ fontSize: 34 }}>Manage the portal</h1>
        <p style={{ color: "var(--ink-soft)", marginTop: 8 }}>
          Create courses, invite people, and assign who can do what — per course.
        </p>
      </header>

      {/* tabs */}
      <div className="flex items-center gap-1 mb-5" style={{ borderBottom: "1px solid var(--line)" }}>
        {(
          [
            { id: "courses" as Tab, label: "Courses", icon: <BookIcon width={17} height={17} /> },
            { id: "people" as Tab, label: "People", icon: <UsersIcon width={17} height={17} /> },
          ]
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="flex items-center gap-2"
            style={{
              padding: "10px 14px",
              fontWeight: 800,
              fontSize: 14.5,
              color: tab === t.id ? "var(--ink)" : "var(--ink-soft)",
              borderBottom: `2.5px solid ${tab === t.id ? "var(--berry)" : "transparent"}`,
              marginBottom: -1,
            }}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {tab === "courses" ? (
        <section>
          <div className="flex justify-between items-center mb-4">
            <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>
              {courses.length} course{courses.length === 1 ? "" : "s"}
            </p>
            <button className="btn btn-primary btn-sm" onClick={() => setCreateOpen(true)}>
              <PlusIcon width={17} height={17} /> New course
            </button>
          </div>

          <div className="flex flex-col gap-2">
            {courses.map((c) => (
              <div key={c.id} className="card flex items-center gap-3" style={{ padding: 14 }}>
                <span
                  className="grid place-items-center rounded-[10px] mono shrink-0"
                  style={{ width: 42, height: 42, fontSize: 12, background: "var(--grape)", color: "#fff" }}
                >
                  {(c.code ?? c.name).slice(0, 3).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span style={{ fontWeight: 800, fontSize: 15 }} className="truncate">
                      {c.name}
                    </span>
                    {c.archived_at && <span className="chip">Archived</span>}
                  </div>
                  <span className="mono" style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                    {c.code ?? "—"} · {countByCourse.get(c.id) ?? 0} member
                    {(countByCourse.get(c.id) ?? 0) === 1 ? "" : "s"}
                  </span>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditingCourse(c)}>
                  <UsersIcon width={16} height={16} /> Members
                </button>
                <Menu
                  align="right"
                  trigger={({ toggle }) => (
                    <button className="btn btn-quiet" style={{ padding: 7 }} onClick={toggle} aria-label="Course actions">
                      <DotsIcon />
                    </button>
                  )}
                  items={[
                    {
                      label: c.archived_at ? "Unarchive" : "Archive",
                      onSelect: () => act(setCourseArchived(c.id, !c.archived_at), "Course updated"),
                    },
                  ]}
                />
              </div>
            ))}
            {courses.length === 0 && (
              <div className="card text-center" style={{ padding: 40, color: "var(--ink-soft)" }}>
                No courses yet. Create your first one.
              </div>
            )}
          </div>
        </section>
      ) : (
        <section>
          <div className="flex justify-between items-center mb-4">
            <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>
              {profiles.length} {profiles.length === 1 ? "person" : "people"}
              {pendingCount > 0 && ` · ${pendingCount} awaiting approval`}
            </p>
            <button className="btn btn-primary btn-sm" onClick={() => setInviteOpen(true)}>
              <PlusIcon width={17} height={17} /> Invite person
            </button>
          </div>

          <div className="flex flex-col gap-2">
            {sortedProfiles.map((p) => (
              <div key={p.id} className="card flex items-center gap-3" style={{ padding: 14 }}>
                <span
                  className="grid place-items-center rounded-full shrink-0"
                  style={{
                    width: 38,
                    height: 38,
                    background:
                      p.status === "pending"
                        ? "var(--paper-2)"
                        : "linear-gradient(150deg, var(--grape), var(--berry))",
                    color: p.status === "pending" ? "var(--ink-soft)" : "#fff",
                    fontWeight: 800,
                  }}
                >
                  {(p.full_name ?? p.email).slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <span style={{ fontWeight: 800, fontSize: 15 }} className="block truncate">
                    {p.full_name ?? p.email.split("@")[0]}
                  </span>
                  <span style={{ fontSize: 12.5, color: "var(--ink-soft)" }} className="block truncate">
                    {[
                      p.email,
                      roleLabel(p.account_role),
                      ...(p.account_role === "student"
                        ? [p.grade, p.school].filter(Boolean)
                        : []),
                    ].join(" · ")}
                  </span>
                </div>
                {p.status === "pending" ? (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => act(approveAccount(p.id), "Account approved")}
                  >
                    <CheckIcon width={15} height={15} /> Approve
                  </button>
                ) : (
                  p.app_role === "admin" && (
                    <span className="chip chip-role">
                      <ShieldIcon width={12} height={12} /> Admin
                    </span>
                  )
                )}
                <Menu
                  align="right"
                  trigger={({ toggle }) => (
                    <button className="btn btn-quiet" style={{ padding: 7 }} onClick={toggle} aria-label="Person actions">
                      <DotsIcon />
                    </button>
                  )}
                  items={[
                    p.app_role === "admin"
                      ? { label: "Revoke admin", onSelect: () => act(setAppRole(p.id, "member"), "Updated") }
                      : { label: "Make admin", icon: <ShieldIcon width={16} height={16} />, onSelect: () => act(setAppRole(p.id, "admin"), "Updated") },
                    p.account_role === "teacher"
                      ? { label: "Switch to student account", onSelect: () => act(setAccountRole(p.id, "student"), "Updated") }
                      : { label: "Switch to teacher account", onSelect: () => act(setAccountRole(p.id, "teacher"), "Updated") },
                  ]}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {createOpen && (
        <CreateCourseModal
          onClose={() => setCreateOpen(false)}
          onCreate={async (input) => {
            await act(createCourse(input), "Course created");
          }}
        />
      )}

      {inviteOpen && (
        <InviteModal
          courses={courses}
          onClose={() => setInviteOpen(false)}
          onInvite={async (input) => {
            const res = await act(inviteUser(input));
            if (res.ok)
              toast(
                "reinvited" in res && (res as { reinvited?: boolean }).reinvited
                  ? "User already existed — membership updated"
                  : "Invitation sent",
              );
          }}
        />
      )}

      {editingCourse && (
        <MembersModal
          course={editingCourse}
          profiles={profiles}
          memberships={memberships.filter((m) => m.course_id === editingCourse.id)}
          nameById={nameById}
          onClose={() => setEditingCourse(null)}
          onSet={(userId, role) => act(setMembership(editingCourse.id, userId, role), "Member updated")}
          onRemove={(userId) => act(removeMembership(editingCourse.id, userId), "Member removed")}
        />
      )}
    </div>
  );
}

function CreateCourseModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (input: { name: string; code?: string; description?: string }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Modal open onClose={onClose} title="New course" width={460}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          setBusy(true);
          await onCreate({ name, code, description });
          setBusy(false);
          onClose();
        }}
      >
        <label className="label">Course name</label>
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Integrated Math 2 — Trig" />
        <label className="label" style={{ marginTop: 14 }}>
          Code <span style={{ color: "var(--ink-faint)", fontWeight: 600 }}>(optional)</span>
        </label>
        <input className="field" value={code} onChange={(e) => setCode(e.target.value)} placeholder="IM2T" />
        <label className="label" style={{ marginTop: 14 }}>
          Description <span style={{ color: "var(--ink-faint)", fontWeight: 600 }}>(optional)</span>
        </label>
        <input className="field" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this course covers" />
        <div className="flex justify-end gap-2 mt-5">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>
            Create course
          </button>
        </div>
      </form>
    </Modal>
  );
}

function InviteModal({
  courses,
  onClose,
  onInvite,
}: {
  courses: Course[];
  onClose: () => void;
  onInvite: (input: {
    email: string;
    fullName?: string;
    accountRole?: AccountRole;
    grade?: string;
    school?: string;
    courseId?: string;
    role?: CourseRole;
  }) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [accountRole, setAccountRole] = useState<AccountRole>("student");
  const [grade, setGrade] = useState("");
  const [school, setSchool] = useState("");
  const [courseId, setCourseId] = useState("");
  const [role, setRole] = useState<CourseRole>("student");
  const [busy, setBusy] = useState(false);
  const active = courses.filter((c) => !c.archived_at);

  return (
    <Modal open onClose={onClose} title="Invite a person" width={460}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!email.trim()) return;
          setBusy(true);
          await onInvite({
            email,
            fullName: fullName || undefined,
            accountRole,
            grade: accountRole === "student" ? grade.trim() || undefined : undefined,
            school: accountRole === "student" ? school.trim() || undefined : undefined,
            courseId: courseId || undefined,
            role: courseId ? role : undefined,
          });
          setBusy(false);
          onClose();
        }}
      >
        <label className="label">Email</label>
        <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="person@mathvision.com" />
        <label className="label" style={{ marginTop: 14 }}>
          Full name <span style={{ color: "var(--ink-faint)", fontWeight: 600 }}>(optional)</span>
        </label>
        <input className="field" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jordan Lee" />

        <label className="label" style={{ marginTop: 14 }}>Account type</label>
        <select
          className="field"
          value={accountRole}
          onChange={(e) => setAccountRole(e.target.value as AccountRole)}
        >
          <option value="student">Student</option>
          <option value="teacher">Teacher</option>
        </select>

        {accountRole === "student" && (
          <>
            <label className="label" style={{ marginTop: 14 }}>
              Grade <span style={{ color: "var(--ink-faint)", fontWeight: 600 }}>(optional)</span>
            </label>
            <select className="field" value={grade} onChange={(e) => setGrade(e.target.value)}>
              <option value="">No grade yet</option>
              {GRADES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
            <label className="label" style={{ marginTop: 14 }}>
              School <span style={{ color: "var(--ink-faint)", fontWeight: 600 }}>(optional)</span>
            </label>
            <SchoolSelect value={school} onChange={setSchool} />
          </>
        )}

        <label className="label" style={{ marginTop: 14 }}>
          Add to a course <span style={{ color: "var(--ink-faint)", fontWeight: 600 }}>(optional)</span>
        </label>
        <div className="flex gap-2">
          <select className="field" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            <option value="">No course yet</option>
            {active.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            className="field"
            style={{ maxWidth: 150 }}
            value={role}
            onChange={(e) => setRole(e.target.value as CourseRole)}
            disabled={!courseId}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {roleLabel(r)}
              </option>
            ))}
          </select>
        </div>
        <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 10 }}>
          We’ll email a sign-in link. They set a password on first visit.
        </p>
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !email.trim()}>
            Send invitation
          </button>
        </div>
      </form>
    </Modal>
  );
}

function MembersModal({
  course,
  profiles,
  memberships,
  nameById,
  onClose,
  onSet,
  onRemove,
}: {
  course: Course;
  profiles: Profile[];
  memberships: Membership[];
  nameById: Map<string, Profile>;
  onClose: () => void;
  onSet: (userId: string, role: CourseRole) => void;
  onRemove: (userId: string) => void;
}) {
  const memberIds = new Set(memberships.map((m) => m.user_id));
  const nonMembers = profiles.filter((p) => !memberIds.has(p.id));
  const [addUser, setAddUser] = useState("");
  const [addRole, setAddRole] = useState<CourseRole>("student");

  return (
    <Modal open onClose={onClose} title={`Members · ${course.name}`} width={520}>
      <div className="scroll-soft" style={{ maxHeight: 320, overflowY: "auto", margin: "0 -2px" }}>
        {memberships.length === 0 && (
          <p style={{ color: "var(--ink-soft)", fontSize: 14, padding: "8px 2px" }}>
            No members yet. Add someone below.
          </p>
        )}
        {memberships.map((m) => {
          const p = nameById.get(m.user_id);
          return (
            <div key={m.id} className="flex items-center gap-2.5" style={{ padding: "8px 2px" }}>
              <span
                className="grid place-items-center rounded-full shrink-0"
                style={{ width: 32, height: 32, background: "var(--paper-2)", fontWeight: 800, fontSize: 13, color: "var(--ink-soft)" }}
              >
                {(p?.full_name ?? p?.email ?? "?").slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <span style={{ fontWeight: 700, fontSize: 14 }} className="block truncate">
                  {p?.full_name ?? p?.email ?? "Unknown"}
                </span>
                <span style={{ fontSize: 12, color: "var(--ink-soft)" }} className="block truncate">
                  {p?.email}
                </span>
              </div>
              <select
                className="field"
                style={{ width: 140, padding: "7px 10px", fontSize: 13.5 }}
                value={m.role}
                onChange={(e) => onSet(m.user_id, e.target.value as CourseRole)}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {roleLabel(r)}
                  </option>
                ))}
              </select>
              <button
                className="btn btn-quiet"
                style={{ padding: 7, color: "var(--berry-deep)" }}
                onClick={() => onRemove(m.user_id)}
                aria-label="Remove member"
              >
                <TrashIcon width={16} height={16} />
              </button>
            </div>
          );
        })}
      </div>

      <div style={{ borderTop: "1px solid var(--line)", marginTop: 12, paddingTop: 14 }}>
        <label className="label">Add a member</label>
        <div className="flex gap-2">
          <select className="field" value={addUser} onChange={(e) => setAddUser(e.target.value)}>
            <option value="">Choose a person…</option>
            {nonMembers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name ? `${p.full_name} (${p.email})` : p.email}
              </option>
            ))}
          </select>
          <select className="field" style={{ maxWidth: 150 }} value={addRole} onChange={(e) => setAddRole(e.target.value as CourseRole)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {roleLabel(r)}
              </option>
            ))}
          </select>
          <button
            className="btn btn-primary"
            style={{ padding: "0 14px" }}
            disabled={!addUser}
            onClick={() => {
              if (!addUser) return;
              onSet(addUser, addRole);
              setAddUser("");
            }}
            aria-label="Add member"
          >
            <CheckIcon width={18} height={18} />
          </button>
        </div>
        {nonMembers.length === 0 && (
          <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 8 }}>
            Everyone is already a member. Invite more people from the People tab.
          </p>
        )}
      </div>
    </Modal>
  );
}
