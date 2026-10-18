"use client";

import { XIcon } from "@/components/icons";
import type { QuestionTopic } from "@/lib/types";
import type { Choice, SectionRow } from "@/lib/worksheet/sections";

// The All pages view's sections (docs/WORKSHEETS.md §4.3): one row per section
// the finder read a heading for, each with one topic picker. Beside the pages on
// a laptop; a drawer from the Sections button on a narrower screen.

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
const SAME = "same";
const NONE = "";

/** A picker's value: a topic id, "" for No topic, "same", or "mixed". */
const valueOf = (c: Choice | "mixed") => (c === null ? NONE : c);

export function SectionsRail({
  rows,
  topics,
  disabled,
  finding,
  onChoose,
  onOpen,
  onRemove,
  onClose,
}: {
  rows: readonly SectionRow[];
  topics: readonly QuestionTopic[];
  disabled: boolean;
  /** The suggestions are still being read: the headings are not known yet. */
  finding: boolean;
  onChoose: (k: number, choice: Choice) => void;
  /** A row's heading clicked: the pages scroll to where it starts. */
  onOpen: (k: number) => void;
  /** A section started on this screen taken away again. */
  onRemove: (k: number) => void;
  /** Set for the drawer: its close button. */
  onClose?: () => void;
}) {
  return (
    <nav aria-label="Sections" className="flex flex-col min-h-0 h-full">
      <div
        className="flex items-center gap-2"
        style={{ padding: "12px 14px 8px", fontSize: 12, fontWeight: 800, letterSpacing: "0.04em", color: "var(--ink-soft)" }}
      >
        <span className="mono" style={{ textTransform: "uppercase" }}>
          Sections
        </span>
        {onClose && (
          <button className="btn btn-quiet btn-sm" style={{ marginLeft: "auto", padding: 6 }} onClick={onClose} aria-label="Close sections">
            <XIcon width={15} height={15} />
          </button>
        )}
      </div>
      <p style={{ padding: "0 14px 10px", fontSize: 12.5, color: "var(--ink-soft)" }}>
        {finding
          ? "Reading the bank's headings…"
          : rows.length
            ? "A topic here tags every question in its section, and those under it set to Same as above."
            : "No headings or questions yet. Questions you draw are listed here."}
      </p>
      <ol className="flex-1 min-h-0 overflow-auto scroll-soft" style={{ padding: "0 8px 12px" }}>
        {rows.map((r, k) => {
          const count = r.questions.length
            ? plural(r.questions.length, "question")
            : r.suggested
              ? `${r.suggested} suggested`
              : "no questions";
          const pages = r.pages[0] === r.pages[1] ? `p. ${r.pages[0]}` : `pp. ${r.pages[0]}–${r.pages[1]}`;
          const name = r.section.heading ?? (k === 0 && rows.length === 1 ? "The whole bank" : "Before the first heading");
          return (
            <li
              key={r.section.id}
              style={{ padding: "8px 6px", borderTop: k ? "1px solid var(--line)" : undefined }}
            >
              <div className="flex items-start gap-1">
                <button
                  className="block min-w-0 flex-1 text-left"
                  style={{ padding: 0, background: "transparent", border: 0, cursor: "pointer" }}
                  onClick={() => onOpen(k)}
                  title={`Go to ${name}`}
                >
                  <span className="block truncate" style={{ fontSize: 13.5, fontWeight: 800 }}>
                    {name}
                  </span>
                  <span className="block mono" style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 1 }}>
                    {pages} · {count}
                  </span>
                </button>
                {r.section.started && (
                  <button
                    className="btn btn-quiet btn-sm"
                    style={{ padding: 4 }}
                    onClick={() => onRemove(k)}
                    aria-label={`Remove the section ${name}`}
                    title="Not a section: its questions keep their topics"
                  >
                    <XIcon width={13} height={13} />
                  </button>
                )}
              </div>
              <select
                className="field"
                style={{ marginTop: 6, padding: "5px 8px", fontSize: 13 }}
                value={valueOf(r.shows)}
                disabled={disabled}
                onChange={(e) => {
                  const v = e.target.value;
                  onChoose(k, v === SAME ? "same" : v === NONE ? null : v);
                }}
                aria-label={`Topic for ${name}`}
              >
                {k > 0 && <option value={SAME}>Same as above</option>}
                {r.shows === "mixed" && (
                  <option value="mixed" disabled>
                    Mixed topics
                  </option>
                )}
                <option value={NONE}>No topic</option>
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
