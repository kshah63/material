"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { listFileQuestions, readAllRows, type BankBox, type BankQuestion } from "@/lib/queries";
import { bankOf } from "@/lib/worksheet/crops";
import { bankPath } from "@/lib/worksheet/layout";

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

/** Admin, or in_charge of the course: who may download (getViewUrl's rule). */
async function canDownloadIn(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  courseId: string,
): Promise<boolean> {
  const { data: profile } = await supabase.from("profiles").select("app_role").eq("id", userId).single();
  if (profile?.app_role === "admin") return true;
  const { data: membership } = await supabase
    .from("course_memberships")
    .select("role")
    .eq("course_id", courseId)
    .eq("user_id", userId)
    .maybeSingle();
  return membership?.role === "in_charge";
}

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

  // Every page view and Questions page, by their route patterns, rather than a
  // path the caller names. Nothing is cached on the server, but in a Server
  // Function this also has the browser fetch the pages it visited before afresh
  // when they are opened again (Next's revalidatePath docs), so none shows this
  // bank as it was.
  revalidatePath("/courses/[courseId]/questions/[fileId]", "page");
  revalidatePath("/courses/[courseId]/questions", "page");
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

// --- the worksheet modal's one read (§4.4) --------------------------------------

/** A picked question as the worksheet modal draws it, its boxes in print order (box_no). */
export interface PickedQuestion {
  id: string;
  file_id: string;
  topic_id: string | null;
  boxes: BankBox[];
}

/** A bank the picks need: its label (folder path and name) for bank order, and a 60-second URL. */
export interface PickedBank {
  id: string;
  name: string;
  label: string;
  size_bytes: number | null;
  url: string;
}

/** `retry`: whether Try again can help, which it cannot for too many picks or a crafted call. */
export type PrepareResult =
  | { ok: true; questions: PickedQuestion[]; banks: PickedBank[]; missing: string[] }
  | { ok: false; error: string; retry: boolean };

/** One worksheet's picks at most: more would not fit the read's request line. */
const MAX_PICKS = 200;
// A pick as the app writes one: a question id as the database spells it.
const PICK = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * The picks the modal draws (§4.4), in one call: the picked questions of this
 * course with their banks' files rows, and their boxes, read under the caller's
 * session, and every bank they need signed in one createSignedUrls call. The
 * files rows come from that read, under RLS, which is getViewUrl's rule. A pick
 * that is gone (deleted, left with no box, its bank in Trash), of another
 * course, or not a question id at all (a tab's storage edited by hand) comes
 * back in `missing`, so the modal removes it. The boxes are a flat read of
 * their own, as the page view's are (§3.5): a project's max rows caps an
 * embedded list too, and a question cut short would print short with nothing
 * said. Both reads go a range at a time, for the same reason.
 */
export async function preparePicks(courseId: string, ids: string[]): Promise<PrepareResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You're signed out. Reload the page to sign in again.", retry: false };
  if (typeof courseId !== "string" || !UUID.test(courseId)) return { ok: false, error: "Bad course.", retry: false };
  // A worksheet is a download, and downloads are for admins and the course's
  // in_charge only, as in getViewUrl (the owner, 2026-10-18).
  if (!(await canDownloadIn(supabase, user.id, courseId))) {
    return { ok: false, error: "Only in-charges and admins can make worksheets.", retry: false };
  }
  // The tab's picks are strings (usePicks keeps only those); anything else is a crafted call.
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
    return { ok: false, error: "Bad picks.", retry: false };
  }
  const all = Array.from(new Set(ids));
  const wanted = all.filter((id) => PICK.test(id));
  const bad = all.filter((id) => !PICK.test(id));
  if (wanted.length > MAX_PICKS) {
    return {
      ok: false,
      error: `A worksheet takes ${MAX_PICKS} questions at most, and ${wanted.length} are picked. Un-pick some on their banks' pages, or clear the picks with × and pick again.`,
      retry: false,
    };
  }
  if (!wanted.length) return { ok: true, questions: [], banks: [], missing: bad };

  type Row = {
    id: string;
    file_id: string;
    topic_id: string | null;
    files: { name: string; folder_id: string | null; storage_path: string; size_bytes: number | null };
  };
  let rows: Row[];
  let picked: BankQuestion[];
  let folders: { id: string; parent_id: string | null; name: string }[];
  try {
    const [read, boxes, f] = await Promise.all([
      readAllRows<Row>((from, to, count) =>
        supabase
          .from("questions")
          .select(
            "id, file_id, topic_id, files!inner(name, folder_id, storage_path, size_bytes, course_id)",
            count ? { count: "exact" } : undefined,
          )
          .in("id", wanted)
          .eq("files.course_id", courseId)
          .order("id", { ascending: true })
          .range(from, to)
          // Without generated types the embed of a many-to-one reads as a list.
          .overrideTypes<Row[], { merge: false }>(),
      ),
      readAllRows<BankBox & { question_id: string }>((from, to, count) =>
        supabase
          .from("question_boxes")
          .select("id, question_id, box_no, page, x0, y0, x1, y1, pos", count ? { count: "exact" } : undefined)
          .in("question_id", wanted)
          .order("id", { ascending: true })
          .range(from, to),
      ),
      supabase.from("folders").select("id, parent_id, name").eq("course_id", courseId).is("deleted_at", null),
    ]);
    if (f.error) throw new Error(f.error.message);
    // The page view's reader: boxes in box_no order, and a question with no box
    // dropped like a missing one, since the readers never rely on save_crops
    // having kept every question's boxes (§3.2).
    picked = bankOf(read, boxes);
    const kept = new Set(picked.map((q) => q.id));
    rows = read.filter((r) => kept.has(r.id));
    folders = f.data ?? [];
  } catch (err) {
    console.error(`preparePicks in ${courseId}: ${(err as Error).message}`);
    return { ok: false, error: "The picks could not be read. Try again.", retry: true };
  }

  const fileOf = new Map(rows.map((r) => [r.id, r.file_id]));
  const missing = [...bad, ...wanted.filter((id) => !fileOf.has(id))];
  const files = new Map(rows.map((r) => [r.file_id, r.files]));
  // Every pick gone: nothing to sign, and Storage refuses an empty list.
  if (!files.size) return { ok: true, questions: [], banks: [], missing };
  const signed = await signBanks(Array.from(files.values(), (f) => f.storage_path));
  if (!signed) return { ok: false, error: "The banks could not be signed for download. Try again.", retry: true };

  const banks: PickedBank[] = [];
  for (const [id, f] of files) {
    const url = signed.get(f.storage_path);
    if (!url) return { ok: false, error: `${f.name} could not be signed for download. Try again.`, retry: true };
    banks.push({ id, name: f.name, label: bankPath(f.name, f.folder_id, folders), size_bytes: f.size_bytes, url });
  }
  return {
    ok: true,
    questions: picked.map((q) => ({ id: q.id, file_id: fileOf.get(q.id)!, topic_id: q.topic_id, boxes: q.boxes })),
    banks,
    missing,
  };
}

/** Signed 60-second URLs, by storage path, for files the caller's session just read. */
async function signBanks(paths: string[]): Promise<Map<string, string> | null> {
  const { data, error } = await createServiceClient()
    .storage.from("course-materials")
    .createSignedUrls(paths, 60);
  if (error || !data) return null;
  return new Map(data.flatMap((d) => (d.path && d.signedUrl && !d.error ? [[d.path, d.signedUrl] as const] : [])));
}
