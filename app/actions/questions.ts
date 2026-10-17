"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { listFileQuestions, type BankQuestion } from "@/lib/queries";

// The crop screen's one write (docs/WORKSHEETS.md §3.4, §4.3): every change to
// one bank since its last save, in one save_crops call, which is one transaction
// run as the caller. RLS, the column grants and save_crops's own checks decide
// who may do what; nothing here repeats them in TypeScript.

/**
 * A box in a save. A new box has its page, corners and pos. A kept box has its
 * id, plus corners and pos only when they changed; it never changes page (§3.2).
 */
export interface SaveBox {
  id?: string;
  page?: number;
  x0?: number;
  y0?: number;
  x1?: number;
  y1?: number;
  pos?: number;
}

/** A new question: its id made by the screen (crypto.randomUUID()), box 1 first. */
export interface SaveAdd {
  id: string;
  topic_id: string | null;
  boxes: SaveBox[];
}

/**
 * A saved question's whole new box list, in print order. topic_id is sent only
 * when the question's topic changed (null clears it), so a save never undoes a
 * topic somebody else set meanwhile. {id, boxes: []} with every box in remove
 * deletes the question.
 */
export interface SaveEdit {
  id: string;
  topic_id?: string | null;
  boxes: SaveBox[];
}

export interface SaveChanges {
  add: SaveAdd[];
  edit: SaveEdit[];
  remove: string[]; // saved box ids
}

/**
 * What the screen does with a refused save, by SQLSTATE (§3.4, §4.3). Nothing
 * was written in any of them.
 * - reload: changed elsewhere, or not the caller's to change (42501), or a new
 *   question's id already used, which is a retried save that had committed
 *   (23505). Trying again cannot work: the screen offers Reload page.
 * - retry: a deadlock with another save of this bank (40P01), or anything else
 *   that may pass a second time. The screen offers Try again.
 * - invalid: a value the database refused (SQLSTATE class 22 or 23), which the
 *   screen should never send and which no second try can pass. The drafts stay.
 * Of the database's own words, only save_crops's refusals of a value reach the
 * screen: any other message names tables and constraints, so the screen gets a
 * fixed sentence and the server's log gets the message.
 */
export type SaveFailure = {
  ok: false;
  kind: "reload" | "retry" | "invalid";
  code: string | null;
  error: string;
};

export type SaveResult = { ok: true; questions: BankQuestion[] } | SaveFailure;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// save_crops's own refusals of a value (supabase/migrations/20261017000009_questions.sql).
const OWN_MESSAGES = new Set([
  "A saved box keeps its page: remove it and add it again.",
  "A question needs at least one box.",
]);
const BOX_FIELDS = ["page", "x0", "y0", "x1", "y1", "pos"] as const;

function invalid(error: string): SaveFailure {
  return { ok: false, kind: "invalid", code: null, error };
}

/**
 * The call's JSON, rebuilt from the known keys only. A Server Function is a
 * public endpoint, so its input is checked here before it reaches the database:
 * a NaN corner would otherwise travel as null, which save_crops reads as "keep
 * this corner" and the box would silently not move.
 */
function boxJson(b: SaveBox): Record<string, unknown> | string {
  if (typeof b !== "object" || b === null) return "a box is not an object";
  const out: Record<string, unknown> = {};
  if (b.id !== undefined) {
    if (typeof b.id !== "string" || !UUID.test(b.id)) return "a box id is not a uuid";
    out.id = b.id;
  }
  for (const k of BOX_FIELDS) {
    const v = b[k];
    if (v === undefined) continue;
    if (typeof v !== "number" || !Number.isFinite(v)) return `a box's ${k} is not a number`;
    out[k] = v;
  }
  return out;
}

function questionJson(
  q: SaveAdd | SaveEdit,
  topicSent: boolean,
): Record<string, unknown> | string {
  if (typeof q !== "object" || q === null) return "a question is not an object";
  if (typeof q.id !== "string" || !UUID.test(q.id)) return "a question id is not a uuid";
  if (!Array.isArray(q.boxes)) return "a question has no box list";
  const out: Record<string, unknown> = { id: q.id };
  if (topicSent) {
    const t = q.topic_id;
    if (t !== null && (typeof t !== "string" || !UUID.test(t))) return "a topic id is not a uuid";
    out.topic_id = t;
  }
  const boxes = [];
  for (const b of q.boxes) {
    const json = boxJson(b);
    if (typeof json === "string") return json;
    boxes.push(json);
  }
  out.boxes = boxes;
  return out;
}

export async function savePage(fileId: string, changes: SaveChanges): Promise<SaveResult> {
  // A Server Function is reachable by a direct POST, so it checks the caller
  // itself; what they may change is then the database's answer (RLS).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, kind: "reload", code: null, error: "You're signed out. Reload the page to sign in again." };
  }

  if (typeof fileId !== "string" || !UUID.test(fileId)) return invalid("Not saved: bad file.");
  const { add, edit, remove } = changes ?? {};
  if (!Array.isArray(add) || !Array.isArray(edit) || !Array.isArray(remove)) {
    return invalid("Not saved: the changes are not lists.");
  }

  const addJson = [];
  for (const q of add) {
    const json = questionJson(q, true);
    if (typeof json === "string") return invalid(`Not saved: ${json}.`);
    addJson.push(json);
  }
  const editJson = [];
  for (const q of edit) {
    // The key's presence is the message: only a changed topic is sent.
    const json = questionJson(q, typeof q === "object" && q !== null && Object.hasOwn(q, "topic_id"));
    if (typeof json === "string") return invalid(`Not saved: ${json}.`);
    editJson.push(json);
  }
  for (const id of remove) {
    if (typeof id !== "string" || !UUID.test(id)) return invalid("Not saved: a removed box id is not a uuid.");
  }

  // Nothing to save is only the read-back, which RLS limits as it limits any read.
  if (!addJson.length && !editJson.length && !remove.length) return readBack(fileId);

  const { error } = await supabase.rpc("save_crops", {
    _file_id: fileId,
    _add: addJson,
    _edit: editJson,
    _remove: remove,
  });
  if (error) {
    const code = error.code || null;
    if (code === "42501" || code === "23505") {
      return { ok: false, kind: "reload", code, error: "Changed elsewhere, or you can't change it." };
    }
    if (code === "23514" && OWN_MESSAGES.has(error.message)) {
      return { ok: false, kind: "invalid", code, error: error.message };
    }
    console.error(`save_crops on ${fileId}: ${code} ${error.message}`);
    if (code?.startsWith("22") || code?.startsWith("23")) {
      return { ok: false, kind: "invalid", code, error: `The database refused a value on this page (${code}).` };
    }
    // A deadlock with another save of this bank (40P01) wrote nothing, and nor
    // did anything else that failed: trying again is safe.
    return { ok: false, kind: "retry", code, error: "Not saved. Try again." };
  }

  // Every page view, by its route pattern, rather than a path the caller names.
  // Nothing is cached on the server, but in a Server Function this also has the
  // browser fetch the pages it visited before afresh when they are opened again
  // (Next's revalidatePath docs), so none shows this bank as it was.
  revalidatePath("/courses/[courseId]/questions/[fileId]", "page");
  return readBack(fileId);
}

async function readBack(fileId: string): Promise<SaveResult> {
  try {
    return { ok: true, questions: await listFileQuestions(fileId) };
  } catch {
    // Saved, but not read back: what is saved shows after a reload.
    return {
      ok: false,
      kind: "reload",
      code: null,
      error: "Saved, but the page could not be read back. Reload page to see it.",
    };
  }
}
