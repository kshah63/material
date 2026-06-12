"use client";

import { useState } from "react";
import { SCHOOLS, SCHOOL_SET } from "@/lib/options";

/**
 * School picker: a dropdown of the known schools plus an "Other / not listed"
 * choice that swaps in a free-text box, so the common case stays clean (exact
 * values that bulk "add all from school" can match) without blocking anyone.
 */
export function SchoolSelect({
  id,
  value,
  onChange,
  required,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  // Start in free-text mode if a value was given that isn't a known school.
  const [other, setOther] = useState(() => Boolean(value) && !SCHOOL_SET.has(value));

  if (other) {
    return (
      <div className="flex gap-2">
        <input
          id={id}
          className="field"
          placeholder="Type your school"
          value={value}
          required={required}
          autoFocus
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          className="btn btn-quiet btn-sm shrink-0"
          onClick={() => {
            setOther(false);
            onChange("");
          }}
        >
          Pick from list
        </button>
      </div>
    );
  }

  return (
    <select
      id={id}
      className="field"
      required={required}
      value={SCHOOL_SET.has(value) ? value : ""}
      onChange={(e) => {
        if (e.target.value === "__other__") {
          setOther(true);
          onChange("");
        } else {
          onChange(e.target.value);
        }
      }}
    >
      <option value="">Select your school…</option>
      {SCHOOLS.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
      <option value="__other__">Other / not listed…</option>
    </select>
  );
}
