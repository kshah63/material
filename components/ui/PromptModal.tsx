"use client";

import { useState } from "react";
import { Modal } from "./Modal";

/**
 * Single-field prompt. Callers give it a `key` tied to what's being edited so it
 * remounts (and re-seeds `initial`) each time it opens — no effect needed.
 */
export function PromptModal({
  open,
  onClose,
  title,
  label,
  initial = "",
  cta = "Save",
  placeholder,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  label: string;
  initial?: string;
  cta?: string;
  placeholder?: string;
  onSubmit: (value: string) => void | Promise<void>;
}) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);

  return (
    <Modal open={open} onClose={onClose} title={title} width={420}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!value.trim()) return;
          setBusy(true);
          await onSubmit(value.trim());
          setBusy(false);
          onClose();
        }}
      >
        <label className="label">{label}</label>
        <input
          autoFocus
          className="field"
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
        />
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !value.trim()}>
            {cta}
          </button>
        </div>
      </form>
    </Modal>
  );
}
