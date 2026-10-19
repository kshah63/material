"use client";

import { useEffect, useRef } from "react";
import { CheckIcon, PlusIcon, XIcon } from "@/components/icons";
import type { Offer } from "@/lib/worksheet/crops";

// The All pages view's Next to check (docs/WORKSHEETS.md §4.3): one suggestion
// at a time that Accept all leaves, scrolled to and outlined on its page. One
// press takes it, one skips it, and the next is shown. While the panel has
// focus, Enter takes and S skips; on one of its buttons, Enter is that button's;
// Esc closes it.

export interface CheckChoice {
  /** What Enter does: "Accept", "Add as box 2", or "Accept as a question". */
  label: string;
  /** Whether it is a box added to a question, not a question of its own. */
  joins: boolean;
}

export function CheckPanel({
  item,
  what,
  why,
  choice,
  left,
  disabled,
  onTake,
  onSkip,
  onClose,
}: {
  item: Offer;
  /** The suggestion in words, with its page. */
  what: string;
  /** Why it needs a look. */
  why: string[];
  choice: CheckChoice;
  /** How many are left to check, this one included. */
  left: number;
  disabled: boolean;
  onTake: () => void;
  onSkip: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Each new item has the panel's focus, so Enter and S work at once, whatever
  // was pressed last (a button keeps the focus after a click).
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, [item.id]);

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="dialog"
      aria-label="Next to check"
      className="fixed z-40 card pop"
      style={{
        right: 16,
        bottom: 16,
        width: "min(400px, calc(100vw - 32px))",
        padding: "12px 14px",
        boxShadow: "var(--shadow-pop)",
        outline: "none",
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        } else if (e.key === "Enter" && e.target === e.currentTarget) {
          // The panel's own Enter; a button focused in it (Skip, Close) does what it says.
          e.preventDefault();
          if (!disabled) onTake();
        } else if ((e.key === "s" || e.key === "S") && !e.metaKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault();
          onSkip();
        }
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="mono"
          style={{ fontSize: 11, fontWeight: 700, padding: "1px 6px", borderRadius: 6, background: "var(--honey-deep)", color: "#fff" }}
        >
          ?
        </span>
        <span style={{ fontSize: 14, fontWeight: 800 }}>{what}</span>
        <span className="mono" style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--ink-soft)", whiteSpace: "nowrap" }}>
          {left} to check
        </span>
        <button className="btn btn-quiet btn-sm" style={{ padding: 5 }} onClick={onClose} aria-label="Close (Esc)">
          <XIcon width={15} height={15} />
        </button>
      </div>
      {why.length > 0 && (
        <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginTop: 6 }}>{why.join("; ")}</p>
      )}
      <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: 10 }}>
        <button className="btn btn-primary btn-sm" disabled={disabled} onClick={onTake}>
          {choice.joins ? <PlusIcon width={15} height={15} /> : <CheckIcon width={15} height={15} />} {choice.label}
          <kbd className="mono" style={{ fontSize: 10.5, opacity: 0.8, marginLeft: 4 }}>
            Enter
          </kbd>
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onSkip}>
          Skip
          <kbd className="mono" style={{ fontSize: 10.5, opacity: 0.7, marginLeft: 4 }}>
            S
          </kbd>
        </button>
      </div>
    </div>
  );
}
