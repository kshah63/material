"use client";

import { useEffect, type ReactNode } from "react";
import { XIcon } from "@/components/icons";

export function Modal({
  open,
  onClose,
  title,
  children,
  width = 460,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(51,39,27,0.42)", backdropFilter: "blur(2px)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="card pop w-full"
        style={{ maxWidth: width, boxShadow: "var(--shadow-pop)" }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div
          className="flex items-center justify-between"
          style={{ padding: "16px 18px", borderBottom: "1px solid var(--line)" }}
        >
          <h3 style={{ fontSize: 18 }}>{title}</h3>
          <button className="btn btn-quiet" style={{ padding: 6 }} onClick={onClose} aria-label="Close">
            <XIcon />
          </button>
        </div>
        <div style={{ padding: 18 }}>{children}</div>
      </div>
    </div>
  );
}
