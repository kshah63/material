"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

/**
 * A small dropdown anchored to a trigger button. The panel is rendered in a
 * portal with fixed positioning so it's never clipped by an ancestor's
 * `overflow: hidden` (e.g. the materials list card) or trapped inside a
 * scrollable modal. Closes on outside click / Esc; follows the trigger on
 * scroll/resize and flips above when there's no room below.
 */
export function Menu({
  trigger,
  items,
  align = "right",
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  items: (MenuItem | "divider")[];
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number } | null>(
    null,
  );

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 6;
    const menuH = menuRef.current?.offsetHeight ?? 0;
    const flipUp =
      menuH > 0 && r.bottom + gap + menuH > window.innerHeight && r.top - gap - menuH > 8;
    const next: { top: number; left?: number; right?: number } = {
      top: flipUp ? r.top - gap - menuH : r.bottom + gap,
    };
    if (align === "right") next.right = window.innerWidth - r.right;
    else next.left = r.left;
    setPos(next);
  }, [align]);

  // Position before paint (menu is already in the DOM via the portal), so there
  // is no visible jump. Stale pos from a prior open is corrected here pre-paint.
  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const reposition = () => place();
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", reposition);
    // capture phase so scrolling any ancestor container repositions the menu
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, place]);

  return (
    <div className="relative" ref={triggerRef} style={{ display: "inline-flex" }}>
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            className="card pop"
            style={{
              position: "fixed",
              top: pos?.top ?? -9999,
              left: pos?.left,
              right: pos?.right,
              visibility: pos ? "visible" : "hidden",
              minWidth: 184,
              padding: 6,
              boxShadow: "var(--shadow-pop)",
              zIndex: 60,
            }}
            role="menu"
          >
            {items.map((item, i) =>
              item === "divider" ? (
                <div
                  key={i}
                  style={{ height: 1, background: "var(--line)", margin: "5px 4px" }}
                />
              ) : (
                <button
                  key={i}
                  role="menuitem"
                  disabled={item.disabled}
                  className="flex items-center gap-2.5 w-full text-left rounded-[8px]"
                  style={{
                    padding: "8px 10px",
                    fontSize: 14,
                    fontWeight: 700,
                    color: item.danger ? "var(--berry-deep)" : "var(--ink)",
                    opacity: item.disabled ? 0.45 : 1,
                    cursor: item.disabled ? "not-allowed" : "pointer",
                    background: "transparent",
                  }}
                  onClick={() => {
                    if (item.disabled) return;
                    setOpen(false);
                    item.onSelect();
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "var(--paper-2)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "transparent")
                  }
                >
                  {item.icon && (
                    <span style={{ color: item.danger ? "var(--berry-deep)" : "var(--ink-soft)" }}>
                      {item.icon}
                    </span>
                  )}
                  {item.label}
                </button>
              ),
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
