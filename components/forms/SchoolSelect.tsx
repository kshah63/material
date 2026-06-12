"use client";

import { useState } from "react";
import { SCHOOLS, SCHOOL_SET } from "@/lib/options";

/**
 * School picker:
 *  - a dropdown of the known (Singapore) schools, plus
 *  - "Other (Singapore)" → free-text school, and
 *  - "Global (Outside SG)" → country + free-text school.
 * Known schools stay exact (so bulk "add all from school" matches), while the
 * free-text paths mean no student is ever blocked from registering.
 */
const OTHER = "__other__";
const GLOBAL = "__global__";

export function SchoolSelect({
  id,
  value,
  onChange,
  country = "",
  onCountryChange,
  required,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  country?: string;
  onCountryChange?: (v: string) => void;
  required?: boolean;
}) {
  const [mode, setMode] = useState<string>(() => {
    if (country) return GLOBAL; // had a country -> outside SG
    if (value && !SCHOOL_SET.has(value)) return OTHER;
    return "list";
  });

  const backToList = () => {
    setMode("list");
    onChange("");
    onCountryChange?.("");
  };

  if (mode === GLOBAL) {
    return (
      <div className="flex flex-col gap-2">
        <input
          className="field"
          placeholder="Country"
          value={country}
          required={required}
          onChange={(e) => onCountryChange?.(e.target.value)}
        />
        <div className="flex gap-2">
          <input
            id={id}
            className="field"
            placeholder="School"
            value={value}
            required={required}
            onChange={(e) => onChange(e.target.value)}
          />
          <button type="button" className="btn btn-quiet btn-sm shrink-0" onClick={backToList}>
            Pick from list
          </button>
        </div>
      </div>
    );
  }

  if (mode === OTHER) {
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
        <button type="button" className="btn btn-quiet btn-sm shrink-0" onClick={backToList}>
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
        const v = e.target.value;
        if (v === OTHER) {
          setMode(OTHER);
          onChange("");
          onCountryChange?.("");
        } else if (v === GLOBAL) {
          setMode(GLOBAL);
          onChange("");
        } else {
          onChange(v);
          onCountryChange?.("");
        }
      }}
    >
      <option value="">Select your school…</option>
      {SCHOOLS.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
      <option value={OTHER}>Other (Singapore) / not listed…</option>
      <option value={GLOBAL}>Global (Outside SG)</option>
    </select>
  );
}
