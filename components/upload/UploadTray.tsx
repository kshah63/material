"use client";

import { useMemo, useState } from "react";
import { formatBytes } from "@/lib/format";
import {
  CheckIcon,
  ChevronDownIcon,
  PdfIcon,
  SpinnerIcon,
  XIcon,
} from "@/components/icons";
import type { UploadItem } from "@/hooks/useUploader";

export function UploadTray({
  items,
  active,
  onCancel,
  onDismiss,
}: {
  items: UploadItem[];
  active: boolean;
  onCancel: () => void;
  onDismiss: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  const agg = useMemo(() => {
    const total = items.length;
    const done = items.filter((i) => i.status === "done").length;
    const failed = items.filter((i) => i.status === "error").length;
    const canceled = items.filter((i) => i.status === "canceled").length;
    const bytesTotal = items.reduce((s, i) => s + i.size, 0);
    const bytesSent = items.reduce(
      (s, i) => s + (i.status === "done" ? i.size : i.sent),
      0,
    );
    return { total, done, failed, canceled, bytesTotal, bytesSent };
  }, [items]);

  if (items.length === 0) return null;
  const pct = agg.bytesTotal ? Math.round((agg.bytesSent / agg.bytesTotal) * 100) : 0;

  return (
    <div
      className="fixed z-40 card pop"
      style={{
        right: 20,
        bottom: 20,
        width: 360,
        maxWidth: "calc(100vw - 40px)",
        boxShadow: "var(--shadow-pop)",
        overflow: "hidden",
      }}
    >
      {/* header */}
      <div
        className="flex items-center justify-between"
        style={{ padding: "12px 14px", borderBottom: collapsed ? "none" : "1px solid var(--line)" }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {active ? (
            <SpinnerIcon style={{ color: "var(--berry)" }} />
          ) : agg.failed > 0 ? (
            <span style={{ color: "var(--berry-deep)", fontWeight: 800 }}>!</span>
          ) : (
            <span
              className="grid place-items-center rounded-full"
              style={{ width: 20, height: 20, background: "var(--leaf)", color: "#fff" }}
            >
              <CheckIcon width={13} height={13} />
            </span>
          )}
          <div className="min-w-0">
            <p style={{ fontSize: 14, fontWeight: 800 }}>
              {active
                ? `Uploading ${agg.done}/${agg.total}`
                : agg.failed > 0
                  ? `${agg.done} done · ${agg.failed} failed`
                  : agg.canceled > 0
                    ? `${agg.done} done · ${agg.canceled} canceled`
                    : `Uploaded ${agg.done} file${agg.done === 1 ? "" : "s"}`}
            </p>
            <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>
              {formatBytes(agg.bytesSent)} / {formatBytes(agg.bytesTotal)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {active && (
            <button
              className="btn btn-quiet btn-sm"
              style={{ color: "var(--berry-deep)" }}
              onClick={onCancel}
            >
              Cancel
            </button>
          )}
          <button
            className="btn btn-quiet"
            style={{ padding: 5 }}
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand" : "Collapse"}
          >
            <ChevronDownIcon
              style={{ transform: collapsed ? "rotate(180deg)" : "none", transition: "transform .15s" }}
            />
          </button>
          {!active && (
            <button className="btn btn-quiet" style={{ padding: 5 }} onClick={onDismiss} aria-label="Dismiss">
              <XIcon />
            </button>
          )}
        </div>
      </div>

      {/* aggregate bar */}
      {active && (
        <div style={{ height: 3, background: "var(--paper-2)" }}>
          <div
            style={{
              height: "100%",
              width: `${pct}%`,
              background: "linear-gradient(90deg, var(--berry), var(--honey))",
              transition: "width .25s ease",
            }}
          />
        </div>
      )}

      {/* per-file list */}
      {!collapsed && (
        <div className="scroll-soft" style={{ maxHeight: 280, overflowY: "auto", padding: 8 }}>
          {items.map((item) => (
            <div key={item.key} className="flex items-center gap-2.5" style={{ padding: "7px 6px" }}>
              <PdfIcon
                width={18}
                height={18}
                style={{ color: "var(--berry)", flexShrink: 0 }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate" style={{ fontSize: 13, fontWeight: 700 }}>
                    {item.relativeDir ? `${item.relativeDir}/` : ""}
                    {item.name}
                  </span>
                  <span
                    className="mono shrink-0"
                    style={{
                      fontSize: 10.5,
                      color:
                        item.status === "error"
                          ? "var(--berry-deep)"
                          : item.status === "done"
                            ? "var(--leaf)"
                            : "var(--ink-soft)",
                    }}
                  >
                    {item.status === "done"
                      ? "done"
                      : item.status === "error"
                        ? "failed"
                        : item.status === "canceled"
                          ? "canceled"
                          : item.status === "uploading"
                            ? `${item.size ? Math.round((item.sent / item.size) * 100) : 0}%`
                            : "queued"}
                  </span>
                </div>
                <div style={{ height: 3, marginTop: 4, background: "var(--paper-2)", borderRadius: 999 }}>
                  <div
                    style={{
                      height: "100%",
                      borderRadius: 999,
                      width: `${item.status === "done" ? 100 : item.size ? (item.sent / item.size) * 100 : 0}%`,
                      background:
                        item.status === "error" ? "var(--berry)" : "var(--leaf)",
                      transition: "width .2s ease",
                    }}
                  />
                </div>
                {item.status === "error" && item.error && (
                  <p style={{ fontSize: 11, color: "var(--berry-deep)", marginTop: 2 }}>
                    {item.error}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
