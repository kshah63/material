import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { getMyCourses, getMyPendingRequests } from "@/lib/queries";
import { roleLabel } from "@/lib/format";
import { BookIcon, ChevronRightIcon, ShieldIcon } from "@/components/icons";
import { JoinCourseCard } from "@/components/courses/JoinCourseCard";
import type { CourseWithRole } from "@/lib/types";

export const dynamic = "force-dynamic";

function CourseCard({ course }: { course: CourseWithRole }) {
  const initials = (course.code ?? course.name).slice(0, 3).toUpperCase();
  return (
    <Link
      href={`/courses/${course.id}`}
      className="card group flex flex-col rise"
      style={{ padding: 20, transition: "transform .14s ease, box-shadow .14s ease" }}
      onMouseEnter={undefined}
    >
      <div className="flex items-start justify-between mb-4">
        <span
          className="grid place-items-center rounded-[12px] mono"
          style={{
            width: 48,
            height: 48,
            fontSize: 15,
            fontWeight: 500,
            background: "linear-gradient(150deg, var(--grape), var(--grape-deep))",
            color: "#fff",
            boxShadow: "0 6px 14px -10px rgba(46,49,146,0.9)",
          }}
        >
          {initials}
        </span>
        {course.is_admin_view ? (
          <span className="chip chip-role">
            <ShieldIcon width={12} height={12} /> Admin
          </span>
        ) : (
          <span className="chip">{roleLabel(course.role)}</span>
        )}
      </div>

      <h3 style={{ fontSize: 20, marginBottom: 4 }}>{course.name}</h3>
      {course.code && (
        <p className="mono" style={{ fontSize: 12, color: "var(--honey-deep)" }}>
          {course.code}
        </p>
      )}
      <p
        style={{
          fontSize: 14,
          color: "var(--ink-soft)",
          marginTop: 10,
          flex: 1,
          minHeight: 20,
        }}
      >
        {course.description || "Open to browse materials."}
      </p>

      <span
        className="flex items-center gap-1 mt-4"
        style={{ fontSize: 13.5, fontWeight: 800, color: "var(--berry-deep)" }}
      >
        Open shelf
        <ChevronRightIcon
          width={16}
          height={16}
          className="transition-transform group-hover:translate-x-0.5"
        />
      </span>
    </Link>
  );
}

export default async function CoursesPage() {
  const profile = await requireProfile();
  const isAdmin = profile.app_role === "admin";
  const [courses, pendingRequests] = await Promise.all([
    getMyCourses(isAdmin),
    getMyPendingRequests(),
  ]);
  const requestByCourse = new Map(pendingRequests.map((r) => [r.course_id, r.id]));

  // The directory policy surfaces every live course; split "mine" from
  // "joinable" (admins see everything as theirs, so joinable stays empty).
  const enrolled = courses.filter((c) => c.role || c.is_admin_view);
  const joinable = courses.filter(
    (c) => !c.role && !c.is_admin_view && !c.archived_at,
  );
  const active = enrolled.filter((c) => !c.archived_at);
  const archived = enrolled.filter((c) => c.archived_at);

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "40px 28px 80px" }}>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p
            className="mono mb-2"
            style={{ fontSize: 12, letterSpacing: "0.1em", color: "var(--honey-deep)" }}
          >
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
          <h1 style={{ fontSize: 38 }}>
            Your <span className="marker-name">courses</span>
          </h1>
          <p style={{ color: "var(--ink-soft)", marginTop: 8, fontSize: 16 }}>
            {active.length === 0
              ? "Nothing here yet — an admin can add you to a course."
              : `${active.length} course${active.length === 1 ? "" : "s"} on your shelf.`}
          </p>
        </div>
        {isAdmin && (
          <Link href="/admin" className="btn btn-ghost">
            <ShieldIcon width={17} height={17} /> Admin console
          </Link>
        )}
      </header>

      {active.length === 0 ? (
        <div
          className="card flex flex-col items-center text-center rise"
          style={{ padding: "56px 24px" }}
        >
          <span
            className="grid place-items-center rounded-[16px] mb-4"
            style={{ width: 64, height: 64, background: "var(--paper-2)", color: "var(--ink-faint)" }}
          >
            <BookIcon width={30} height={30} />
          </span>
          <h3 style={{ fontSize: 20 }}>No courses on your shelf</h3>
          <p style={{ color: "var(--ink-soft)", marginTop: 6, maxWidth: 360 }}>
            {isAdmin
              ? "Create a course and add members from the admin console."
              : joinable.length > 0
                ? "Request to join a course below, or ask a teacher to add you."
                : "When a teacher adds you to a course, it’ll appear right here."}
          </p>
          {isAdmin && (
            <Link href="/admin" className="btn btn-primary mt-5">
              Go to admin console
            </Link>
          )}
        </div>
      ) : (
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}
        >
          {active.map((c) => (
            <CourseCard key={c.id} course={c} />
          ))}
        </div>
      )}

      {joinable.length > 0 && (
        <section className="mt-12">
          <h2
            className="mono"
            style={{ fontSize: 12, letterSpacing: "0.1em", color: "var(--ink-faint)", marginBottom: 14 }}
          >
            JOIN A COURSE
          </h2>
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}
          >
            {joinable.map((c) => (
              <JoinCourseCard
                key={c.id}
                course={c}
                pendingRequestId={requestByCourse.get(c.id) ?? null}
              />
            ))}
          </div>
        </section>
      )}

      {archived.length > 0 && (
        <section className="mt-12">
          <h2 className="mono" style={{ fontSize: 12, letterSpacing: "0.1em", color: "var(--ink-faint)", marginBottom: 14 }}>
            ARCHIVED
          </h2>
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
            {archived.map((c) => (
              <div key={c.id} style={{ opacity: 0.65 }}>
                <CourseCard course={c} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
