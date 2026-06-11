"use client";

import { useEffect, useState } from "react";
import { getViewUrl } from "@/app/actions/files";
import {
  DownloadIcon,
  SpinnerIcon,
  XIcon,
} from "@/components/icons";
import type { FileRow } from "@/lib/types";

export function Viewer({
  file,
  onClose,
}: {
  file: FileRow;
  onClose: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // The component is keyed by file id (it remounts per file), so state starts
    // fresh — the effect only needs to fetch, never reset synchronously.
    let cancelled = false;
    getViewUrl(file.id).then((res) => {
      if (cancelled) return;
      if (res.ok) setUrl(res.url);
      else setError(res.error);
    });
    return () => {
      cancelled = true;
    };
  }, [file.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: "rgba(40,30,20,0.78)", backdropFilter: "blur(3px)" }}
    >
      <header
        className="flex items-center justify-between gap-3"
        style={{ padding: "12px 18px" }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="truncate" style={{ color: "#fff", fontSize: 15, fontWeight: 800 }}>
            {file.name}
          </span>
          {file.eff_teacher_only && (
            <span className="marker-tag" style={{ background: "transparent" }}>
              Teacher-only
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {url && (
            <a
              href={url}
              download={file.name}
              className="btn btn-ghost btn-sm"
              target="_blank"
              rel="noreferrer"
            >
              <DownloadIcon width={16} height={16} /> Download
            </a>
          )}
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close viewer">
            <XIcon />
          </button>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center p-3 pt-0 min-h-0">
        {error ? (
          <div className="card text-center" style={{ padding: 32, maxWidth: 400 }}>
            <h3 style={{ fontSize: 18 }}>Can&apos;t open this file</h3>
            <p style={{ color: "var(--ink-soft)", marginTop: 8 }}>{error}</p>
          </div>
        ) : !url ? (
          <div className="flex flex-col items-center gap-3" style={{ color: "#fff" }}>
            <SpinnerIcon width={28} height={28} />
            <p style={{ fontSize: 14, fontWeight: 700 }}>Preparing a secure preview…</p>
          </div>
        ) : (
          <iframe
            src={url}
            title={file.name}
            className="w-full h-full rounded-[12px]"
            style={{ background: "#fff", border: "none", maxWidth: 1100 }}
          />
        )}
      </div>
    </div>
  );
}
