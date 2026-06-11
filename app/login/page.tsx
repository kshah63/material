import { Logo } from "@/components/Logo";
import { LoginForm } from "@/components/auth/LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next = "/courses", error } = await searchParams;

  return (
    <main className="min-h-dvh grid lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel */}
      <aside
        className="hidden lg:flex flex-col justify-between p-12 text-ink relative overflow-hidden"
        style={{ background: "var(--paper-2)" }}
      >
        <Logo />
        <div className="relative z-10 max-w-md">
          <p
            className="mono mb-4"
            style={{ color: "var(--honey-deep)", fontSize: 12, letterSpacing: "0.1em" }}
          >
            COURSE MATERIALS, ORGANIZED
          </p>
          <h1 style={{ fontSize: 46, lineHeight: 1.02 }}>
            Every worksheet,
            <br />
            note, and packet —
            <br />
            <span className="marker-name">in one place</span>.
          </h1>
          <p style={{ color: "var(--ink-soft)", marginTop: 18, fontSize: 16 }}>
            A shared shelf for each course. Teachers curate; students study. The
            butter-yellow highlight marks what&apos;s for teachers&apos; eyes only.
          </p>
        </div>
        <div
          className="mono"
          style={{ color: "var(--ink-faint)", fontSize: 12 }}
        >
          MathVision · staff & students
        </div>
        {/* ambient graph corner */}
        <div
          aria-hidden
          className="absolute -right-24 -bottom-24 rounded-full"
          style={{
            width: 360,
            height: 360,
            background:
              "radial-gradient(circle at 30% 30%, rgba(255,215,102,0.5), transparent 60%)",
          }}
        />
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
