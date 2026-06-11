import { MarkerIcon } from "./icons";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5 select-none">
      <span
        className="grid place-items-center rounded-[11px] text-white shrink-0"
        style={{
          width: 34,
          height: 34,
          background:
            "linear-gradient(150deg, var(--berry), var(--honey-deep))",
          boxShadow: "0 6px 14px -8px rgba(207,70,89,0.9)",
        }}
        aria-hidden
      >
        <MarkerIcon width={19} height={19} />
      </span>
      {!compact && (
        <span className="leading-none">
          <span
            className="block"
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              fontSize: 17,
              letterSpacing: "-0.02em",
              color: "var(--ink)",
            }}
          >
            MathVision
          </span>
          <span
            className="mono block"
            style={{ fontSize: 10.5, color: "var(--ink-soft)", letterSpacing: "0.08em" }}
          >
            MATERIALS
          </span>
        </span>
      )}
    </span>
  );
}
