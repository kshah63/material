"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/Logo";
import { Menu } from "@/components/ui/Menu";
import {
  BookIcon,
  ShieldIcon,
  LogoutIcon,
  ChevronRightIcon,
  XIcon,
} from "@/components/icons";
import { roleLabel } from "@/lib/format";
import { signOut } from "@/app/actions/auth";
import type { CourseWithRole, Profile } from "@/lib/types";

function NavCourses({
  courses,
  onNavigate,
}: {
  courses: CourseWithRole[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = courses.filter((c) => !c.archived_at);
  return (
    <nav className="flex flex-col gap-0.5">
      <p
        className="mono px-2 mb-1"
        style={{ fontSize: 10.5, letterSpacing: "0.1em", color: "var(--ink-faint)" }}
      >
        YOUR COURSES
      </p>
      {active.length === 0 && (
        <p className="px-2 py-1" style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>
          No courses yet.
        </p>
      )}
      {active.map((c) => {
        const isActive = pathname.startsWith(`/courses/${c.id}`);
        return (
          <Link
            key={c.id}
            href={`/courses/${c.id}`}
            onClick={onNavigate}
            className="flex items-center gap-2.5 rounded-[10px] group"
            style={{
              padding: "9px 10px",
              background: isActive ? "var(--surface)" : "transparent",
              border: `1px solid ${isActive ? "var(--line)" : "transparent"}`,
              boxShadow: isActive ? "var(--shadow-card)" : "none",
            }}
          >
            <span
              className="grid place-items-center rounded-[8px] shrink-0 mono"
              style={{
                width: 30,
                height: 30,
                fontSize: 11,
                fontWeight: 500,
                background: isActive ? "var(--marker)" : "var(--paper-2)",
                color: isActive ? "var(--marker-ink)" : "var(--ink-soft)",
              }}
            >
              {(c.code ?? c.name).slice(0, 3).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span
                className="block truncate"
                style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}
              >
                {c.name}
              </span>
              <span style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>
                {c.is_admin_view ? "Admin view" : roleLabel(c.role)}
              </span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarInner({
  profile,
  courses,
  onNavigate,
}: {
  profile: Profile;
  courses: CourseWithRole[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <div className="flex flex-col h-full" style={{ padding: 16 }}>
      <div className="px-1 pb-4">
        <Link href="/courses" onClick={onNavigate}>
          <Logo />
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto scroll-soft -mx-1 px-1">
        <NavCourses courses={courses} onNavigate={onNavigate} />

        {profile.app_role === "admin" && (
          <>
            <div style={{ height: 1, background: "var(--line)", margin: "14px 4px" }} />
            <Link
              href="/admin"
              onClick={onNavigate}
              className="flex items-center gap-2.5 rounded-[10px]"
              style={{
                padding: "9px 10px",
                background: pathname.startsWith("/admin") ? "var(--surface)" : "transparent",
                border: `1px solid ${pathname.startsWith("/admin") ? "var(--line)" : "transparent"}`,
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              <ShieldIcon width={18} height={18} style={{ color: "var(--grape)" }} />
              Admin console
            </Link>
          </>
        )}
      </div>

      {/* user */}
      <div className="pt-3" style={{ borderTop: "1px solid var(--line)" }}>
        <Menu
          align="left"
          trigger={({ toggle }) => (
            <button
              onClick={toggle}
              className="flex items-center gap-2.5 w-full rounded-[10px]"
              style={{ padding: "8px 8px" }}
            >
              <span
                className="grid place-items-center rounded-full shrink-0"
                style={{
                  width: 32,
                  height: 32,
                  background: "linear-gradient(150deg, var(--grape), var(--berry))",
                  color: "#fff",
                  fontWeight: 800,
                  fontSize: 13,
                }}
              >
                {(profile.full_name ?? profile.email).slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate" style={{ fontSize: 13.5, fontWeight: 800 }}>
                  {profile.full_name ?? profile.email.split("@")[0]}
                </span>
                <span className="block truncate" style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>
                  {profile.app_role === "admin" ? "Administrator" : profile.email}
                </span>
              </span>
              <ChevronRightIcon width={16} height={16} style={{ color: "var(--ink-faint)" }} />
            </button>
          )}
          items={[
            {
              label: "Sign out",
              icon: <LogoutIcon width={17} height={17} />,
              onSelect: () => void signOut(),
            },
          ]}
        />
      </div>
    </div>
  );
}

export function AppShell({
  profile,
  courses,
  children,
}: {
  profile: Profile;
  courses: CourseWithRole[];
  children: React.ReactNode;
}) {
  const [drawer, setDrawer] = useState(false);

  return (
    <div className="min-h-dvh lg:grid" style={{ gridTemplateColumns: "272px 1fr" }}>
      {/* desktop sidebar */}
      <aside
        className="hidden lg:block sticky top-0 h-dvh"
        style={{ background: "var(--paper-2)", borderRight: "1px solid var(--line)" }}
      >
        <SidebarInner profile={profile} courses={courses} />
      </aside>

      {/* mobile top bar */}
      <header
        className="lg:hidden flex items-center justify-between sticky top-0 z-30"
        style={{
          padding: "12px 16px",
          background: "var(--paper-2)",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <Logo />
        <button className="btn btn-ghost btn-sm" onClick={() => setDrawer(true)}>
          Menu
        </button>
      </header>

      {/* mobile drawer */}
      {drawer && (
        <div className="lg:hidden fixed inset-0 z-50" style={{ background: "rgba(51,39,27,0.42)" }} onMouseDown={(e) => e.target === e.currentTarget && setDrawer(false)}>
          <div
            className="absolute left-0 top-0 h-full pop"
            style={{ width: 288, background: "var(--paper-2)", borderRight: "1px solid var(--line)" }}
          >
            <button
              className="btn btn-quiet absolute"
              style={{ right: 8, top: 12, padding: 6, zIndex: 2 }}
              onClick={() => setDrawer(false)}
              aria-label="Close menu"
            >
              <XIcon />
            </button>
            <SidebarInner profile={profile} courses={courses} onNavigate={() => setDrawer(false)} />
          </div>
        </div>
      )}

      <main className="min-w-0">{children}</main>
    </div>
  );
}

export { BookIcon };
