import { Logo, MathVisionMark } from "@/components/Logo";
import { LoginForm } from "@/components/auth/LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next = "/courses", error } = await searchParams;

  return (
    <main className="min-h-dvh grid lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel — MathVision orange, with an indigo wash and the chevron */}
      <aside
        className="hidden lg:flex flex-col justify-between p-12 relative overflow-hidden"
        style={{
          background:
            "linear-gradient(155deg, #f15a29 0%, #ec4f22 52%, #d8431a 100%)",
        }}
      >
        <Logo tone="light" />
        <div className="relative z-10 max-w-md">
          <p
            className="mono mb-4"
            style={{ color: "rgba(255,255,255,0.78)", fontSize: 12, letterSpacing: "0.12em" }}
          >
            COURSE MATERIALS, ORGANIZED
          </p>
          <h1 style={{ fontSize: 46, lineHeight: 1.04, color: "#fff" }}>
            Every worksheet,
            <br />
            note, and packet —
            <br />
            <span style={{ color: "#ffd766" }}>in one place</span>.
          </h1>
          <p style={{ color: "rgba(255,255,255,0.86)", marginTop: 18, fontSize: 16 }}>
            A shared shelf for each course. Teachers curate; students study. The
            butter-yellow highlight marks what&apos;s for teachers&apos; eyes only.
          </p>
        </div>
        <div className="mono relative z-10" style={{ color: "rgba(255,255,255,0.7)", fontSize: 12 }}>
          MathVision · staff &amp; students
        </div>
        {/* ambient indigo glow */}
        <div
          aria-hidden
          className="absolute -left-32 -top-24 rounded-full"
          style={{
            width: 420,
            height: 420,
            background: "radial-gradient(circle at 50% 50%, rgba(46,49,146,0.55), transparent 62%)",
          }}
        />
        {/* oversized watermark chevron */}
        <div
          aria-hidden
          className="absolute"
          style={{ right: -90, bottom: -70, opacity: 0.12 }}
        >
          <MathVisionMark size={420} bare mono="#ffffff" />
        </div>
      </aside>

      {/* Form panel */}
      <section className="flex items-center justify-center p-6">
        <div className="w-full" style={{ maxWidth: 380 }}>
          <div className="lg:hidden mb-8">
            <Logo />
          </div>
          <h2 style={{ fontSize: 28, marginBottom: 6 }}>Welcome back</h2>
          <p style={{ color: "var(--ink-soft)", marginBottom: 24 }}>
            Sign in to reach your courses.
          </p>
          {error && (
            <p
              className="mb-4 card"
              style={{
                padding: "10px 14px",
                color: "var(--berry-deep)",
                fontSize: 13.5,
                fontWeight: 700,
                borderColor: "#f1c7cd",
              }}
            >
              That sign-in link didn&apos;t work. Try again below.
            </p>
          )}
          <LoginForm next={next} />
        </div>
      </section>
    </main>
  );
}
