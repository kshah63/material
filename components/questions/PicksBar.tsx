"use client";

import { XIcon } from "@/components/icons";

/**
 * The picks bar (docs/WORKSHEETS.md §4.4), on the Questions page and the page
 * view while there are picks: "{n} picked · Make worksheet · ×".
 */
export function PicksBar({
  count,
  onMake,
  onClear,
}: {
  count: number;
  onMake: () => void;
  onClear: () => void;
}) {
  if (count === 0) return null;
  return (
    <div
      className="fixed left-1/2 z-40 card pop flex items-center gap-2"
      style={{
        bottom: 24,
        transform: "translateX(-50%)",
        padding: "8px 8px 8px 16px",
        boxShadow: "var(--shadow-pop)",
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 800, whiteSpace: "nowrap" }}>{count} picked</span>
      <span style={{ width: 1, height: 22, background: "var(--line)", margin: "0 4px" }} />
      <button className="btn btn-primary btn-sm" style={{ whiteSpace: "nowrap" }} onClick={onMake}>
        Make worksheet
      </button>
      <button className="btn btn-quiet btn-sm" onClick={onClear} aria-label="Clear picks">
        <XIcon width={16} height={16} />
      </button>
    </div>
  );
}
