/**
 * MathVision brand lockup. The mark is the real chevron (indigo over white)
 * on the brand orange tile, extracted from the official logo; the wordmark
 * pairs it with the "Materials" product label.
 */

/** The chevron glyph (indigo over white). On its own it expects an orange-ish
 *  ground; inside MathVisionMark it sits on the brand orange tile. */
function Chevron({ size, mono }: { size: number; mono?: string }) {
  return (
    <svg width={size} height={size} viewBox="1007.31 531.58 820.03 708.96" fill="none">
      <path
        transform="matrix(1,0,0,-1,1007.3075,111.57886)"
        d="M0 0V-526.849H116.938V-308.479L410.54-655.73 701.627-308.479V-535.439H820.031V0L410.54-435.476Z"
        fill={mono ?? "#2E3192"}
      />
      <path
        transform="matrix(1,0,0,-1,1417.847,1197.5475)"
        d="M0 0-410.54 506.521V708.96L0 238.904 409.492 708.96V506.521Z"
        fill={mono ?? "#FFFFFF"}
      />
    </svg>
  );
}

export function MathVisionMark({
  size = 34,
  bare = false,
  mono,
}: {
  size?: number;
  /** Render only the chevron (no orange tile) — for use on the brand orange. */
  bare?: boolean;
  /** Force a single chevron color (e.g. white) for monochrome contexts. */
  mono?: string;
}) {
  if (bare) return <Chevron size={size} mono={mono} />;
  const radius = Math.round(size * 0.23);
  return (
    <span
      className="grid place-items-center shrink-0"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: "var(--berry)",
        boxShadow: "0 6px 14px -8px rgba(241, 90, 41, 0.95)",
      }}
      aria-hidden
    >
      <Chevron size={size * 0.62} mono={mono} />
    </span>
  );
}

export function Logo({
  compact = false,
  tone = "dark",
}: {
  compact?: boolean;
  tone?: "dark" | "light";
}) {
  const light = tone === "light";
  return (
    <span className="inline-flex items-center gap-2.5 select-none">
      <MathVisionMark size={34} />
      {!compact && (
        <span className="leading-none">
          <span
            className="block"
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              fontSize: 17,
              letterSpacing: "-0.02em",
              color: light ? "#fff" : "var(--ink)",
            }}
          >
            Math
            <span style={{ color: light ? "#ffd766" : "var(--grape)" }}>Vision</span>
          </span>
          <span
            className="mono block"
            style={{
              fontSize: 10.5,
              color: light ? "rgba(255,255,255,0.72)" : "var(--ink-soft)",
              letterSpacing: "0.14em",
            }}
          >
            MATERIALS
          </span>
        </span>
      )}
    </span>
  );
}
