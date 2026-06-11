"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { CheckIcon, XIcon } from "@/components/icons";

type ToastKind = "success" | "error" | "info";
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

const ToastContext = createContext<(message: string, kind?: ToastKind) => void>(
  () => {},
);

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((message: string, kind: ToastKind = "success") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 4200);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        className="fixed z-[60] flex flex-col gap-2"
        style={{ right: 20, bottom: 20, maxWidth: 360 }}
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="card pop flex items-start gap-2.5"
            style={{
              padding: "11px 13px",
              borderColor:
                t.kind === "error"
                  ? "#f1c7cd"
                  : t.kind === "success"
                    ? "#c4e6d5"
                    : "var(--line)",
              boxShadow: "var(--shadow-pop)",
            }}
            role="status"
          >
            <span
              className="grid place-items-center rounded-full shrink-0 mt-0.5"
              style={{
                width: 20,
                height: 20,
                background:
                  t.kind === "error" ? "var(--berry)" : "var(--leaf)",
                color: "#fff",
              }}
            >
              {t.kind === "error" ? (
                <XIcon width={13} height={13} />
              ) : (
                <CheckIcon width={13} height={13} />
              )}
            </span>
            <span style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.35 }}>
              {t.message}
            </span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
