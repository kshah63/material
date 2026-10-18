"use client";

import { useEffect, useEffectEvent, useRef, useState, type ReactNode, type RefObject } from "react";
import type { PDFDocumentProxy, PageViewport, RenderTask } from "pdfjs-dist/legacy/build/pdf.mjs";
import { SpinnerIcon } from "@/components/icons";
import { imagesFailed, isCancelled, pageBox, renderRegion } from "@/lib/worksheet/source";

// The crop screen's All pages view (docs/WORKSHEETS.md §4.3): every page of the
// bank in one scroll, at the column's width. Each page's frame has its height
// from the start, from its viewport, so the scrollbar is right and nothing moves
// as pages are drawn. Only pages near the window hold a canvas: a page is drawn
// once it comes within half a window of the view, one page at a time, nearest
// first, and let go (its canvas freed, page.cleanup()) once it is more than a
// window away, so an 87-page bank holds three or four canvases however far it
// is scrolled. Each page's overlay is the page view's (Stage), on every page,
// drawn or not, so its boxes are buttons Tab reaches anywhere in the bank.

// The page is drawn at the column's width in device pixels, up to the 2,048 px
// §8.1 measured (20–86 ms for a digital page, about 0.5 s for a scan), and never
// past iOS Safari's canvas area, beyond which a canvas silently draws nothing.
export const MAX_CANVAS_WIDTH = 2048;
export const MAX_CANVAS_AREA = 16_000_000;

/** Canvas pixels per point for a page shown `cssWidth` px wide. */
export function canvasScale(vp: { width: number; height: number }, cssWidth: number): number {
  const px = Math.min(MAX_CANVAS_WIDTH, Math.round(cssWidth * (window.devicePixelRatio || 1)));
  return Math.min(px / vp.width, Math.sqrt(MAX_CANVAS_AREA / (vp.width * vp.height)));
}

// A page is drawn within half a window of the view, and let go beyond a whole
// one: the gap between the two keeps a page at the edge from being drawn and
// let go over and over as the scroll goes back and forth.
const DRAW_MARGIN = "50% 0px";
const KEEP_MARGIN = "100% 0px";
// The page whose frame is under this share of the window's height is "the page".
const CURRENT_AT = 1 / 3;
const GAP = 16;
const LABEL = 22;

interface Held {
  canvas: HTMLCanvasElement;
  width: number;
}

/** The one page being drawn: its render, and its canvas until the canvas is shown. */
interface Job {
  page: number;
  task: RenderTask | null;
  canvas: HTMLCanvasElement | null;
  cancelled: boolean;
}

export function BookView({
  doc,
  sizes,
  width,
  scroller,
  start,
  stage,
  label,
  onVisible,
  onCurrent,
  onDrawn,
  onRetry,
}: {
  doc: PDFDocumentProxy;
  /** Every page's viewport at scale 1, page 1 first. */
  sizes: readonly PageViewport[];
  /** The column's width, in CSS pixels. */
  width: number;
  /** The scroll the pages are in. Each page is in it as an element with data-page, to scroll to. */
  scroller: RefObject<HTMLDivElement | null>;
  /** The page to open at: where One page was, or where the scroll was before the bank was opened afresh. */
  start: number;
  /** A page's overlay, and whether the page is drawn. */
  stage: (page: number, drawn: boolean) => ReactNode;
  /** What is said beside a page's number: its state. */
  label: (page: number) => ReactNode;
  /** The pages on screen, whenever that changes. */
  onVisible: (pages: ReadonlySet<number>) => void;
  /** The page a third of the way down the window, whenever that changes. */
  onCurrent: (page: number) => void;
  /** A page drawn, and whether an image on it could not be decoded (§8.3). */
  onDrawn: (page: number, failed: boolean) => void;
  /** Try again, for a page whose images did not decode: the page view opens the bank afresh. */
  onRetry: () => void;
}) {
  const [drawn, setDrawn] = useState<ReadonlySet<number>>(() => new Set());
  const [undecoded, setUndecoded] = useState<ReadonlySet<number>>(() => new Set());
  const [errors, setErrors] = useState<ReadonlyMap<number, string>>(() => new Map());
  const hosts = useRef(new Map<number, HTMLDivElement>());
  const frames = useRef(new Map<number, HTMLDivElement>());
  const widthRef = useRef(width);
  const pumpRef = useRef<() => void>(() => {});
  // The callbacks as of the last render, for the observers set up once.
  const calls = useRef({ onVisible, onCurrent, onDrawn });
  useEffect(() => {
    calls.current = { onVisible, onCurrent, onDrawn };
  });
  const toStart = useEffectEvent((root: HTMLDivElement) => {
    const el = frames.current.get(start);
    if (start > 1 && el) {
      root.scrollTo({ top: el.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop });
    }
    return start;
  });

  useEffect(() => {
    const root = scroller.current;
    const els = frames.current;
    if (!root) return;
    let alive = true;
    let current = toStart(root);
    const near = new Set<number>();
    const kept = new Set<number>();
    const visible = new Set<number>();
    const held = new Map<number, Held>();
    let job: Job | null = null;

    const pageOf = (el: Element) => Number((el as HTMLElement).dataset.page);
    const edit = <T,>(set: ReadonlySet<T>, v: T, on: boolean) => {
      if (set.has(v) === on) return set;
      const next = new Set(set);
      if (on) next.add(v);
      else next.delete(v);
      return next;
    };

    /** A page let go: its render stopped, its canvas freed, and what pdf.js decoded for it forgotten. */
    function release(p: number) {
      if (job?.page === p) {
        job.cancelled = true;
        job.task?.cancel();
      }
      const h = held.get(p);
      if (h) {
        hosts.current.get(p)?.replaceChildren();
        // Safari is slow to free a canvas's memory unless it is shrunk first.
        h.canvas.width = h.canvas.height = 0;
        held.delete(p);
      }
      setDrawn((s) => edit(s, p, false));
      setUndecoded((s) => edit(s, p, false));
      setErrors((m) => {
        if (!m.has(p)) return m;
        const next = new Map(m);
        next.delete(p);
        return next;
      });
      // pdf.js defers it until a render still running on the page (the suggestions') stops.
      void doc
        .getPage(p)
        .then((page) => page.cleanup())
        .catch(() => {});
    }

    const failed = new Set<number>();
    /** Draws the nearest page near the view that has no canvas of this width yet, then the next. */
    function pump() {
      if (!alive || job) return;
      const w = widthRef.current;
      if (w === 0) return;
      const want = Array.from(near).filter((p) => held.get(p)?.width !== w && !failed.has(p));
      if (!want.length) return;
      want.sort((a, b) => Math.abs(a - current) - Math.abs(b - current) || a - b);
      const p = want[0];
      const j: Job = { page: p, task: null, canvas: null, cancelled: false };
      job = j;
      (async () => {
        const page = await doc.getPage(p);
        if (j.cancelled) return;
        const vp = page.getViewport({ scale: 1 });
        // Drawn off screen and swapped in, so an older drawing stays up meanwhile.
        j.canvas = document.createElement("canvas");
        j.task = renderRegion(page, pageBox(page), canvasScale(vp, w), j.canvas);
        await j.task.promise;
        // Asked at once: cleaning the page up forgets its images.
        const bad = imagesFailed(page);
        const host = hosts.current.get(p);
        if (j.cancelled || !host || !kept.has(p)) return;
        j.canvas.style.cssText = "display:block;width:100%;height:100%";
        const old = held.get(p);
        host.replaceChildren(j.canvas);
        if (old) old.canvas.width = old.canvas.height = 0;
        held.set(p, { canvas: j.canvas, width: w });
        j.canvas = null;
        setDrawn((s) => edit(s, p, true));
        setUndecoded((s) => edit(s, p, bad));
        calls.current.onDrawn(p, bad);
      })()
        .catch((err: unknown) => {
          if (j.cancelled || isCancelled(err)) return;
          failed.add(p);
          setErrors((m) => new Map(m).set(p, (err as Error)?.message ?? String(err)));
        })
        .finally(() => {
          if (j.canvas) j.canvas.width = j.canvas.height = 0;
          if (job === j) job = null;
          pump();
        });
    }
    pumpRef.current = pump;

    // The page a third of the way down, for the page select and for which page is drawn first.
    let frame = 0;
    const measure = () => {
      frame = 0;
      const top = root.getBoundingClientRect().top + root.clientHeight * CURRENT_AT;
      let best = current;
      let dist = Infinity;
      for (const p of visible) {
        const r = els.get(p)?.getBoundingClientRect();
        if (!r) continue;
        const d = top < r.top ? r.top - top : top > r.bottom ? top - r.bottom : 0;
        if (d < dist) {
          dist = d;
          best = p;
        }
      }
      if (best !== current) {
        current = best;
        calls.current.onCurrent(best);
      }
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const draw = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) near.add(pageOf(e.target));
          else near.delete(pageOf(e.target));
        }
        pump();
      },
      { root, rootMargin: DRAW_MARGIN },
    );
    const keep = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const p = pageOf(e.target);
          if (e.isIntersecting) kept.add(p);
          else {
            kept.delete(p);
            // A page that failed is tried again once it comes back.
            failed.delete(p);
            if (held.has(p) || job?.page === p) release(p);
          }
        }
      },
      { root, rootMargin: KEEP_MARGIN },
    );
    // Measured again once the pages on screen are known: a jump's scroll event can come before them.
    const seen = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(pageOf(e.target));
          else visible.delete(pageOf(e.target));
        }
        calls.current.onVisible(new Set(visible));
        onScroll();
      },
      { root },
    );
    for (const el of els.values()) {
      draw.observe(el);
      keep.observe(el);
      seen.observe(el);
    }

    root.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      alive = false;
      root.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
      draw.disconnect();
      keep.disconnect();
      seen.disconnect();
      if (job) {
        job.cancelled = true;
        job.task?.cancel();
      }
      for (const p of Array.from(held.keys())) release(p);
    };
  }, [doc, scroller]);

  // A new width draws the pages near the view again; the old drawings stay up, scaled, meanwhile.
  useEffect(() => {
    widthRef.current = width;
    pumpRef.current();
  }, [width]);

  return (
    <div>
      {sizes.map((vp, i) => {
        const p = i + 1;
        return (
          <div
            key={p}
            data-page={p}
            ref={(el) => {
              if (el) frames.current.set(p, el);
              else frames.current.delete(p);
            }}
            style={{ marginBottom: GAP }}
          >
            <div
              className="flex items-center gap-2 mono"
              style={{ height: LABEL, fontSize: 12, color: "var(--ink-soft)", whiteSpace: "nowrap", overflow: "hidden" }}
            >
              <span style={{ fontWeight: 700, color: "var(--ink)" }}>p. {p}</span>
              {label(p)}
            </div>
            <div
              className="relative"
              style={{
                aspectRatio: `${vp.width} / ${vp.height}`,
                background: "#fff",
                borderRadius: 4,
                boxShadow: "var(--shadow-card)",
                overflow: "hidden",
              }}
            >
              <div
                ref={(el) => {
                  if (el) hosts.current.set(p, el);
                  else hosts.current.delete(p);
                }}
                className="absolute inset-0"
              />
              {stage(p, drawn.has(p))}
              {!drawn.has(p) && !errors.has(p) && (
                <span
                  className="absolute"
                  style={{ top: 10, right: 10, color: "var(--ink-faint)" }}
                  aria-label={`Drawing p. ${p}`}
                >
                  <SpinnerIcon width={18} height={18} />
                </span>
              )}
              {errors.has(p) && (
                <p
                  className="absolute"
                  style={{ top: 12, left: 14, right: 14, color: "var(--berry-deep)", fontWeight: 700, fontSize: 14 }}
                >
                  p. {p} could not be drawn: {errors.get(p)}
                </p>
              )}
              {undecoded.has(p) && (
                <div
                  role="alert"
                  className="absolute card flex items-center gap-3 flex-wrap"
                  style={{
                    top: 10,
                    left: 10,
                    right: 10,
                    padding: "8px 12px",
                    borderColor: "#f1c7cd",
                    background: "var(--berry-wash)",
                    color: "var(--berry-deep)",
                    fontWeight: 700,
                    fontSize: 13.5,
                  }}
                >
                  <span>
                    {`Part of p. ${p} didn't draw: an image on it couldn't be decoded, so the page may show blank or with its text missing.`}
                  </span>
                  <button className="btn btn-ghost btn-sm" onClick={onRetry}>
                    Try again
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
