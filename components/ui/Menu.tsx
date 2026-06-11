"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

/** A small dropdown anchored to a trigger button. Closes on outside click / Esc. */
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
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div
          className="card pop absolute z-40"
          style={{
            top: "calc(100% + 6px)",
            [align]: 0,
            minWidth: 184,
            padding: 6,
            boxShadow: "var(--shadow-pop)",
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
        </div>
      )}
    </div>
  );
}
