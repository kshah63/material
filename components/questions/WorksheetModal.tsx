"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import { preparePicks, type PickedBank, type PickedQuestion } from "@/app/actions/questions";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { SpinnerIcon, XIcon } from "@/components/icons";
import { readPicks, writePicks } from "@/hooks/usePicks";
import { formatBytes } from "@/lib/format";
import type { QuestionTopic } from "@/lib/types";
import type { Jpeg } from "@/lib/worksheet/compose";
import {
  DPI,
  PAGE,
  contentArea,
  layout,
  printOrder,
  scaleOf,
  sourceLine,
  worksheetName,
  type BoxSize,
  type Label,
} from "@/lib/worksheet/layout";
import { BankError, closeBank, imagesFailed, isCancelled, openBank } from "@/lib/worksheet/source";

// Pencil Files' limit, until the drag-in's own is measured (§9.2 step 1).
const PENCIL_LIMIT = 25 * 1024 * 1024;
const BIG_BANK = 10 * 1024 * 1024;
// The thumbnail column stands for the content area's 180 mm.
const THUMB = 168;
const AREA = contentArea(PAGE);

/** A pick being made: its question and bank, its boxes' sizes and scale once its bank is open, and its JPEGs once drawn. */
interface Item {
  q: PickedQuestion;
  bank: PickedBank;
  sizes: BoxSize[];
  scale: number;
  jpegs: Jpeg[] | null;
  urls: string[];
}

type Phase =
  | { kind: "reading" }
  | { kind: "fetching"; done: number; total: number; bank: PickedBank }
  | { kind: "drawing" }
  | { kind: "ready" }
  // `drop`: the failed bank's picks, which Remove takes out of the tab.
  | { kind: "error"; message: string; bankId: string | null; retry: boolean; drop: string[] };

/** A failure that names its bank (§4.4): no PDF is made, and Try again opens the bank afresh. */
class BankFailure extends Error {
  constructor(
    readonly bank: PickedBank,
    reason: string,
    readonly retry = true,
  ) {
    super(`${bank.name} could not be read: ${reason}`);
  }
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/**
 * Make worksheet (docs/WORKSHEETS.md §4.4). Opening it reads the picks once
 * (preparePicks), opens every bank they need, and draws every box of every pick
 * to the 300 dpi JPEG that will print, page by page so each bank page is decoded
 * once. The pictures shown are those JPEGs. Download PDF only places them on the
 * template pages and saves. Mount it to open it: the picks are the ones at hand
 * then, and closing it cancels whatever is still being drawn.
 */
export function WorksheetModal({
  userId,
  courseId,
  course,
  picks,
  topics,
  onClose,
}: {
  userId: string;
  courseId: string;
  course: { name: string; code: string | null };
  picks: string[];
  topics: QuestionTopic[];
  onClose: () => void;
}) {
  const toast = useToast();
  const [initial, setInitial] = useState(picks);
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<Phase>({ kind: "reading" });
  const [items, setItems] = useState<Item[]>([]);
  const [gone, setGone] = useState(0);
  const [label, setLabel] = useState<Label>("homework");
  const [saving, setSaving] = useState(false);
  const [tooBig, setTooBig] = useState(false);
  // Picks removed here while drawing goes on: the drawing skips them.
  const removed = useRef(new Set<string>());
  const topicName = useMemo(() => new Map(topics.map((t) => [t.id, t.name])), [topics]);

  useEffect(() => {
    const ac = new AbortController();
    // Once a bank has failed, the banks still opening say nothing more: the
    // error stays on screen with its Try again.
    let failed = false;
    // The picks read, so that a bank that fails can offer to remove its own.
    let picked: PickedQuestion[] = [];
    const releases: (() => void)[] = [];
    const urls: string[] = [];
    // One canvas serves every box, and is emptied once the last is drawn (§6.3).
    const canvas = document.createElement("canvas");

    (async () => {
      const [res, compose] = await Promise.all([
        preparePicks(courseId, initial),
        import("@/lib/worksheet/compose"),
      ]);
      if (ac.signal.aborted) return;
      if (!res.ok) {
        setPhase({ kind: "error", message: res.error, bankId: null, retry: res.retry, drop: [] });
        return;
      }
      picked = res.questions;

      // Every bank the picks need, downloading at once; one already open in the
      // tab is not fetched again. Each is held until the modal closes (§4.5).
      const docs = new Map<string, PDFDocumentProxy>();
      const waiting = [...res.banks];
      const fetching = () => {
        if (waiting.length && !failed) {
          setPhase({ kind: "fetching", done: docs.size, total: res.banks.length, bank: waiting[0] });
        }
      };
      fetching();
      await Promise.all(
        res.banks.map(async (bank) => {
          let opened;
          try {
            opened = await openBank(bank.id, bank.size_bytes, async () => bank.url);
          } catch (err) {
            if (err instanceof BankError) throw new BankFailure(bank, err.message, err.retry);
            throw new BankFailure(bank, (err as Error)?.message ?? String(err));
          }
          if (ac.signal.aborted) return opened.release();
          releases.push(opened.release);
          docs.set(bank.id, opened.doc);
          waiting.splice(waiting.indexOf(bank), 1);
          fetching();
        }),
      );
      if (ac.signal.aborted) return;

      // Each pick's boxes as displayed. A box on a page past its bank's end, or
      // wholly off its page (only a crafted call saves either), drops the pick
      // as no longer available.
      const banks = new Map(res.banks.map((b) => [b.id, b]));
      const missing = new Set(res.missing);
      const list: Item[] = [];
      for (const q of res.questions) {
        const doc = docs.get(q.file_id)!;
        const sizes: BoxSize[] = [];
        for (const b of q.boxes) {
          const size = b.page <= doc.numPages ? compose.boxSize(await doc.getPage(b.page), b) : null;
          if (!size) break;
          sizes.push(size);
        }
        if (sizes.length < q.boxes.length) {
          missing.add(q.id);
          continue;
        }
        list.push({ q, bank: banks.get(q.file_id)!, sizes, scale: scaleOf(sizes, AREA.height).scale, jpegs: null, urls: [] });
      }
      if (ac.signal.aborted) return;
      if (missing.size) {
        writePicks(userId, courseId, readPicks(userId, courseId).filter((id) => !missing.has(id)));
        setGone(missing.size);
      }
      const ordered = printOrder(
        list.map((it) => ({ it, id: it.q.id, bank: it.bank.label, file: it.bank.id, boxes: it.q.boxes })),
      );
      list.splice(0, list.length, ...ordered.map((o) => o.it));
      const show = () => setItems(list.filter((it) => !removed.current.has(it.q.id)));
      show();

      // Every box, in bank and page order rather than print order, so each page
      // is decoded once and freed after its last box (§4.5).
      const jobs = list
        .flatMap((it, i) => it.q.boxes.map((b, k) => ({ i, k, b })))
        .sort(
          (x, y) =>
            list[x.i].bank.label.localeCompare(list[y.i].bank.label) ||
            list[x.i].q.file_id.localeCompare(list[y.i].q.file_id) ||
            x.b.page - y.b.page,
        );
      const drawn = list.map((it) => new Array<Jpeg | null>(it.q.boxes.length).fill(null));
      setPhase({ kind: "drawing" });
      // The bank page being drawn from, by bank and page number.
      let page = null as { key: string; page: PDFPageProxy } | null;
      try {
        for (const [n, job] of jobs.entries()) {
          if (ac.signal.aborted) return;
          const it = list[job.i];
          if (removed.current.has(it.q.id)) continue;
          const key = `${it.q.file_id}:${job.b.page}`;
          if (page?.key !== key) {
            page?.page.cleanup();
            page = { key, page: await docs.get(it.q.file_id)!.getPage(job.b.page) };
          }
          let jpeg: Jpeg;
          try {
            jpeg = await compose.drawBox(page.page, job.b, it.scale, canvas, ac.signal);
          } catch (err) {
            if (ac.signal.aborted || isCancelled(err)) return;
            throw new BankFailure(it.bank, `p. ${job.b.page} didn't draw: ${(err as Error)?.message ?? String(err)}`);
          }
          // Asked at once: cleaning the page up forgets its images (§8.3).
          if (imagesFailed(page.page)) {
            throw new BankFailure(it.bank, `an image on p. ${job.b.page} couldn't be decoded.`);
          }
          drawn[job.i][job.k] = jpeg;
          if (jobs[n + 1] && `${list[jobs[n + 1].i].q.file_id}:${jobs[n + 1].b.page}` !== key) {
            page.page.cleanup();
            page = null;
          }
          if (drawn[job.i].every(Boolean)) {
            const jpegs = drawn[job.i] as Jpeg[];
            const made = jpegs.map((j) => URL.createObjectURL(j.blob));
            urls.push(...made);
            list[job.i] = { ...it, jpegs, urls: made };
            show();
          }
        }
      } finally {
        page?.page.cleanup();
        canvas.width = canvas.height = 0;
      }
      if (!ac.signal.aborted) setPhase({ kind: "ready" });
    })().catch((err: unknown) => {
      if (ac.signal.aborted) return;
      failed = true;
      setPhase(
        err instanceof BankFailure
          ? {
              kind: "error",
              message: err.message,
              bankId: err.bank.id,
              retry: err.retry,
              drop: picked.filter((q) => q.file_id === err.bank.id && !removed.current.has(q.id)).map((q) => q.id),
            }
          : { kind: "error", message: (err as Error)?.message ?? String(err), bankId: null, retry: true, drop: [] },
      );
    });

    return () => {
      ac.abort();
      for (const release of releases) release();
      for (const url of urls) URL.revokeObjectURL(url);
      canvas.width = canvas.height = 0;
    };
  }, [userId, courseId, initial, attempt]);

  function tryAgain() {
    // A bank that failed is opened afresh, in a new pdf.js worker (§8.3).
    if (phase.kind === "error" && phase.bankId) closeBank(phase.bankId);
    setItems([]);
    setPhase({ kind: "reading" });
    setAttempt((a) => a + 1);
  }

  /**
   * A failed bank's picks out of the tab, and the worksheet made again without
   * them: a bank that is not a PDF, or will not download, then holds up no
   * other bank's picks, and its own page view may not open to un-pick them.
   */
  function dropBank() {
    if (phase.kind !== "error") return;
    const drop = new Set(phase.drop);
    writePicks(userId, courseId, readPicks(userId, courseId).filter((id) => !drop.has(id)));
    setItems([]);
    setPhase({ kind: "reading" });
    setInitial((list) => list.filter((id) => !drop.has(id)));
  }

  function remove(id: string) {
    removed.current.add(id);
    for (const url of items.find((it) => it.q.id === id)?.urls ?? []) URL.revokeObjectURL(url);
    setItems((list) => list.filter((it) => it.q.id !== id));
    writePicks(userId, courseId, readPicks(userId, courseId).filter((x) => x !== id));
  }

  const pages = useMemo(() => (items.length ? layout(items.map((it) => it.sizes), PAGE).pages : 0), [items]);
  // Counted from the list, so a pick removed while drawing leaves the count too.
  const drawnCount = items.filter((it) => it.jpegs).length;
  const ready = phase.kind === "ready" && items.length > 0 && items.every((it) => it.jpegs);

  async function download() {
    if (!ready || saving) return;
    setSaving(true);
    try {
      const compose = await import("@/lib/worksheet/compose");
      const name = worksheetName(label, course, new Date());
      const bytes = await compose.save(
        items.map((it) => ({
          boxes: it.sizes,
          jpegs: it.jpegs!,
          fileName: it.bank.name,
          pages: it.q.boxes.map((b) => b.page),
        })),
        await compose.template(label),
        name,
      );
      const url = URL.createObjectURL(new Blob([bytes.slice()], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setTooBig(bytes.byteLength > PENCIL_LIMIT);
      toast(`Downloaded ${name}.pdf · ${formatBytes(bytes.byteLength)}`);
    } catch (err) {
      toast(`The worksheet could not be made: ${(err as Error)?.message ?? String(err)}`, "error");
    } finally {
      setSaving(false);
    }
  }

  const status =
    phase.kind === "reading"
      ? "Reading the picks…"
      : phase.kind === "fetching"
        ? `Fetching ${phase.bank.name}${
            phase.bank.size_bytes !== null && phase.bank.size_bytes > BIG_BANK
              ? ` · ${formatBytes(phase.bank.size_bytes)}`
              : ""
          } (${Math.min(phase.done + 1, phase.total)} of ${phase.total})…`
        : phase.kind === "drawing" && items.length > 0
          ? `Drawing question ${Math.min(drawnCount + 1, items.length)} of ${items.length}…`
          : null;

  return (
    <Modal open onClose={onClose} title="Make worksheet" width={560}>
      <div className="flex flex-col gap-3">
        {status && (
          <p className="flex items-center gap-2" style={{ color: "var(--ink-soft)", fontSize: 14, fontWeight: 700 }}>
            <SpinnerIcon width={18} height={18} /> {status}
          </p>
        )}
        {phase.kind === "error" && (
          <div role="alert" className="card flex items-center gap-3 flex-wrap" style={ALERT}>
            <span>{phase.message}</span>
            {phase.retry && (
              <button className="btn btn-ghost btn-sm" onClick={tryAgain}>
                Try again
              </button>
            )}
            {phase.drop.length > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={dropBank}>
                {phase.drop.length === 1 ? "Remove its pick" : `Remove its ${phase.drop.length} picks`}
              </button>
            )}
          </div>
        )}
        {gone > 0 && (
          <p style={{ color: "var(--berry-deep)", fontSize: 13.5, fontWeight: 700 }}>
            {gone === 1
              ? "1 picked question is no longer available and was removed."
              : `${gone} picked questions are no longer available and were removed.`}
          </p>
        )}

        {items.length > 0 ? (
          <ol
            className="flex flex-col scroll-soft"
            style={{ maxHeight: "min(50vh, 440px)", overflowY: "auto", border: "1px solid var(--line)", borderRadius: 10 }}
          >
            {items.map((it, n) => (
              <li
                key={it.q.id}
                className="flex items-start gap-3"
                style={{ padding: 10, borderTop: n ? "1px solid var(--line)" : undefined }}
              >
                <Thumb item={it} />
                <div className="min-w-0" style={{ flex: 1, fontSize: 13.5 }}>
                  <p style={{ fontWeight: 700, overflowWrap: "anywhere" }}>
                    {sourceLine(it.bank.name, it.q.boxes.map((b) => b.page))}
                  </p>
                  {it.q.topic_id && topicName.has(it.q.topic_id) && (
                    <p style={{ color: "var(--ink-soft)", marginTop: 2 }}>{topicName.get(it.q.topic_id)}</p>
                  )}
                </div>
                <button
                  className="btn btn-quiet btn-sm"
                  style={{ padding: 6 }}
                  onClick={() => remove(it.q.id)}
                  aria-label="Remove this pick"
                >
                  <XIcon width={15} height={15} />
                </button>
              </li>
            ))}
          </ol>
        ) : (
          phase.kind === "ready" && (
            <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>No picks are left to make a worksheet from.</p>
          )
        )}

        <div className="flex items-center gap-3 flex-wrap" style={{ marginTop: 4 }}>
          <div className="flex items-center gap-1" role="group" aria-label="Label" style={{ borderBottom: "1px solid var(--line)" }}>
            {(["lesson", "homework"] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLabel(l)}
                aria-pressed={label === l}
                style={{
                  padding: "6px 12px",
                  fontWeight: 800,
                  fontSize: 14,
                  color: label === l ? "var(--ink)" : "var(--ink-soft)",
                  borderBottom: `2.5px solid ${label === l ? "var(--berry)" : "transparent"}`,
                  marginBottom: -1,
                }}
              >
                {l === "lesson" ? "Lesson" : "Homework"}
              </button>
            ))}
          </div>
          {items.length > 0 && (
            <span style={{ color: "var(--ink-soft)", fontSize: 13.5 }}>
              {plural(items.length, "question")} on {plural(pages, "page")}
            </span>
          )}
          <div className="flex items-center gap-2" style={{ marginLeft: "auto" }}>
            {!ready && (
              <button className="btn btn-ghost btn-sm" onClick={onClose}>
                Cancel
              </button>
            )}
            <button className="btn btn-primary btn-sm" onClick={() => void download()} disabled={!ready || saving}>
              {saving ? "Making the PDF…" : "Download PDF"}
            </button>
          </div>
        </div>
        {tooBig && (
          <p role="alert" style={{ color: "var(--berry-deep)", fontSize: 13.5, fontWeight: 700 }}>
            Over 25 MB. Pencil may refuse it; if it does, make two smaller worksheets.
          </p>
        )}
      </div>
    </Modal>
  );
}

/** A pick's picture: its JPEGs stacked, at their printed widths against the content area's. */
function Thumb({ item }: { item: Item }) {
  const width = (pt: number) => `${Math.min(100, (pt / AREA.width) * 100)}%`;
  return (
    <div className="shrink-0" style={{ width: THUMB }}>
      {item.jpegs
        ? item.jpegs.map((j, k) => (
            // A blob: URL of a picture made here, which next/image cannot take.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={k}
              src={item.urls[k]}
              alt={`Box ${k + 1} of the question`}
              style={{ display: "block", width: width((j.width * 72) / DPI), height: "auto", background: "#fff" }}
            />
          ))
        : item.sizes.map((s, k) => (
            <div
              key={k}
              className="grid place-items-center"
              style={{
                width: width(s.w * item.scale),
                aspectRatio: `${s.w} / ${s.h}`,
                background: "var(--paper-2)",
                color: "var(--ink-faint)",
              }}
            >
              {k === 0 && <SpinnerIcon width={16} height={16} />}
            </div>
          ))}
    </div>
  );
}

const ALERT = {
  padding: "10px 14px",
  borderColor: "#f1c7cd",
  background: "var(--berry-wash)",
  color: "var(--berry-deep)",
  fontWeight: 700,
  fontSize: 14,
} as const;
