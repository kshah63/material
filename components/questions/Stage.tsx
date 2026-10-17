"use client";

import { useRef, useState, type CSSProperties, type RefObject } from "react";
import { CheckIcon } from "@/components/icons";
import { MIN_BOX } from "@/lib/worksheet/crops";
import type { ViewRect } from "@/lib/worksheet/source";

// The boxes over one drawn page, and the gestures on it (docs/WORKSHEETS.md
// §4.3). Everything here is in the page's viewport units at scale 1, which are
// points with y growing downwards; the page view turns them into PDF boxes.
//
// Crop mode, with a mouse, a pen or one finger: drag on empty page to draw,
// drag a box to move it, drag the selected box's edge or corner to resize it,
// tap to select, tap empty page to deselect. A suggestion (§5.1) is empty page
// that a tap accepts: a drag across it still draws. Two fingers scroll the
// page, because one finger draws. Every box is also a button, so Tab reaches it
// and Enter selects it, or accepts a suggestion; in pick mode a tap or Enter on
// a box picks its question.

export interface StageItem {
  id: string;
  v: ViewRect;
  /** Not saved as it is shown: new, moved, or a stimulus no question uses. */
  draft: boolean;
  /** Printed once above several questions; drawn faint. */
  stimulus: boolean;
  /** A box of the selected question, or the selected stimulus. */
  outlined: boolean;
  /** The stimulus that questions drawn now go under. */
  active: boolean;
  picked: boolean;
  dim: boolean;
  label: string | null;
  warn: boolean;
  /** Pick mode: a box only its question uses, which a tap picks. */
  pickable: boolean;
  /** A text-layer suggestion, not a box yet: drawn dashed, and a tap accepts it. */
  suggestion?: true;
  title: string;
}

export type StageMode = "crop" | "pick" | "busy";

interface Point {
  x: number;
  y: number;
}
interface Edges {
  l: boolean;
  r: boolean;
  t: boolean;
  b: boolean;
}
type Gesture =
  | { kind: "draw"; start: Point; accept: string | null; moved: boolean }
  | { kind: "move"; id: string; start: Point; orig: ViewRect; moved: boolean }
  | { kind: "resize"; id: string; orig: ViewRect; edges: Edges }
  | { kind: "pan" };

// How close to an edge, in screen pixels, grabs it: a fingertip needs more.
const GRAB_PX: Record<string, number> = { mouse: 7, pen: 9, touch: 20 };
// How far a press travels, in screen pixels, before it is a drag and not a tap.
const SLOP_PX: Record<string, number> = { mouse: 3, pen: 4, touch: 8 };
const HANDLE_PX = 9;

const area = (v: ViewRect) => v.w * v.h;
const inside = (v: ViewRect, p: Point) =>
  p.x >= v.x && p.x <= v.x + v.w && p.y >= v.y && p.y <= v.y + v.h;

/** Which edges of `v` a press at `p` grabs, within `tol`: none means it does not. */
function edgesAt(v: ViewRect, p: Point, tol: number): Edges | null {
  if (p.x < v.x - tol || p.x > v.x + v.w + tol || p.y < v.y - tol || p.y > v.y + v.h + tol) return null;
  const dl = Math.abs(p.x - v.x);
  const dr = Math.abs(p.x - (v.x + v.w));
  const dt = Math.abs(p.y - v.y);
  const db = Math.abs(p.y - (v.y + v.h));
  const e = {
    l: dl <= tol && dl <= dr,
    r: dr <= tol && dr < dl,
    t: dt <= tol && dt <= db,
    b: db <= tol && db < dt,
  };
  return e.l || e.r || e.t || e.b ? e : null;
}

function cursorFor(e: Edges): string {
  if ((e.l && e.t) || (e.r && e.b)) return "nwse-resize";
  if ((e.r && e.t) || (e.l && e.b)) return "nesw-resize";
  return e.l || e.r ? "ew-resize" : "ns-resize";
}

export function Stage({
  width,
  height,
  pxPerUnit,
  items,
  selected,
  mode,
  scroller,
  onSelect,
  onDraw,
  onChange,
  onActivate,
  onAccept,
}: {
  width: number;
  height: number;
  /** Screen pixels per viewport unit, for handle sizes and grab distances. */
  pxPerUnit: number;
  /** Largest first, so a box inside another is on top of it. */
  items: StageItem[];
  selected: string | null;
  mode: StageMode;
  scroller: RefObject<HTMLDivElement | null>;
  onSelect: (id: string | null) => void;
  onDraw: (v: ViewRect) => void;
  onChange: (id: string, v: ViewRect) => void;
  onActivate: (id: string) => void;
  /** A suggestion tapped. */
  onAccept: (id: string) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const pointers = useRef(new Map<number, Point>());
  // The box being drawn (id null), moved or resized, as it follows the pointer.
  // Kept in a ref as well, since pointerup can come before a render has caught up.
  const [live, setLiveState] = useState<{ id: string | null; v: ViewRect } | null>(null);
  const liveRef = useRef<{ id: string | null; v: ViewRect } | null>(null);
  const setLive = (l: { id: string | null; v: ViewRect } | null) => {
    liveRef.current = l;
    setLiveState(l);
  };
  const [cursor, setCursor] = useState("crosshair");

  const unit = 1 / (pxPerUnit || 1);
  const clampX = (x: number) => Math.min(width, Math.max(0, x));
  const clampY = (y: number) => Math.min(height, Math.max(0, y));

  function toPage(e: React.PointerEvent): Point {
    const r = stageRef.current!.getBoundingClientRect();
    return {
      x: clampX(((e.clientX - r.left) / r.width) * width),
      y: clampY(((e.clientY - r.top) / r.height) * height),
    };
  }

  /**
   * What a press at p takes: the selected box's edges first, then the smallest
   * box under it, then the smallest suggestion under it.
   */
  function hit(p: Point, pointerType: string): { id: string; edges: Edges | null; suggestion: boolean } | null {
    const sel = items.find((i) => i.id === selected);
    const edges = sel ? edgesAt(sel.v, p, (GRAB_PX[pointerType] ?? 7) * unit) : null;
    if (sel && edges) return { id: sel.id, edges, suggestion: false };
    // A box beats a suggestion; between two of a kind, the smaller wins.
    const rank = (i: StageItem) => (i.suggestion ? 1 : 0);
    let best: StageItem | null = null;
    for (const it of items) {
      if (!inside(it.v, p)) continue;
      if (!best || rank(it) < rank(best) || (rank(it) === rank(best) && area(it.v) < area(best.v))) best = it;
    }
    return best ? { id: best.id, edges: null, suggestion: !!best.suggestion } : null;
  }

  function cancel() {
    gesture.current = null;
    setLive(null);
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (mode !== "crop") return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // The first finger down: no other is, whatever a missed pointerup left behind.
    if (e.isPrimary) pointers.current.clear();
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
    // Out of a select or button, so Delete and the arrow keys reach the page.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    // A second finger: whatever the first began is dropped, and the two scroll.
    if (e.pointerType === "touch" && pointers.current.size >= 2) {
      cancel();
      gesture.current = { kind: "pan" };
      return;
    }
    if (pointers.current.size > 1) return;
    const p = toPage(e);
    const h = hit(p, e.pointerType);
    const it = h ? items.find((i) => i.id === h.id)! : null;
    if (h && it && h.edges) {
      gesture.current = { kind: "resize", id: h.id, orig: it.v, edges: h.edges };
    } else if (h && it && !h.suggestion) {
      if (h.id !== selected) onSelect(h.id);
      gesture.current = { kind: "move", id: h.id, start: p, orig: it.v, moved: false };
    } else {
      gesture.current = { kind: "draw", start: p, accept: h?.suggestion ? h.id : null, moved: false };
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    const last = pointers.current.get(e.pointerId);
    if (g?.kind === "pan" && last) {
      // Each finger moves the page by half its own travel, so two together move it by their mean.
      const n = pointers.current.size || 1;
      scroller.current?.scrollBy((last.x - e.clientX) / n, (last.y - e.clientY) / n);
    }
    if (last) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (mode !== "crop") return;
    const p = toPage(e);
    if (!g) {
      if (e.pointerType !== "mouse") return;
      const h = hit(p, "mouse");
      setCursor(!h ? "crosshair" : h.edges ? cursorFor(h.edges) : h.id === selected ? "move" : "pointer");
      return;
    }
    if (g.kind === "draw") {
      if (Math.hypot(p.x - g.start.x, p.y - g.start.y) >= (SLOP_PX[e.pointerType] ?? 3) * unit) g.moved = true;
      setLive({
        id: null,
        v: {
          x: Math.min(g.start.x, p.x),
          y: Math.min(g.start.y, p.y),
          w: Math.abs(p.x - g.start.x),
          h: Math.abs(p.y - g.start.y),
        },
      });
    } else if (g.kind === "move") {
      const dx = p.x - g.start.x;
      const dy = p.y - g.start.y;
      if (!g.moved && Math.hypot(dx, dy) < (SLOP_PX[e.pointerType] ?? 3) * unit) return;
      g.moved = true;
      const x = Math.min(width - g.orig.w, Math.max(0, g.orig.x + dx));
      const y = Math.min(height - g.orig.h, Math.max(0, g.orig.y + dy));
      setLive({ id: g.id, v: { ...g.orig, x, y } });
    } else if (g.kind === "resize") {
      const o = g.orig;
      let x0 = o.x;
      let y0 = o.y;
      let x1 = o.x + o.w;
      let y1 = o.y + o.h;
      if (g.edges.l) x0 = Math.min(p.x, x1 - MIN_BOX);
      if (g.edges.r) x1 = Math.max(p.x, x0 + MIN_BOX);
      if (g.edges.t) y0 = Math.min(p.y, y1 - MIN_BOX);
      if (g.edges.b) y1 = Math.max(p.y, y0 + MIN_BOX);
      x0 = clampX(x0);
      y0 = clampY(y0);
      x1 = clampX(x1);
      y1 = clampY(y1);
      setLive({ id: g.id, v: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } });
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "pan") {
      if (pointers.current.size === 0) gesture.current = null;
      return;
    }
    if (e.type === "pointercancel") return cancel();
    const l = liveRef.current;
    if (g.kind === "draw") {
      // A drag smaller than 10 pt is not a box. A tap on a suggestion accepts
      // it, and a tap on empty page deselects.
      if (l && l.v.w >= MIN_BOX && l.v.h >= MIN_BOX) onDraw(l.v);
      else if (g.accept !== null && !g.moved) onAccept(g.accept);
      else onSelect(null);
    } else if (l && l.id === g.id && (g.kind === "resize" || g.moved)) {
      onChange(g.id, l.v);
    }
    cancel();
  }

  const shown = items.map((it) => (live && live.id === it.id ? { ...it, v: live.v } : it));
  const sel = shown.find((i) => i.id === selected);
  const pct = (v: ViewRect): CSSProperties => ({
    left: `${(v.x / width) * 100}%`,
    top: `${(v.y / height) * 100}%`,
    width: `${(v.w / width) * 100}%`,
    height: `${(v.h / height) * 100}%`,
  });
  const hs = HANDLE_PX * unit;

  return (
    <div
      ref={stageRef}
      className="absolute inset-0"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        // One finger draws in crop mode; elsewhere the page scrolls and zooms as usual.
        touchAction: mode === "crop" ? "none" : "auto",
        cursor: mode === "crop" ? cursor : mode === "busy" ? "progress" : "default",
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
      }}
    >
      <svg
        className="absolute inset-0"
        width="100%"
        height="100%"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        aria-hidden="true"
        style={{ pointerEvents: "none" }}
      >
        {shown.map((it) => {
          if (it.suggestion) {
            return (
              <rect
                key={it.id}
                x={it.v.x}
                y={it.v.y}
                width={it.v.w}
                height={it.v.h}
                vectorEffect="non-scaling-stroke"
                strokeWidth={1.75}
                strokeDasharray="6 4"
                style={{ stroke: "var(--ink-soft)", fill: "rgba(133,119,100,0.06)" }}
              />
            );
          }
          const colour = it.picked || it.draft ? "var(--berry)" : "var(--grape)";
          return (
            <rect
              key={it.id}
              x={it.v.x}
              y={it.v.y}
              width={it.v.w}
              height={it.v.h}
              vectorEffect="non-scaling-stroke"
              strokeWidth={it.outlined ? 3.5 : 2}
              strokeDasharray={it.active ? "7 4" : undefined}
              style={{
                stroke: colour,
                strokeOpacity: it.stimulus && !it.outlined ? 0.5 : 1,
                fill: it.picked
                  ? "rgba(241,90,41,0.16)"
                  : it.stimulus
                    ? "rgba(46,49,146,0.07)"
                    : it.draft
                      ? "rgba(241,90,41,0.04)"
                      : "rgba(46,49,146,0.03)",
                opacity: it.dim ? 0.25 : 1,
              }}
            />
          );
        })}
        {live && live.id === null && (
          <rect
            x={live.v.x}
            y={live.v.y}
            width={live.v.w}
            height={live.v.h}
            vectorEffect="non-scaling-stroke"
            strokeWidth={2}
            strokeDasharray="5 4"
            style={{ stroke: "var(--berry)", fill: "rgba(241,90,41,0.06)" }}
          />
        )}
        {mode === "crop" &&
          sel &&
          [0, 0.5, 1].flatMap((fx) =>
            [0, 0.5, 1]
              .filter((fy) => fx !== 0.5 || fy !== 0.5)
              .map((fy) => (
                <rect
                  key={`${fx}:${fy}`}
                  x={sel.v.x + sel.v.w * fx - hs / 2}
                  y={sel.v.y + sel.v.h * fy - hs / 2}
                  width={hs}
                  height={hs}
                  vectorEffect="non-scaling-stroke"
                  strokeWidth={1.5}
                  style={{ fill: "#fff", stroke: sel.draft ? "var(--berry)" : "var(--grape)" }}
                />
              )),
          )}
      </svg>

      {shown.map((it) =>
        it.label || it.picked ? (
          <span
            key={it.id}
            className="absolute mono inline-flex items-center gap-1"
            style={{
              // Top right, so the bank's own number at the left stays readable.
              right: `${100 - ((it.v.x + it.v.w) / width) * 100}%`,
              top: `${(it.v.y / height) * 100}%`,
              maxWidth: `${(it.v.w / width) * 100}%`,
              fontSize: 10.5,
              lineHeight: 1.2,
              padding: "2px 6px",
              borderBottomLeftRadius: 6,
              background: it.warn || it.picked ? "var(--berry-deep)" : it.draft ? "var(--berry)" : "var(--grape)",
              color: "#fff",
              opacity: it.dim ? 0.25 : 0.92,
              pointerEvents: "none",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {it.picked && <CheckIcon width={11} height={11} style={{ flex: "none" }} />}
            {it.label ?? "picked"}
          </span>
        ) : null,
      )}

      {/* Keyboard targets in crop mode (pointer input is the stage's), and the
          pick targets in pick mode. */}
      {shown.map((it) =>
        mode !== "pick" || it.pickable ? (
          <button
            key={it.id}
            type="button"
            className="absolute"
            aria-label={it.title}
            aria-pressed={it.suggestion ? undefined : mode === "pick" ? it.picked : it.outlined}
            onClick={(e) => {
              // In crop mode only a keyboard press (detail 0) reaches here.
              if (mode !== "pick" && e.detail !== 0) return;
              if (it.suggestion) onAccept(it.id);
              else onActivate(it.id);
            }}
            style={{
              ...pct(it.v),
              background: "transparent",
              border: 0,
              padding: 0,
              borderRadius: 2,
              cursor: "pointer",
              pointerEvents: mode === "pick" ? "auto" : "none",
            }}
          />
        ) : null,
      )}
    </div>
  );
}
