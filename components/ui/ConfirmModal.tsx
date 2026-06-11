"use client";

import { useState } from "react";
import { Modal } from "./Modal";

export function ConfirmModal({
  open,
  onClose,
  title,
  body,
  cta = "Delete",
  danger = true,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  body: React.ReactNode;
  cta?: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} onClose={onClose} title={title} width={420}>
      <div style={{ fontSize: 14.5, color: "var(--ink-soft)", lineHeight: 1.5 }}>{body}</div>
      <div className="flex justify-end gap-2 mt-5">
        <button className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          className={danger ? "btn btn-danger" : "btn btn-primary"}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await onConfirm();
            setBusy(false);
            onClose();
          }}
        >
          {cta}
        </button>
      </div>
    </Modal>
  );
}
