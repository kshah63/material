"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

// A teacher's picks (docs/WORKSHEETS.md §2.2, §4.4): question ids in this tab's
// sessionStorage, under one key per course for each person signed in. They
// survive a reload and a visit to the Viewer, and go when the tab closes. The
// key names the person too because signing out keeps the tab: on a centre's
// shared computer the next teacher would otherwise find somebody else's picks.
// Every read and write is inside try, so storage that is blocked only means
// picks do not survive a reload: they are kept in memory for the tab meanwhile.

const keyFor = (userId: string, courseId: string) => `worksheet-picks:${userId}:${courseId}`;
const CHANGED = "worksheet-picks";
const memory = new Map<string, string>();

function readRaw(userId: string, courseId: string): string {
  const key = keyFor(userId, courseId);
  try {
    return sessionStorage.getItem(key) ?? memory.get(key) ?? "[]";
  } catch {
    return memory.get(key) ?? "[]";
  }
}

function parse(raw: string): string[] {
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** This person's picks for the course, in the order they were picked. */
export function readPicks(userId: string, courseId: string): string[] {
  return parse(readRaw(userId, courseId));
}

export function writePicks(userId: string, courseId: string, ids: string[]) {
  const key = keyFor(userId, courseId);
  const raw = JSON.stringify(Array.from(new Set(ids)));
  memory.set(key, raw);
  try {
    sessionStorage.setItem(key, raw);
  } catch {
    // Blocked storage: the in-memory copy serves this tab until it reloads.
  }
  window.dispatchEvent(new Event(CHANGED));
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange);
  return () => window.removeEventListener(CHANGED, onChange);
}

/** This person's picks for the course, shared by every screen of the tab that shows them. */
export function usePicks(userId: string, courseId: string) {
  const raw = useSyncExternalStore(
    subscribe,
    () => readRaw(userId, courseId),
    () => "[]",
  );
  const picks = useMemo(() => parse(raw), [raw]);
  const toggle = useCallback(
    (id: string) =>
      writePicks(userId, courseId, picks.includes(id) ? picks.filter((x) => x !== id) : [...picks, id]),
    [userId, courseId, picks],
  );
  const clear = useCallback(() => writePicks(userId, courseId, []), [userId, courseId]);
  return { picks, toggle, clear };
}
