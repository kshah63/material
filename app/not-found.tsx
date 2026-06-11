import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function NotFound() {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center text-center px-6">
      <div className="mb-8">
        <Logo />
      </div>
      <p className="mono" style={{ fontSize: 12, letterSpacing: "0.1em", color: "var(--honey-deep)" }}>
        404
      </p>
      <h1 style={{ fontSize: 36, marginTop: 8 }}>
        Nothing on this <span className="marker-name">shelf</span>
      </h1>
      <p style={{ color: "var(--ink-soft)", marginTop: 10, maxWidth: 380 }}>
        This page may have moved, or you may not have access to it.
      </p>
      <Link href="/courses" className="btn btn-primary mt-6">
        Back to your courses
      </Link>
    </main>
  );
}
