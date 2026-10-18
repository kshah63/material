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
  type ViewRect,
} from "@/lib/worksheet/source";
import type { FileSuggestions, PageKind, QuestionRef } from "@/lib/worksheet/propose";
import { pagesText } from "@/lib/worksheet/layout";
import {
  MAX_BOXES,
  acceptOffers,
  addBox,
  continuesAt,
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
  namedOnScreen,
  offersOn,
  putAbove,
  rebase,
  removeRect,
  setTopic,
  uncropped,
  unsaved,
  usersOf,
  type CropQuestion,
  type Crops,
  type Offer,
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

/** Question numbers as runs: "5–7, 9". */
function numbers(refs: readonly QuestionRef[]): string {
  const ns = Array.from(new Set(refs.map((r) => r.n))).sort((a, b) => a - b);
  const runs: string[] = [];
  for (let i = 0; i < ns.length; ) {
    let j = i;
    while (j + 1 < ns.length && ns[j + 1] === ns[j] + 1) j++;
    runs.push(j > i ? `${ns[i]}–${ns[j]}` : `${ns[i]}`);
    i = j + 1;
  }
  return runs.join(", ");
}

// A suggestion's tag on the page: what a box that is not a question is for. A
// question's own number is printed in its box.
function tagOf(s: Offer): string | null {
  if (s.type === "continuation") return `continues Q${s.n}`;
  if (s.type === "question") return null;
  return s.for?.length ? `above Q${numbers(s.for)}` : "stimulus";
}

// A suggestion in words, for its keyboard target and the toolbar.
function nameOf(s: Offer): string {
  if (s.type === "question") return `Suggested question ${s.n}`;
  if (s.type === "continuation") return `Suggested box ${s.boxNo ?? 2} of question ${s.n}`;
  const what = s.type === "context" ? `${s.label ?? "context"}, a stimulus` : "Suggested stimulus";
  return s.for?.length ? `${what} above questions ${numbers(s.for)}` : what;
}

// The kind of page (§5.1), as the in-charge's toolbar names it.
const KIND: Record<PageKind, string> = {
  digital: "Digital page",
  scanned: "Scanned page",
  none: "No text layer",
  blank: "Blank page",
  "render-failed": "Page did not draw",
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
  const [asking, setAsking] = useState<string | null>(null); // the suggestion the toolbar asks about
  const [notice, setNotice] = useState<string | null>(null); // what an accept did, until the next edit
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
      setAsking(null);
      setNotice(null);
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

  // The toolbar and the answers notice sit above the page, outside its scroll.
  // When they change height (the bank's suggestions arriving, a suggestion
  // accepted), the page is scrolled by as much, so it stays where it was under
  // the pointer, and a drag begun meanwhile ends where it was aimed. A page
  // just turned to is the exception: it opens at its top (goTo), and stays
  // there through the toolbar's changes until the next press.
  const aboveRef = useRef<HTMLDivElement>(null);
  const turned = useRef(false);
  const aboveShown = cropping && !!doc;
  useEffect(() => {
    const el = aboveRef.current;
    const scroller = scrollRef.current;
    if (!aboveShown || !el || !scroller) return;
    let h = el.getBoundingClientRect().height;
    const ro = new ResizeObserver(() => {
      const next = el.getBoundingClientRect().height;
      if (!turned.current) scroller.scrollTop += next - h;
      h = next;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [aboveShown]);

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
  // In crop mode, once a page is drawn, the bank is read for its text-layer
  // suggestions, which come for every page at once. They are never saved:
  // accepting one makes it a draft, saved like any other box. A question becomes
  // a new question; a continuation the next box of the question it continues; a
  // stem or context a stimulus above the questions it names (§4.3). A scanned
  // page has none, and is drawn by hand (§5.3).
  const shownPage = shown?.page ?? null;
  const [suggested, setSuggested] = useState<
    { doc: PDFDocumentProxy; found: FileSuggestions } | { doc: PDFDocumentProxy; error: string } | null
  >(null);
  const [reading, setReading] = useState<{ done: number; pages: number } | null>(null);
  useEffect(() => {
    if (!cropping || !doc || shownPage === null) return;
    let cancelled = false;
    // Asked again on every page: the bank is read once, and a failed read is tried again.
    suggestionsFor(doc, (done, pages) => {
      if (!cancelled) setReading({ done, pages });
    }).then(
      (found) => {
        if (!cancelled) setSuggested({ doc, found });
      },
      (err: unknown) => {
        if (!cancelled) setSuggested({ doc, error: (err as Error)?.message ?? String(err) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [cropping, doc, shownPage]);
  const forDoc = suggested !== null && suggested.doc === doc ? suggested : null;
  const bankFound = forDoc && "found" in forDoc ? forDoc.found : null;
  const found = bankFound && shownPage !== null ? (bankFound.pages[shownPage - 1] ?? null) : null;
  // Suggestions skipped on this screen (a continuation whose question is not
  // cropped, or a "?" one): hidden until the bank is opened again.
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(() => new Set());
  // Hidden where a box already is, saved or drawn here: an accepted one included.
  const uncovered = useMemo(
    () => (bankFound && shownPage !== null ? uncropped(crops, shownPage, offersOn(bankFound.pages, shownPage)) : []),
    [bankFound, shownPage, crops],
  );
  const offered = useMemo(() => uncovered.filter((s) => !skipped.has(s.id)), [uncovered, skipped]);
  // Accept all (n) takes every suggestion without a "?": a continuation always
  // has one (R51), so each is looked at on its own (§4.3).
  const sure = useMemo(() => offered.filter((s) => !s.check && s.type !== "continuation"), [offered]);
  const flagged = offered.length - sure.length;
  const asked = asking !== null ? (offered.find((s) => s.id === asking) ?? null) : null;
  // The pages after an answers heading or in an answer list (§5.1): a file with
  // answers in it is cropped from a clean copy (§2.1 item 16).
  const answerPages = useMemo(
    () => (bankFound ? bankFound.pages.flatMap((p, i) => (p.answers ? [i + 1] : [])) : []),
    [bankFound],
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
    // A new page opens at its top, not as far down as the last one was scrolled.
    if (p !== page && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
      turned.current = true;
    }
    setPageNo(p);
    // A selected stimulus stays in hand on the next page; anything else is let go.
    setSel(select ?? (sel !== null && sel === stim ? sel : null));
    setAsking(null);
    setNotice(null);
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
    setAsking(null);
    setNotice(null);
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
    setAsking(null);
    setNotice(null);
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

  /**
   * A suggestion tapped (§4.3). While a box is being added to a question, its box
   * is that box, as if drawn. One with a "?" asks first, in the toolbar, with its
   * reasons; so does every continuation, which needs its question on screen.
   * Anything else is accepted at once.
   */
  function accept(id: string) {
    const s = offered.find((x) => x.id === id);
    if (!s || !editable) return;
    if (adding !== null) return draw(s.view);
    if (s.check || s.type === "continuation") {
      setSel(null);
      setNotice(null);
      setAsking(s.id);
      return;
    }
    take([s]);
  }

  /**
   * Suggestions made drafts (crops.ts acceptOffers). One question or box taken
   * alone is selected, as a drawn one is; what else happened is said in the
   * toolbar: a stimulus's questions, and any left as they were for four boxes.
   */
  function take(offers: Offer[]) {
    if (!editable || !bankFound) return;
    const res = acceptOffers(crops, bankFound.pages, offers, {
      topic: newTopic || null,
      stim,
      newId: (what) => (what === "question" ? crypto.randomUUID() : `n:${crypto.randomUUID()}`),
    });
    setAsking(null);
    setAdding(null);
    const one = offers.length === 1 ? offers[0] : null;
    const stimulus = one !== null && (one.type === "stem" || one.type === "context");
    apply(res.crops, one && !stimulus && res.rects.length === 1 ? res.rects[0] : null);
    const said: string[] = [];
    if (stimulus) {
      const named = namedOnScreen(res.crops, bankFound.pages, one);
      const above = named.filter((x) => x.id !== null && !res.full.includes(x.id)).length;
      const later = named.filter((x) => x.id === null).length;
      said.push(`The stimulus is above ${plural(above, "question")}.`);
      if (later) said.push(`${later} more ${later === 1 ? "goes" : "go"} under it when accepted.`);
    }
    if (res.full.length === 1) said.push("A question already has four boxes, so it was left as it was.");
    if (res.full.length > 1) said.push(`${res.full.length} questions already have four boxes, so they were left as they were.`);
    if (res.left.length) said.push("Not accepted: the question it continues isn't cropped yet.");
    setNotice(said.length ? said.join(" ") : null);
  }

  /** Accept all (n): every suggestion on the page without a "?". */
  function acceptAll() {
    if (!editable || !shown) return;
    take(sure);
  }

  /** The suggestion asked about, made a question of its own: a continuation whose question is not on screen or is full. */
  function takeAsQuestion(s: Offer) {
    take([{ ...s, type: "question", for: undefined, boxNo: undefined }]);
  }

  function skip(s: Offer) {
    setSkipped((prev) => new Set(prev).add(s.id));
    setAsking(null);
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
      if (sel !== null || stim !== null || adding !== null || asking !== null) select(null);
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
        label: tagOf(s),
        warn: false,
        pickable: false,
        suggestion: true as const,
        check: s.check,
        asked: s.id === asking,
        title: `${nameOf(s)}: accept it${s.check ? ` (check it: ${s.check.join("; ")})` : ""}`,
      })),
      ...items,
    ],
    [offered, items, asking],
  );

  const vw = shown?.viewport.width ?? 595;
  const vh = shown?.viewport.height ?? 842;
  const optionLabel = (p: number) => {
    if (cropping && pending.pages.has(p)) return `p. ${p} · not saved`;
    const n = onPage.get(p)?.size ?? 0;
    return n ? `p. ${p} · ${plural(n, "question")}` : `p. ${p}`;
  };

  // --- the toolbar's question ---------------------------------------------------
  const here = current ? current.rects.flatMap((id, i) => (crops.rects[id].page === page ? [i] : [])) : [];
  const elsewhere = current
    ? Array.from(
        new Map(
          current.rects
            .map((id, i) => ({ id, i, p: crops.rects[id].page }))
            .filter((x) => x.p !== page)
            .map((x) => [
              // Where it starts, where it goes on to after this page, and any other box by its number.
              here.length && x.i === 0
                ? `starts on p. ${x.p}`
                : here.length && x.i === here[here.length - 1] + 1
                  ? `continues on p. ${x.p}`
                  : `box ${x.i + 1} on p. ${x.p}`,
              x,
            ]),
        ),
      )
    : [];
  const dupeUnderSel = selIsStim && sel !== null ? (users.get(sel) ?? []).filter((id) => dupes.has(id)) : [];

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: "var(--paper)" }}
      onPointerDown={() => {
        turned.current = false;
      }}
    >
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
        <div ref={aboveRef}>
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
            ) : asked ? (
              <AskedSuggestion
                s={asked}
                on={asked.type === "continuation" && bankFound ? namedOnScreen(crops, bankFound.pages, asked)[0] : null}
                at={asked.type === "continuation" && bankFound ? (continuesAt(crops, bankFound.pages, asked)?.at ?? null) : null}
                question={(id) => byId.get(id)}
                disabled={!editable}
                onAccept={() => take([asked])}
                onAsQuestion={() => takeAsQuestion(asked)}
                onSkip={() => skip(asked)}
              />
            ) : (
              <span style={{ color: "var(--ink-soft)" }}>
                {notice !== null && !saving && (
                  <span style={{ color: "var(--ink)", fontWeight: 700 }}>{notice} </span>
                )}
                {saving
                  ? "Saving…"
                  : failure?.kind === "reload"
                    ? "Reload the page to go on cropping."
                    : !forDoc
                      ? reading && reading.pages > 1
                        ? `Finding suggestions: page ${Math.min(reading.done + 1, reading.pages)} of ${reading.pages}…`
                        : "Finding suggestions…"
                      : !found
                        ? "Suggestions failed on this bank. Drag to draw a box."
                        : offered.length
                          ? `Click a dashed box to accept it, or drag to draw a box.${
                              !flagged
                                ? ""
                                : flagged === 1
                                  ? ` The one marked ? needs a look${sure.length ? ", so Accept all leaves it" : ""}.`
                                  : ` The ${flagged} marked ? need a look${sure.length ? ", so Accept all leaves them" : ""}.`
                            }`
                          : bankFound?.answerKey
                            ? "Nothing is suggested on an answer key. Drag to draw a box."
                            : found.kind === "blank"
                              ? "This page is blank: there is nothing on it to crop."
                              : found.kind === "render-failed"
                                ? "The PDF reader could not draw this page, so nothing is suggested on it. Drag to draw a box."
                                : found.answers && found.proposals.length === 0
                                  ? "This page is answers: nothing is suggested on it. Drag to draw a box."
                                  : found.proposals.length === 0
                                    ? "No suggestions on this page. Drag to draw a box."
                                    : uncovered.length === 0
                                      ? "Every suggestion here is accepted. Drag to draw a box."
                                      : "Every suggestion here is accepted or skipped. Drag to draw a box."}
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
              {sure.length > 0 && (
                <button className="btn btn-ghost btn-sm" disabled={!editable} onClick={acceptAll}>
                  Accept all ({sure.length})
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
          {/* A file with answers in it is cropped from a clean copy (§2.1 item
              16); boxes can still be drawn by hand on this one. */}
          {bankFound && answerPages.length > 0 && (
            <div style={ANSWERS}>
              {bankFound.answerKey
                ? "This file looks like an answer key. Upload a clean copy without the answers and crop that."
                : `This file has answers on ${pagesText(answerPages)}. Upload a clean copy without the answer pages and crop that.`}
            </div>
          )}
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

// The answers notice, a strip under the toolbar.
const ANSWERS = {
  padding: "8px 16px",
  background: "var(--berry-wash)",
  borderBottom: "1px solid #f1c7cd",
  color: "var(--berry-deep)",
  fontWeight: 700,
  fontSize: 14,
} as const;

const ALERT = {
  padding: "10px 14px",
  marginBottom: 12,
  borderColor: "#f1c7cd",
  background: "var(--berry-wash)",
  color: "var(--berry-deep)",
  fontWeight: 700,
  fontSize: 14,
} as const;

/**
 * The toolbar for a suggestion tapped that asks first (§4.3): one with a "?",
 * with its reasons, and every continuation, which is accepted onto the question
 * it continues when that is on screen with room, or else as a question of its
 * own, or skipped.
 */
function AskedSuggestion({
  s,
  on,
  at,
  question,
  disabled,
  onAccept,
  onAsQuestion,
  onSkip,
}: {
  s: Offer;
  /** A continuation's question, and the question on screen it is (null: not cropped). */
  on: { ref: QuestionRef; id: string | null } | null;
  /** Where in that question's boxes the continuation goes (crops.ts continuesAt): the bank's order. */
  at: number | null;
  question: (id: string) => CropQuestion | undefined;
  disabled: boolean;
  onAccept: () => void;
  onAsQuestion: () => void;
  onSkip: () => void;
}) {
  const q = on?.id ? question(on.id) : undefined;
  const room = canAddBox(q);
  const where = on ? `question ${on.ref.n} on p. ${on.ref.page}` : "";
  return (
    <>
      <span style={{ fontWeight: 800 }}>
        {s.type !== "continuation"
          ? nameOf(s)
          : q
            ? room
              ? `Continues ${where}`
              : `Continues ${where}, which has four boxes already`
            : `Continues ${where}, which isn't cropped yet`}
      </span>
      {s.check && (
        <span className="inline-flex items-center gap-1.5" style={{ color: "var(--ink-soft)" }}>
          <span
            className="mono"
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: "1px 6px",
              borderRadius: 6,
              background: "var(--honey-deep)",
              color: "#fff",
            }}
          >
            ?
          </span>
          {s.check.join("; ")}
        </span>
      )}
      {s.type !== "continuation" ? (
        <button className="btn btn-ghost btn-sm" disabled={disabled} onClick={onAccept}>
          <CheckIcon width={15} height={15} /> Accept
        </button>
      ) : room ? (
        <button className="btn btn-ghost btn-sm" disabled={disabled} onClick={onAccept}>
          <PlusIcon width={15} height={15} /> Add as box {(at ?? q!.rects.length) + 1}
        </button>
      ) : (
        <button className="btn btn-ghost btn-sm" disabled={disabled} onClick={onAsQuestion}>
          Accept as a question
        </button>
      )}
      <button className="btn btn-quiet btn-sm" onClick={onSkip}>
        Skip
      </button>
    </>
  );
}

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
