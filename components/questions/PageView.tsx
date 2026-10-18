"use client";

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  PDFDocumentProxy,
  PageViewport,
  RenderTask,
} from "pdfjs-dist/legacy/build/pdf.mjs";
import { getViewUrl } from "@/app/actions/files";
import { savePage, type SaveFailure, type SaveResult } from "@/app/actions/questions";
import {
  ArrowLeftIcon,
  CheckIcon,
  ChevronRightIcon,
  PlusIcon,
  SpinnerIcon,
  TrashIcon,
} from "@/components/icons";
import { usePicks } from "@/hooks/usePicks";
import { formatBytes } from "@/lib/format";
import {
  BankError,
  closeBank,
  imagesFailed,
  isCancelled,
  openBank,
  pageBox,
  renderRegion,
  suggestionsFor,
  toPdfBox,
  toViewRect,
  type PageSuggestions,
  type ViewRect,
} from "@/lib/worksheet/source";
import type { PageKind } from "@/lib/worksheet/propose";
import {
  MAX_BOXES,
  addBox,
  addQuestion,
  canAddBox,
  canPutAbove,
  deleteQuestion,
  diff,
  draftRects,
  duplicates,
  fromBank,
  isEmpty,
  isStimulus,
  makeStimulus,
  moveRect,
  putAbove,
  rebase,
  removeRect,
  setTopic,
  uncropped,
  unsaved,
  usersOf,
  type Crops,
  type PageGeometry,
} from "@/lib/worksheet/crops";
import type { BankQuestion } from "@/lib/queries";
import type { FileRow, QuestionTopic } from "@/lib/types";
import { PicksBar } from "./PicksBar";
import { Stage, type StageItem } from "./Stage";
import { WorksheetModal } from "./WorksheetModal";

// The page is drawn at the column's width in device pixels, up to the 2,048 px
// §8.1 measured (20–86 ms for a digital page, about 0.5 s for a scan), and never
// past iOS Safari's canvas area, beyond which a canvas silently draws nothing.
const MAX_CANVAS_WIDTH = 2048;
const MAX_CANVAS_AREA = 16_000_000;
const COLUMN_MAX = 1100; // the Viewer's width
const BIG_BANK = 10 * 1024 * 1024;

export interface PageViewProps {
  /** Whose picks these are: they are kept per person, as well as per course. */
  userId: string;
  courseId: string;
  /** The course's name and code: the back link's label and the worksheet's file name (§6.5). */
  course: { name: string; code: string | null };
  file: Pick<FileRow, "id" | "name" | "size_bytes" | "eff_teacher_only">;
  questions: BankQuestion[];
  topics: QuestionTopic[];
  /** can_crop_file's answer: crop for a manager it allows, pick for everyone else. */
  mode: "crop" | "pick";
  /** in_charge or admin: sees every page and the crop-once hints. */
  manager: boolean;
  initialPage: number | null;
  /** A topic to open with, from the Questions page's topic filter. */
  initialTopic: string | null;
}

type PdfState =
  | { status: "loading" }
  | { status: "error"; message: string; retry: boolean }
  | { status: "ready"; doc: PDFDocumentProxy };

const geometryOf = (viewports: Map<number, PageViewport>) =>
  new Map<number, PageGeometry>(
    Array.from(viewports, ([p, vp]) => [p, { width: vp.width, view: (b) => toViewRect(vp, b) }]),
  );

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

// The kind of page (§5.1), as the in-charge's toolbar names it.
const KIND: Record<PageKind, string> = {
  digital: "Digital page",
  scanned: "Scanned page",
  none: "No text layer",
};

/**
 * The page view (docs/WORKSHEETS.md §4.3). In crop mode an in-charge draws,
 * moves, resizes and deletes boxes, builds questions of up to four boxes and
 * puts a stimulus above several of them; the screen saves the bank, in one
 * save_crops call, whenever they leave a page. Everyone else picks: a click on
 * a question's own box picks it for a worksheet.
 */
export function PageView(props: PageViewProps) {
  const { userId, courseId, course, file, questions, topics, mode, manager, initialPage, initialTopic } = props;
  const router = useRouter();
  const cropping = mode === "crop";
  const { picks, toggle: togglePick, clear: clearPicks } = usePicks(userId, courseId);
  const [making, setMaking] = useState(false); // the worksheet modal is open

  // --- what is saved, and the screen on top of it --------------------------------
  const [saved, setSaved] = useState<BankQuestion[]>(questions);
  const [crops, setCrops] = useState<Crops>(() => fromBank(questions));
  const [sel, setSel] = useState<string | null>(null); // the selected rectangle
  const [stim, setStim] = useState<string | null>(null); // the stimulus new questions go under
  const [adding, setAdding] = useState<string | null>(null); // the question Add a box adds to
  const [newTopic, setNewTopic] = useState(""); // "" is No topic
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<SaveFailure | null>(null);
  const [reloading, setReloading] = useState(false);
  const [, startTransition] = useTransition();

  // Reload page reads the route again; its bank replaces the screen, and what
  // was not saved is dropped. Any other new read leaves the screen alone.
  const [seen, setSeen] = useState(questions);
  if (seen !== questions) {
    setSeen(questions);
    if (reloading) {
      setReloading(false);
      setSaved(questions);
      setCrops(fromBank(questions));
      setSel(null);
      setStim(null);
      setAdding(null);
      setFailure(null);
    }
  }

  // A teacher sees only pages with crops, so a bank with none is not downloaded.
  const nothingCropped = !manager && saved.length === 0;

  // --- the bank -----------------------------------------------------------------
  const [pdf, setPdf] = useState<PdfState>({ status: "loading" });
  // Try again opens the bank afresh: a new download, into a new pdf.js worker.
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (nothingCropped) return;
    let cancelled = false;
    let release: (() => void) | null = null;
    openBank(file.id, file.size_bytes, async () => {
      const res = await getViewUrl(file.id);
      if (!res.ok) throw new BankError(res.error);
      return res.url;
    }).then(
      (opened) => {
        if (cancelled) return opened.release();
        release = opened.release;
        setPdf({ status: "ready", doc: opened.doc });
      },
      (err: unknown) => {
        if (cancelled) return;
        setPdf(
          err instanceof BankError
            ? { status: "error", message: err.message, retry: err.retry }
            : { status: "error", message: "The download failed. Try again.", retry: true },
        );
      },
    );
    return () => {
      cancelled = true;
      release?.();
    };
  }, [file.id, file.size_bytes, nothingCropped, attempt]);

  const doc = pdf.status === "ready" ? pdf.doc : null;
  const numPages = doc?.numPages ?? 0;

  // --- what is drawn ------------------------------------------------------------
  const users = useMemo(() => usersOf(crops), [crops]);
  const dupes = useMemo(() => duplicates(crops, users), [crops, users]);
  const drafts = useMemo(() => draftRects(saved, crops, users), [saved, crops, users]);
  const pending = useMemo(() => unsaved(saved, crops), [saved, crops]);
  const byId = useMemo(() => new Map(crops.questions.map((q) => [q.id, q])), [crops]);
  const savedIds = useMemo(() => new Set(saved.map((q) => q.id)), [saved]);
  const topicName = useMemo(() => new Map(topics.map((t) => [t.id, t.name])), [topics]);
  // The questions with a box on each page. A box on a page past the bank's last
  // page is ignored (only a crafted call saves one), and a question with no
  // other box is not counted.
  const onPage = useMemo(() => {
    const m = new Map<number, Set<string>>();
    for (const q of crops.questions) {
      for (const id of q.rects) {
        const p = crops.rects[id].page;
        if (p > numPages) continue;
        const set = m.get(p) ?? new Set<string>();
        set.add(q.id);
        m.set(p, set);
      }
    }
    return m;
  }, [crops, numPages]);

  // --- pages ----------------------------------------------------------------------
  const [topicId, setTopicId] = useState(initialTopic ?? ""); // "" is Any topic
  // Back to Questions with the topic in hand, so the next bank is found by it too.
  const backHref = `/courses/${courseId}/questions${topicId ? `?topic=${topicId}` : ""}`;
  // Managers see every page; teachers only pages with a box. A topic narrows
  // either list to pages with a question of that topic.
  const pagesFor = useCallback(
    (topic: string) => {
      const all = manager
        ? Array.from({ length: numPages }, (_, i) => i + 1)
        : Array.from(onPage.keys()).sort((a, b) => a - b);
      if (!topic) return all;
      return all.filter((p) =>
        Array.from(onPage.get(p) ?? []).some((id) => byId.get(id)?.topic_id === topic),
      );
    },
    [manager, numPages, onPage, byId],
  );
  const pages = useMemo(() => pagesFor(topicId), [pagesFor, topicId]);

  const [pageNo, setPageNo] = useState<number | null>(initialPage);
  const page = pageNo !== null && pages.includes(pageNo) ? pageNo : (pages[0] ?? null);
  const at = page === null ? -1 : pages.indexOf(page);

  // --- drawing the page ---------------------------------------------------------
  const scrollRef = useRef<HTMLDivElement>(null);
  const columnRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = columnRef.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let measured = false;
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width);
      clearTimeout(timer);
      // The first width is used at once; later ones wait for a resize to settle.
      if (!measured) {
        measured = true;
        setWidth(w);
      } else timer = setTimeout(() => setWidth(w), 150);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      clearTimeout(timer);
    };
  }, []);

  // The overlay follows the page last drawn, not the one asked for, so boxes
  // never sit over the previous page while the next one renders.
  const [shown, setShown] = useState<{ page: number; viewport: PageViewport } | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  // The page drawn last, if an image on it did not decode (§8.3).
  const [undrawn, setUndrawn] = useState<number | null>(null);
  // Every page drawn so far, as displayed, for the reading order of a save.
  const viewports = useRef(new Map<number, PageViewport>());

  useEffect(() => {
    if (!doc || page === null || width === 0) return;
    let cancelled = false;
    let task: RenderTask | null = null;
    // Drawn off screen and swapped in, so the old page stays up meanwhile.
    const canvas = document.createElement("canvas");
    (async () => {
      const p = await doc.getPage(page);
      if (cancelled) return;
      const vp = p.getViewport({ scale: 1 });
      const px = Math.min(MAX_CANVAS_WIDTH, Math.round(width * (window.devicePixelRatio || 1)));
      const scale = Math.min(px / vp.width, Math.sqrt(MAX_CANVAS_AREA / (vp.width * vp.height)));
      task = renderRegion(p, pageBox(p), scale, canvas);
      await task.promise;
      // Asked at once: cleaning the page up forgets its images.
      const failed = imagesFailed(p);
      const host = hostRef.current;
      if (cancelled || !host) return;
      canvas.style.cssText = "display:block;width:100%;height:100%";
      const old = host.firstElementChild;
      host.replaceChildren(canvas);
      // Safari is slow to free a canvas's memory unless it is shrunk first.
      if (old instanceof HTMLCanvasElement) old.width = old.height = 0;
      viewports.current.set(page, vp);
      setShown({ page, viewport: vp });
      setRenderError(null);
      setUndrawn(failed ? page : null);
    })().catch((err: unknown) => {
      if (cancelled || isCancelled(err)) return;
      setRenderError(`p. ${page} could not be drawn: ${(err as Error)?.message ?? String(err)}`);
    });
    return () => {
      cancelled = true;
      task?.cancel();
      if (!canvas.isConnected) canvas.width = canvas.height = 0;
    };
  }, [doc, page, width]);

  // Leaving a page frees what pdf.js decoded for it. Without this it keeps every
  // page for the life of the bank: 1.2 GB after 40 pages of a 300 ppi scan
  // (§4.5). pdf.js defers it until a render still running on the page stops.
  useEffect(() => {
    if (!doc || page === null) return;
    return () => {
      void doc
        .getPage(page)
        .then((p) => p.cleanup())
        .catch(() => {});
    };
  }, [doc, page]);

  // --- suggestions (§5.1) --------------------------------------------------------
  // In crop mode each page, once drawn, gets its text-layer suggestions. They
  // are never saved: accepting one makes it a drawn box, saved like any other.
  // A scanned page has none, and is drawn by hand (§5.3).
  const shownPage = shown?.page ?? null;
  const [suggested, setSuggested] = useState<
    { page: number; found: PageSuggestions } | { page: number; error: string } | null
  >(null);
  useEffect(() => {
    if (!cropping || !doc || shownPage === null) return;
    let cancelled = false;
    suggestionsFor(doc, shownPage).then(
      (found) => {
        if (!cancelled) setSuggested({ page: shownPage, found });
      },
      (err: unknown) => {
        if (!cancelled) setSuggested({ page: shownPage, error: (err as Error)?.message ?? String(err) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [cropping, doc, shownPage]);
  const here = suggested !== null && suggested.page === shownPage ? suggested : null;
  const found = here && "found" in here ? here.found : null;
  // Hidden where a box already is, saved or drawn here: an accepted one included.
  const offered = useMemo(
    () =>
      found && here
        ? uncropped(
            crops,
            here.page,
            found.proposals.map((s, i) => ({ ...s, id: `s:${here.page}:${i}` })),
          )
        : [],
    [found, here, crops],
  );

  /**
   * Try again, for a bank that did not open or a page whose images did not
   * decode: the bank is closed and opened again, in a new pdf.js worker, which
   * fetches the image decoders afresh (§8.3). What is on screen stays, saved or not.
   */
  function reopen() {
    closeBank(file.id);
    setUndrawn(null);
    setPdf({ status: "loading" });
    setAttempt((a) => a + 1);
  }

  // A full-screen surface, like the Viewer: the page behind it does not scroll.
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // --- saving -------------------------------------------------------------------
  const editable =
    cropping &&
    !saving &&
    !reloading &&
    failure?.kind !== "reload" &&
    shown !== null &&
    shown.page === page;
  const inflight = useRef<Promise<boolean> | null>(null);

  /**
   * Saves every change since the bank was read, on any page, in one save_crops
   * call (§4.3), then shows the bank as read back. Edits wait while it runs.
   * A refused save wrote nothing: the screen keeps its changes and says why.
   */
  function save(): Promise<boolean> {
    if (inflight.current) return inflight.current;
    if (!cropping || reloading || failure?.kind === "reload") return Promise.resolve(false);
    const changes = diff(saved, crops, geometryOf(viewports.current));
    if (isEmpty(changes)) return Promise.resolve(true);
    const before = crops;
    const run = (async () => {
      setSaving(true);
      let res: SaveResult;
      try {
        res = await savePage(file.id, changes);
      } catch {
        // The request itself failed. Safe to try again: a new question carries
        // the id this screen made, so a save that did commit is refused, not doubled.
        res = { ok: false, kind: "retry", code: null, error: "Not saved. Try again." };
      }
      inflight.current = null;
      setSaving(false);
      if (!res.ok) {
        setFailure(res);
        return false;
      }
      const { crops: next, find } = rebase(res.questions, before);
      setFailure(null);
      setSaved(res.questions);
      setCrops(next);
      setSel((s) => find(s));
      setStim((s) => {
        const id = find(s);
        return id !== null && isStimulus(next, id) ? id : null;
      });
      setAdding((a) => (a && next.questions.some((q) => q.id === a) ? a : null));
      return true;
    })();
    inflight.current = run;
    return run;
  }

  function reload() {
    setReloading(true);
    startTransition(() => router.refresh());
  }

  // Keeps the page and the topic across a reload; Next's router follows replaceState.
  const keepInUrl = (p: number | null, t: string) => {
    const q = new URLSearchParams();
    if (p !== null) q.set("page", String(p));
    if (t) q.set("topic", t);
    window.history.replaceState(null, "", `?${q}`);
  };
  const goTo = (p: number, select: string | null = null, topic = topicId) => {
    if (cropping) void save();
    setPageNo(p);
    // A selected stimulus stays in hand on the next page; anything else is let go.
    setSel(select ?? (sel !== null && sel === stim ? sel : null));
    keepInUrl(p, topic);
  };
  const onTopic = (t: string) => {
    setTopicId(t);
    const list = pagesFor(t);
    if (page !== null && !list.includes(page) && list.length > 0) goTo(list[0], null, t);
    else keepInUrl(page, t);
  };

  // Leaving with changes not yet saved: the browser asks first.
  const dirty = cropping && (pending.questions > 0 || saving);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Leaving inside the app another way (the browser's Back) still saves, as a
  // last try with nobody left to tell if it fails.
  const latest = useRef({ saved, crops, cropping, fileId: file.id });
  useEffect(() => {
    latest.current = { saved, crops, cropping, fileId: file.id };
  });
  useEffect(() => {
    const drawn = viewports.current;
    return () => {
      const l = latest.current;
      if (!l.cropping || inflight.current) return;
      const changes = diff(l.saved, l.crops, geometryOf(drawn));
      if (!isEmpty(changes)) void savePage(l.fileId, changes).catch(() => {});
    };
  }, []);

  // --- editing ------------------------------------------------------------------
  /**
   * A box cropped twice (§2.2's crop-once hint): one rectangle saved as two
   * questions or more, none of them with a box of its own. It is shared, like a
   * stimulus, but is not one.
   */
  const twice = (id: string) => {
    const qs = users.get(id) ?? [];
    return crops.rects[id]?.stimulus !== true && qs.length > 1 && qs.every((q) => dupes.has(q));
  };
  const selRect = sel !== null ? crops.rects[sel] : undefined;
  const selIsStim = !!selRect && isStimulus(crops, selRect.id, users);
  const selTwice = !!selRect && twice(selRect.id);
  const selQuestion = selRect && !selIsStim ? byId.get(users.get(selRect.id)?.[0] ?? "") : undefined;
  // The question the toolbar is for: the selected one, or the one a box is being added to.
  const current = selQuestion ?? (adding !== null ? byId.get(adding) : undefined);
  const stimRect = stim !== null ? crops.rects[stim] : undefined;

  /**
   * The screen after an edit. A selection whose rectangle is gone is let go, and
   * so is a stimulus in hand that is no longer one (a box cropped twice, once
   * one of the two is deleted).
   */
  function apply(next: Crops, nextSel: string | null = sel) {
    setCrops(next);
    setSel(nextSel !== null && next.rects[nextSel] ? nextSel : null);
    if (stim !== null && (!next.rects[stim] || !isStimulus(next, stim))) setStim(null);
    if (adding !== null && !next.questions.some((q) => q.id === adding)) setAdding(null);
  }

  function select(id: string | null) {
    setSel(id);
    if (id === null) {
      // Esc, or a tap on empty page: nothing selected, nothing in hand.
      setStim(null);
      setAdding(null);
      return;
    }
    if (isStimulus(crops, id, users)) {
      // A box cropped twice is only to delete one of: questions never go under it.
      if (!twice(id)) setStim(id);
    } else if (adding !== null && users.get(id)?.[0] !== adding) setAdding(null);
  }

  function draw(v: ViewRect) {
    if (!editable || !shown) return;
    const rect = {
      id: `n:${crypto.randomUUID()}`,
      page: shown.page,
      box: toPdfBox(shown.viewport, v),
    };
    if (adding !== null) {
      setAdding(null);
      const next = addBox(crops, adding, rect);
      if (next !== crops) apply(next, rect.id);
      return;
    }
    // New questions take the Topic for new questions, and the stimulus in hand as box 1.
    apply(
      addQuestion(crops, { id: crypto.randomUUID(), topic_id: newTopic || null }, rect, stim),
      rect.id,
    );
  }

  /** A suggestion accepted: the same as drawing its box by hand. */
  function accept(id: string) {
    const s = offered.find((x) => x.id === id);
    if (s) draw(s.view);
  }

  /** Accept all (n): every suggestion on the page, each a new question, under the stimulus in hand if any. */
  function acceptAll() {
    if (!editable || !shown) return;
    let next = crops;
    for (const s of offered) {
      next = addQuestion(
        next,
        { id: crypto.randomUUID(), topic_id: newTopic || null },
        { id: `n:${crypto.randomUUID()}`, page: shown.page, box: toPdfBox(shown.viewport, s.view) },
        stim,
      );
    }
    setAdding(null);
    apply(next, null);
  }

  function change(id: string, v: ViewRect) {
    if (!editable || !shown) return;
    apply(moveRect(crops, id, toPdfBox(shown.viewport, v)));
  }

  /** Delete or Backspace: the selected box from its question, or a stimulus from every question. */
  function removeSelected() {
    if (sel === null) return;
    apply(removeRect(crops, sel), null);
  }

  function activate(id: string) {
    if (!cropping) {
      const qs = users.get(id) ?? [];
      if (qs.length === 1 && !isStimulus(crops, id, users)) togglePick(qs[0]);
      return;
    }
    if (editable) select(id);
  }

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    // The worksheet modal is over the page: its keys are its own.
    if (making) return;
    const t = e.target;
    if (t instanceof HTMLElement && (t.closest("input, select, textarea") || t.isContentEditable)) return;
    if (e.key === "Escape") {
      if (sel !== null || stim !== null || adding !== null) select(null);
      return;
    }
    if (!editable || !shown || !selRect || selRect.page !== shown.page) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      removeSelected();
      return;
    }
    // Arrow keys nudge the selected box a point at a time, ten with Shift.
    const d = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as const)[
      e.key as "ArrowLeft"
    ];
    if (!d) return;
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    const v = toViewRect(shown.viewport, selRect.box);
    const x = Math.min(shown.viewport.width - v.w, Math.max(0, v.x + d[0] * step));
    const y = Math.min(shown.viewport.height - v.h, Math.max(0, v.y + d[1] * step));
    apply(moveRect(crops, selRect.id, toPdfBox(shown.viewport, { ...v, x, y })));
  });
  useEffect(() => {
    const listener = (e: KeyboardEvent) => onKey(e);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  // --- the overlay --------------------------------------------------------------
  const items = useMemo<StageItem[]>(() => {
    if (!shown) return [];
    const own = current?.rects ?? [];
    return Object.values(crops.rects)
      .filter((r) => r.page === shown.page)
      .map((r) => {
        const qs = users.get(r.id) ?? [];
        const stimulus = isStimulus(crops, r.id, users);
        const q = stimulus ? undefined : byId.get(qs[0]);
        const picked = !!q && picks.includes(q.id);
        const warn = manager && qs.some((id) => dupes.has(id));
        const dim = topicId !== "" && !qs.some((id) => byId.get(id)?.topic_id === topicId);
        const topic = q?.topic_id ? (topicName.get(q.topic_id) ?? null) : null;
        const k = own.indexOf(r.id);
        const nth = k >= 0 && own.length > 1 ? `box ${k + 1} of ${own.length}` : null;
        const label = warn
          ? "cropped twice: delete one"
          : stimulus
            ? manager
              ? qs.length
                ? `above ${plural(qs.length, "question")}`
                : "stimulus"
              : null
            : [nth, topic].filter(Boolean).join(" · ") || null;
        const title = stimulus
          ? `Stimulus on p. ${r.page}, above ${plural(qs.length, "question")}`
          : ["Question", topic, nth, picked ? "picked" : null].filter(Boolean).join(", ");
        return {
          id: r.id,
          v: toViewRect(shown.viewport, r.box),
          draft: drafts.has(r.id),
          stimulus,
          outlined: k >= 0 || r.id === sel,
          active: r.id === stim,
          picked,
          dim,
          label,
          warn,
          pickable: !!q,
          title,
        };
      })
      .sort((a, b) => b.v.w * b.v.h - a.v.w * a.v.h);
  }, [shown, crops, users, byId, current, picks, manager, dupes, topicId, topicName, drafts, sel, stim]);

  // Suggestions first, so every box is drawn over them.
  const stageItems = useMemo<StageItem[]>(
    () => [
      ...offered.map((s) => ({
        id: s.id,
        v: s.view,
        draft: false,
        stimulus: false,
        outlined: false,
        active: false,
        picked: false,
        dim: false,
        label: null,
        warn: false,
        pickable: false,
        suggestion: true as const,
        title: `Suggested question ${s.n}: accept it`,
      })),
      ...items,
    ],
    [offered, items],
  );

  const vw = shown?.viewport.width ?? 595;
  const vh = shown?.viewport.height ?? 842;
  const optionLabel = (p: number) => {
    if (cropping && pending.pages.has(p)) return `p. ${p} · not saved`;
    const n = onPage.get(p)?.size ?? 0;
    return n ? `p. ${p} · ${plural(n, "question")}` : `p. ${p}`;
  };

  // --- the toolbar's question ---------------------------------------------------
  const firstHere = current ? current.rects.findIndex((id) => crops.rects[id].page === page) : -1;
  const elsewhere = current
    ? Array.from(
        new Map(
          current.rects
            .map((id, i) => ({ id, i, p: crops.rects[id].page }))
            .filter((x) => x.p !== page)
            .map((x) => [
              firstHere < 0
                ? `box ${x.i + 1} on p. ${x.p}`
                : x.i < firstHere
                  ? `starts on p. ${x.p}`
                  : `continues on p. ${x.p}`,
              x,
            ]),
        ),
      )
    : [];
  const dupeUnderSel = selIsStim && sel !== null ? (users.get(sel) ?? []).filter((id) => dupes.has(id)) : [];

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "var(--paper)" }}>
      <header
        className="flex items-center gap-x-3 gap-y-2 flex-wrap"
        style={{
          padding: "10px 16px",
          background: "var(--surface)",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <Link
          href={backHref}
          className="btn btn-quiet btn-sm"
          style={{ marginLeft: -6 }}
          onClick={async (e) => {
            // Leaving saves the page first; a save that fails keeps the in-charge here, with why.
            if (!cropping || (pending.questions === 0 && !saving)) return;
            e.preventDefault();
            if (await save()) router.push(backHref);
            // A save that cannot pass (changed elsewhere, or signed out) does not
            // keep them here for ever: they may leave, once they have said so.
            else if (
              failure?.kind === "reload" &&
              window.confirm("Leave without saving? What isn't saved on this bank will be lost.")
            ) {
              router.push(backHref);
            }
          }}
        >
          <ArrowLeftIcon width={16} height={16} /> Questions
        </Link>
        <span className="truncate min-w-0" style={{ fontSize: 15, fontWeight: 800, flex: "1 1 160px" }}>
          {file.name}
        </span>

        {pages.length > 0 && page !== null && (
          <div className="flex items-center gap-1.5">
            <button
              className="btn btn-ghost btn-sm"
              style={{ padding: 7 }}
              onClick={() => at > 0 && goTo(pages[at - 1])}
              disabled={at <= 0}
              aria-label="Previous page"
            >
              <ChevronRightIcon width={16} height={16} style={{ transform: "rotate(180deg)" }} />
            </button>
            <select
              className="field"
              style={{ width: "auto", padding: "6px 10px", fontSize: 14 }}
              value={page}
              onChange={(e) => goTo(Number(e.target.value))}
              aria-label="Page"
            >
              {pages.map((p) => (
                <option key={p} value={p}>
                  {optionLabel(p)}
                </option>
              ))}
            </select>
            <button
              className="btn btn-ghost btn-sm"
              style={{ padding: 7 }}
              onClick={() => at < pages.length - 1 && goTo(pages[at + 1])}
              disabled={at < 0 || at >= pages.length - 1}
              aria-label="Next page"
            >
              <ChevronRightIcon width={16} height={16} />
            </button>
          </div>
        )}

        {/* Hidden, like every topic picker, while the course has no topics. */}
        {topics.length > 0 && doc && (
          <select
            className="field"
            style={{ width: "auto", padding: "6px 10px", fontSize: 14 }}
            value={topicId}
            onChange={(e) => onTopic(e.target.value)}
            aria-label="Topic"
          >
            <option value="">Any topic</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}

        {cropping && doc && (
          <button
            className="btn btn-primary btn-sm"
            onClick={() => void save()}
            disabled={saving || reloading || pending.questions === 0 || failure?.kind === "reload"}
          >
            {saving ? "Saving…" : pending.questions ? `Save ${pending.questions}` : "Save"}
          </button>
        )}
      </header>

      {cropping && doc && (
        <div
          className="flex items-center gap-2 flex-wrap"
          style={{
            padding: "8px 16px",
            minHeight: 48,
            background: "var(--surface)",
            borderBottom: "1px solid var(--line)",
            fontSize: 13.5,
          }}
        >
          {selTwice && selRect ? (
            <>
              <span style={{ fontWeight: 800 }}>
                Cropped twice
                {selRect.page !== page && ` on p. ${selRect.page}`}
              </span>
              <span style={{ color: "var(--ink-soft)" }}>
                This box is saved as {plural(users.get(selRect.id)?.length ?? 0, "question")}.
              </span>
              <button
                className="btn btn-ghost btn-sm"
                disabled={!editable}
                onClick={() => apply(deleteQuestion(crops, dupeUnderSel[dupeUnderSel.length - 1]))}
              >
                <TrashIcon width={15} height={15} /> Delete one
              </button>
            </>
          ) : selIsStim && selRect ? (
            <>
              <span style={{ fontWeight: 800 }}>
                Stimulus
                {selRect.page !== page && ` on p. ${selRect.page}`}
                {" · "}
                {users.get(selRect.id)?.length
                  ? `above ${plural(users.get(selRect.id)!.length, "question")}`
                  : "above no question yet"}
              </span>
              <span style={{ color: "var(--ink-soft)" }}>Questions you draw now go under it.</span>
              {dupeUnderSel.length > 0 && (
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={!editable}
                  onClick={() => apply(deleteQuestion(crops, dupeUnderSel[dupeUnderSel.length - 1]))}
                >
                  Delete one
                </button>
              )}
              <button className="btn btn-danger btn-sm" disabled={!editable} onClick={removeSelected}>
                <TrashIcon width={15} height={15} /> Delete stimulus
              </button>
            </>
          ) : current ? (
            <>
              <span style={{ fontWeight: 800 }}>
                {savedIds.has(current.id) ? "Question" : "New question"}
                {current.rects.length > 1 && ` · ${current.rects.length} boxes`}
              </span>
              {elsewhere.map(([text, x]) => (
                <button key={text} className="btn btn-quiet btn-sm" onClick={() => goTo(x.p, x.id)}>
                  {text}
                </button>
              ))}
              {topics.length > 0 && (
                <select
                  className="field"
                  style={{ width: "auto", padding: "5px 10px", fontSize: 13.5 }}
                  value={current.topic_id ?? ""}
                  disabled={!editable}
                  onChange={(e) => apply(setTopic(crops, current.id, e.target.value || null))}
                  aria-label="Question's topic"
                >
                  <option value="">No topic</option>
                  {topics.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              )}
              <button
                className="btn btn-ghost btn-sm"
                disabled={!editable || !canAddBox(current) || adding === current.id}
                onClick={() => setAdding(current.id)}
              >
                <PlusIcon width={15} height={15} /> Add a box
              </button>
              {stim !== null && !current.rects.includes(stim) && (
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={!editable || !canPutAbove(current, stim)}
                  onClick={() => apply(putAbove(crops, current.id, stim))}
                >
                  Put the stimulus above
                </button>
              )}
              {/* Only on a draft (§4.3): on a saved question it would delete the question. */}
              {selRect && selQuestion && !savedIds.has(selQuestion.id) && selQuestion.rects.length === 1 && (
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={!editable}
                  title="Print this box once above several questions"
                  onClick={() => {
                    apply(makeStimulus(crops, selRect.id));
                    setStim(selRect.id);
                  }}
                >
                  Stimulus
                </button>
              )}
              {/* A draft has no row to pick yet: a pick of it could never resolve. */}
              {savedIds.has(current.id) && (
                <button
                  className="btn btn-ghost btn-sm"
                  aria-pressed={picks.includes(current.id)}
                  onClick={() => togglePick(current.id)}
                >
                  {picks.includes(current.id) ? (
                    <>
                      <CheckIcon width={15} height={15} /> Picked
                    </>
                  ) : (
                    "Pick"
                  )}
                </button>
              )}
              {selRect && selQuestion && current.rects.length > 1 && selRect.page === page && (
                <button className="btn btn-ghost btn-sm" disabled={!editable} onClick={removeSelected}>
                  Remove box
                </button>
              )}
              <button
                className="btn btn-danger btn-sm"
                disabled={!editable}
                onClick={() => apply(deleteQuestion(crops, current.id), null)}
              >
                <TrashIcon width={15} height={15} /> Delete question
              </button>
              {adding === current.id ? (
                <span style={{ color: "var(--berry-deep)", fontWeight: 700 }}>
                  Drag on this page or another to add box {current.rects.length + 1}. Esc cancels.
                </span>
              ) : (
                current.rects.length >= MAX_BOXES && (
                  <span style={{ color: "var(--ink-soft)" }}>
                    Four boxes at most: crop the rest as another question.
                  </span>
                )
              )}
            </>
          ) : (
            <span style={{ color: "var(--ink-soft)" }}>
              {saving
                ? "Saving…"
                : failure?.kind === "reload"
                  ? "Reload the page to go on cropping."
                  : !here
                    ? "Finding suggestions…"
                    : !found
                      ? "Suggestions failed on this page. Drag to draw a box."
                      : offered.length
                        ? "Click a dashed box to accept it, or drag to draw a box."
                        : "No suggestions on this page. Drag to draw a box."}
              {items.length > 0 && !saving && failure?.kind !== "reload" && " Click a box to change it."}
              <span className="hidden pointer-coarse:inline"> Two fingers scroll.</span>
            </span>
          )}
          {stimRect && (!selIsStim || selTwice) && (
            <span className="flex items-center gap-1.5" style={{ color: "var(--berry-deep)", fontWeight: 700 }}>
              New questions go under the stimulus on p. {stimRect.page}.
              <button className="btn btn-quiet btn-sm" onClick={() => setStim(null)}>
                Done
              </button>
            </span>
          )}
          <div className="flex items-center gap-2 flex-wrap" style={{ marginLeft: "auto" }}>
            {found && (
              <span
                style={{
                  color: "var(--ink-soft)",
                  fontSize: 12.5,
                  fontWeight: 700,
                  padding: "2px 9px",
                  border: "1px solid var(--line-strong)",
                  borderRadius: 999,
                  whiteSpace: "nowrap",
                }}
              >
                {KIND[found.kind]}
              </span>
            )}
            {offered.length > 0 && (
              <button className="btn btn-ghost btn-sm" disabled={!editable} onClick={acceptAll}>
                Accept all ({offered.length})
              </button>
            )}
            {topics.length > 0 && (
              <label className="flex items-center gap-2" style={{ color: "var(--ink-soft)" }}>
                New questions
                <select
                  className="field"
                  style={{ width: "auto", padding: "5px 10px", fontSize: 13.5 }}
                  value={newTopic}
                  onChange={(e) => setNewTopic(e.target.value)}
                  aria-label="Topic for new questions"
                >
                  <option value="">No topic</option>
                  {topics.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto scroll-soft">
        <div style={{ maxWidth: COLUMN_MAX, margin: "0 auto", padding: 16, paddingBottom: picks.length ? 88 : 16 }}>
          <div ref={columnRef}>
            {manager && !file.eff_teacher_only && (
              <div
                className="card"
                style={{
                  padding: "10px 14px",
                  marginBottom: 12,
                  borderColor: "#f1c7cd",
                  background: "var(--berry-wash)",
                  color: "var(--berry-deep)",
                  fontWeight: 700,
                  fontSize: 14,
                }}
              >
                Students can see this file. Make it teacher-only before cropping.
              </div>
            )}

            {failure && (
              <div role="alert" className="card flex items-center gap-3 flex-wrap" style={ALERT}>
                <span>
                  {failure.code !== null && failure.kind !== "retry" ? `Not saved: ${failure.error}` : failure.error}
                </span>
                {failure.kind === "reload" ? (
                  <button className="btn btn-ghost btn-sm" onClick={reload} disabled={reloading}>
                    {reloading ? "Reloading…" : "Reload page"}
                  </button>
                ) : failure.kind === "retry" ? (
                  <button className="btn btn-ghost btn-sm" onClick={() => void save()} disabled={saving}>
                    {saving ? "Saving…" : "Try again"}
                  </button>
                ) : null}
              </div>
            )}

            {nothingCropped ? (
              <Notice title="Nothing is cropped in this bank" />
            ) : pdf.status === "error" ? (
              <Notice title="Can't open this file" body={pdf.message} onRetry={pdf.retry ? reopen : undefined} />
            ) : pdf.status === "loading" ? (
              <div
                className="flex flex-col items-center gap-3"
                style={{ padding: "72px 0", color: "var(--ink-soft)" }}
              >
                <SpinnerIcon width={28} height={28} />
                <p style={{ fontSize: 14, fontWeight: 700 }}>
                  {file.size_bytes !== null && file.size_bytes > BIG_BANK
                    ? `Downloading ${file.name} · ${formatBytes(file.size_bytes)}…`
                    : "Preparing…"}
                </p>
              </div>
            ) : page === null ? (
              <Notice
                title={
                  topicId
                    ? "No question in this bank has this topic"
                    : "Nothing is cropped in this bank"
                }
              />
            ) : (
              <>
                {renderError && (
                  <p style={{ color: "var(--berry-deep)", fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
                    {renderError}
                  </p>
                )}
                {undrawn !== null && undrawn === shown?.page && shown.page === page && (
                  <div role="alert" className="card flex items-center gap-3 flex-wrap" style={ALERT}>
                    <span>
                      {`Part of p. ${undrawn} didn't draw: an image on it couldn't be decoded, so the ` +
                        "page may show blank or with its text missing."}
                    </span>
                    <button className="btn btn-ghost btn-sm" onClick={reopen}>
                      Try again
                    </button>
                  </div>
                )}
                <div
                  className="relative"
                  style={{
                    aspectRatio: `${vw} / ${vh}`,
                    background: "#fff",
                    borderRadius: 4,
                    boxShadow: "var(--shadow-card)",
                    overflow: "hidden",
                  }}
                >
                  <div ref={hostRef} className="absolute inset-0" />
                  {shown && (
                    <Stage
                      width={vw}
                      height={vh}
                      pxPerUnit={width / vw}
                      items={stageItems}
                      selected={shown.page === page ? sel : null}
                      mode={!cropping ? "pick" : editable ? "crop" : "busy"}
                      scroller={scrollRef}
                      onSelect={(id) => editable && select(id)}
                      onDraw={draw}
                      onChange={change}
                      onActivate={activate}
                      onAccept={accept}
                    />
                  )}
                  {shown?.page !== page && !renderError && (
                    <span
                      className="absolute"
                      style={{ top: 10, right: 10, color: "var(--ink-soft)" }}
                      aria-label="Drawing the page"
                    >
                      <SpinnerIcon width={20} height={20} />
                    </span>
                  )}
                </div>
                {!manager && (
                  <p style={{ color: "var(--ink-soft)", fontSize: 13.5, marginTop: 12 }}>
                    A crop cut off? Tell your course in-charge which bank and page.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* The picks bar: a teacher's picks for this course, kept in the tab (§2.2). */}
      <PicksBar
        count={picks.length}
        onMake={async () => {
          // What prints is what is saved, so a crop changed here is saved first.
          if (cropping) await save();
          setMaking(true);
        }}
        onClear={clearPicks}
      />
      {making && (
        <WorksheetModal
          userId={userId}
          courseId={courseId}
          course={course}
          picks={picks}
          topics={topics}
          onClose={() => setMaking(false)}
        />
      )}
    </div>
  );
}

const ALERT = {
  padding: "10px 14px",
  marginBottom: 12,
  borderColor: "#f1c7cd",
  background: "var(--berry-wash)",
  color: "var(--berry-deep)",
  fontWeight: 700,
  fontSize: 14,
} as const;

function Notice({ title, body, onRetry }: { title: string; body?: string; onRetry?: () => void }) {
  return (
    <div className="card text-center" style={{ padding: 32, maxWidth: 440, margin: "48px auto 0" }}>
      <h3 style={{ fontSize: 18 }}>{title}</h3>
      {body && <p style={{ color: "var(--ink-soft)", marginTop: 8 }}>{body}</p>}
      {onRetry && (
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 14 }} onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
