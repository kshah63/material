"use client";

import Link from "next/link";
import { ChevronRightIcon } from "@/components/icons";
import type { BreadcrumbCrumb } from "@/lib/types";

export function Breadcrumb({
  courseId,
  courseName,
  crumbs,
}: {
  courseId: string;
  courseName: string;
  crumbs: BreadcrumbCrumb[];
}) {
  return (
    <nav className="flex items-center flex-wrap gap-1" aria-label="Breadcrumb">
      <Link
        href={`/courses/${courseId}`}
        className="rounded-[7px] px-1.5 py-0.5 transition-colors hover:bg-[var(--paper-2)]"
        style={{ fontSize: 14, fontWeight: 800, color: crumbs.length ? "var(--ink-soft)" : "var(--ink)" }}
      >
        {courseName}
      </Link>
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1;
        return (
          <span key={c.id} className="flex items-center gap-1">
            <ChevronRightIcon width={14} height={14} style={{ color: "var(--ink-faint)" }} />
            {last ? (
              <span style={{ fontSize: 14, fontWeight: 800, color: "var(--ink)" }} className="px-1.5">
                {c.name}
              </span>
            ) : (
              <Link
                href={`/courses/${courseId}?folder=${c.id}`}
                className="rounded-[7px] px-1.5 py-0.5 transition-colors hover:bg-[var(--paper-2)]"
                style={{ fontSize: 14, fontWeight: 800, color: "var(--ink-soft)" }}
              >
                {c.name}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
