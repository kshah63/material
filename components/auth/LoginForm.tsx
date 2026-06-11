"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SpinnerIcon, MarkerIcon } from "@/components/icons";

type Mode = "password" | "magic";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "password") {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        router.push(next);
        router.refresh();
      } else {
        const { error } = await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
          },
        });
        if (error) throw error;
        setSent(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="text-center rise">
        <div
          className="mx-auto grid place-items-center rounded-full mb-4"
          style={{ width: 56, height: 56, background: "var(--marker)" }}
        >
          <MarkerIcon width={26} height={26} style={{ color: "var(--marker-ink)" }} />
        </div>
        <h2 style={{ fontSize: 22 }}>Check your inbox</h2>
        <p style={{ color: "var(--ink-soft)", marginTop: 8 }}>
          We sent a sign-in link to <strong>{email}</strong>. Open it on this
          device to continue.
        </p>
        <button
          className="btn btn-quiet mt-4"
          onClick={() => {
            setSent(false);
            setMode("password");
          }}
        >
          Use a password instead
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="rise">
      <div className="mb-4">
        <label className="label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          className="field"
          placeholder="you@mathvision.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      {mode === "password" && (
        <div className="mb-4">
          <label className="label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            className="field"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
      )}

      {error && (
        <p
          className="mb-3"
          style={{ color: "var(--berry-deep)", fontSize: 13.5, fontWeight: 700 }}
          role="alert"
        >
          {error}
        </p>
      )}

      <button type="submit" className="btn btn-primary w-full justify-center" disabled={busy}>
        {busy ? (
          <SpinnerIcon />
        ) : mode === "password" ? (
          "Sign in"
        ) : (
          "Email me a sign-in link"
        )}
      </button>

      <button
        type="button"
        className="btn btn-quiet w-full justify-center mt-2"
        onClick={() => {
          setError(null);
          setMode(mode === "password" ? "magic" : "password");
        }}
      >
        {mode === "password"
          ? "No password? Email me a link instead"
          : "Sign in with a password"}
      </button>
    </form>
  );
}
